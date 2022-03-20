import fs from 'fs';
import { Image } from '../core/Image';
import { Tweet } from '../core/Tweet';

const IMAGE_TWEETS_JSON_PATH = './data/image_tweets.json';

type ImageTweetsJson = {
    imageFilename: string;
    compoundTweetIds: string[];
};

export class ImageTweetsStore {
    compoundTweetIdsByImageFilename: Map<string, Set<string>>;

    constructor() {
        this.compoundTweetIdsByImageFilename = new Map();
        const json = JSON.parse(fs.readFileSync(IMAGE_TWEETS_JSON_PATH, 'utf8')) as ImageTweetsJson[];
        for (const assoc of json) {
            this.compoundTweetIdsByImageFilename.set(assoc.imageFilename, new Set(assoc.compoundTweetIds));
        }
    }

    add(image: Image, tweet: Tweet) {
        const compoundTweetId = `${tweet.authorId}:${tweet.tweetId}`;
        const tweets = this.compoundTweetIdsByImageFilename.get(image.filename) || new Set();
        tweets.add(compoundTweetId);
        this.compoundTweetIdsByImageFilename.set(image.filename, tweets);
    }

    persist() {
        const jsonValues: ImageTweetsJson[] = Array.from(
            this.compoundTweetIdsByImageFilename.entries(),
            ([filename, ids]) => ({
                imageFilename: filename,
                compoundTweetIds: Array.from(ids),
            })
        );
        const json = JSON.stringify(jsonValues);
        fs.writeFileSync(IMAGE_TWEETS_JSON_PATH, json);
    }
}
