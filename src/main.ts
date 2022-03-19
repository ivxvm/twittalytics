import { TwitterApi, ETwitterStreamEvent } from 'twitter-api-v2';
import secrets from './config/secrets';
import { ImageStore } from './core/ImageStore';

const imageStore = new ImageStore();
const twitterApi = new TwitterApi(secrets.bearerToken);
const client = twitterApi.readOnly;

await client.v2.updateStreamRules({
    add: [{ value: 'Ukraine' }],
});

const stream = await client.v2.searchStream({
    // https://developer.twitter.com/en/docs/twitter-api/tweets/lookup/api-reference/get-tweets
    'tweet.fields': ['author_id', 'id', 'attachments', 'text'],
    'media.fields': ['type', 'url', 'width', 'height'],
    'user.fields': ['name'],
    expansions: ['attachments.media_keys', 'author_id'],
});

stream.autoReconnect = true;

stream.on(ETwitterStreamEvent.Data, async (tweet) => {
    console.log(tweet);
    // if (tweet.includes && tweet.includes.media.type === "image") {
    // await processImage(tweet.includes.media.url);
    // console.log(tweet.includes.media);
    // }
});
