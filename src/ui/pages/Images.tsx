import React from 'react';
import config from '../config';
import styles from './Images.module.css';
import { Tweet } from '../../core/Tweet';

type Props = {
    imageTweets: [string, Tweet[]][];
};

export default ({ imageTweets }: Props) => (
    <div className={styles.listContainer}>
        {imageTweets
            .sort(([_, tw1], [__, tw2]) => tw2[0].timestamp - tw1[0].timestamp)
            .sort(([_, tw1], [__, tw2]) => tw2.length - tw1.length)
            .map(([filename, tweets]) => (
                <div className={styles.itemContainer} key={filename}>
                    <img className={styles.image} src={`${config.apiEndpoint}/image/${filename}`} />
                    {tweets.map((tweet) => (
                        <a
                            key={`${tweet.authorId}:${tweet.tweetId}`}
                            className={styles.link}
                            href={`https://twitter.com/${tweet.authorId}/status/${tweet.tweetId}`}
                        >
                            [{new Date(tweet.timestamp).toLocaleTimeString()}] {tweet.authorName} - {tweet.text}
                        </a>
                    ))}
                </div>
            ))}
    </div>
);

export async function getServerSideProps() {
    const res = await fetch(`${config.apiEndpoint}/image-tweets`);
    const imageTweets = await res.json();
    return { props: { imageTweets } };
}
