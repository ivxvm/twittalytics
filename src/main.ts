import fs from 'fs';
import { TwitterApi, ETwitterStreamEvent, MediaObjectV2, TwitterApiReadOnly } from 'twitter-api-v2';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

import { Image } from './core/Image';
import { Tweet } from './core/Tweet';

import { ImageStore } from './stores/ImageStore';
import { TweetStore } from './stores/TweetStore';
import { ImageTweetsStore } from './stores/ImageTweetsStore';

import secrets from './config/secrets';

const MEDIA_PROCESSING_INTERVAL_MS = 250;
const STORE_PERSIST_INTERVAL_MS = 10_000;

class App {
    imageStore: ImageStore;
    tweetStore: TweetStore;
    imageTweetsStore: ImageTweetsStore;
    twitterApi: TwitterApi;
    twitterClient: TwitterApiReadOnly;
    mediaQueue: [Tweet, MediaObjectV2][];
    isProcessingMedia: boolean;

    constructor() {
        this.imageStore = new ImageStore();
        this.tweetStore = new TweetStore();
        this.imageTweetsStore = new ImageTweetsStore();
        this.twitterApi = new TwitterApi(secrets.bearerToken);
        this.twitterClient = this.twitterApi.readOnly;
        this.mediaQueue = [];
        this.isProcessingMedia = false;
        this.bindExitHandlers();
    }

    bindExitHandlers() {
        for (const event of ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'uncaughtException', 'SIGTERM']) {
            process.on(event, (...args) => this.handleExit(event, args));
        }
    }

    persistAllStores() {
        console.log('Persisting stores');
        this.imageStore.persist();
        this.tweetStore.persist();
        this.imageTweetsStore.persist();
    }

    async startStreamingTweets() {
        console.log('Starting tweet streaming');
        await this.twitterClient.v2.updateStreamRules({
            add: [{ value: 'Ukraine' }],
        });
        const stream = await this.twitterClient.v2.searchStream({
            // https://developer.twitter.com/en/docs/twitter-api/tweets/lookup/api-reference/get-tweets
            'tweet.fields': ['author_id', 'id', 'attachments', 'text'],
            'media.fields': ['type', 'url', 'width', 'height'],
            'user.fields': ['name'],
            expansions: ['attachments.media_keys', 'author_id'],
        });
        stream.autoReconnect = true;
        stream.on(ETwitterStreamEvent.Data, async (rawTweet) => {
            const tweet: Tweet = {
                tweetId: rawTweet.data.id,
                authorId: rawTweet.data.author_id || 'none',
                authorName: rawTweet.includes?.users?.[0]?.name || 'none',
                text: rawTweet.data.text,
            };
            const sanitizedTweetPreview = tweet.text.slice(0, 32).replace(/(\r\n|\r|\n)/g, ' ');
            if (rawTweet.includes && rawTweet.includes.media) {
                for (const media of rawTweet.includes.media) {
                    if (media.type === 'photo' && media.url) {
                        console.log(`Enqueueing image tweet "${sanitizedTweetPreview}..." (${media.url})`);
                        this.mediaQueue.push([tweet, media]);
                    }
                }
            } else {
                console.log(`Skipping text tweet "${sanitizedTweetPreview}..."`);
            }
        });
    }

    startMediaProcessingJob() {
        console.log('Starting media processing job');
        setInterval(async () => {
            if (!this.isProcessingMedia && this.mediaQueue.length > 0) {
                this.isProcessingMedia = true;
                const [tweet, media] = this.mediaQueue.shift()!;
                console.log(`Processing image ${media.url}`);
                const image: Image = await this.imageStore.addFromMediaObject(media);
                this.tweetStore.add(tweet);
                this.imageTweetsStore.add(image, tweet);
                this.isProcessingMedia = false;
            }
        }, MEDIA_PROCESSING_INTERVAL_MS);
    }

    startStorePersistenceJob() {
        console.log('Starting store persistence job');
        setInterval(() => {
            this.persistAllStores();
        }, STORE_PERSIST_INTERVAL_MS);
    }

    startFrontend() {
        // https://nextjs.org/docs/advanced-features/custom-server
        const dev = process.env.NODE_ENV !== 'production';
        const hostname = 'localhost';
        const port = 3000;
        // when using middleware `hostname` and `port` must be provided below
        const app = next({ dev, hostname, port, dir: './src/ui' });
        const handle = app.getRequestHandler();
        app.prepare().then(() => {
            createServer(async (req, res) => {
                try {
                    // Be sure to pass `true` as the second argument to `url.parse`.
                    // This tells it to parse the query portion of the URL.
                    const parsedUrl = parse(req.url!, true);
                    const { pathname, query } = parsedUrl;
                    if (pathname === '/a') {
                        await app.render(req, res, '/a', query);
                    } else if (pathname === '/b') {
                        await app.render(req, res, '/b', query);
                    } else {
                        await handle(req, res, parsedUrl);
                    }
                } catch (err) {
                    console.error('Error occurred handling', req.url, err);
                    res.statusCode = 500;
                    res.end('internal server error');
                }
            }).listen(port, () => {
                console.log(`Serving frontend at http://${hostname}:${port}`);
            });
        });
    }

    handleExit = (event: string, args: any) => {
        console.log(`Received '${event}' with ${args}`);
        this.persistAllStores();
        process.exit();
    };
}

if (!fs.existsSync('./data/images')) {
    fs.mkdirSync('./data/images', { recursive: true });
}

const app = new App();

app.startStreamingTweets();
app.startMediaProcessingJob();
app.startStorePersistenceJob();
app.startFrontend();
