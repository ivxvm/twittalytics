import fs from 'fs';
import { Tweet } from '../core/Tweet';

const TWEETS_JSON_PATH = './data/tweets.json';

export class TweetStore {
    tweetByCompoundId: Map<string, Tweet>;

    constructor() {
        this.tweetByCompoundId = new Map();
        const json = JSON.parse(fs.readFileSync(TWEETS_JSON_PATH, 'utf8')) as Tweet[];
        for (const tweet of json) {
            this.add(tweet);
        }
    }

    add(tweet: Tweet) {
        const compoundId = `${tweet.authorId}:${tweet.tweetId}`;
        this.tweetByCompoundId.set(compoundId, tweet);
    }

    persist() {
        const json = JSON.stringify(Array.from(this.tweetByCompoundId.values()));
        fs.writeFileSync(TWEETS_JSON_PATH, json);
    }
}
