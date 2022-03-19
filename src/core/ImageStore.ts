import https from 'https';
import fs from 'fs';
import resemble from 'resemblejs';

import { Image } from './Image';
import { Tweet } from './Tweet';

const IMAGE_JSON_PATH = './data/images.json';
const IMAGE_MISMATCH_THRESHOLD = 25;

export class ImageStore {
    canonicalImages: Image[];
    tweetsByImageName: Map<string, Tweet[]>;

    constructor() {
        this.canonicalImages = [];
        this.tweetsByImageName = new Map();
        const json = JSON.parse(fs.readFileSync(IMAGE_JSON_PATH, 'utf8'));
        for (const image of json) {
            this.canonicalImages.push({
                filename: image.filename,
                width: image.width,
                height: image.height,
                buffer: fs.readFileSync(`./data/images/${image.filename}`),
            });
            const tweets = this.tweetsByImageName.get(image.filename) || [];
            for (const tweet of image.tweets) {
                tweets.push(tweet);
            }
            this.tweetsByImageName.set(image.filename, tweets);
        }
    }

    resolve = (imageUrl: string) =>
        new Promise<void>((resolve, reject) => {
            const filename = imageUrl.split('/').slice(-1)[0];
            const ext = filename.split('.').slice(-1)[0];
            const tempFilePath = `./data/images/temp.${ext}`;
            const tempFile = fs.createWriteStream(tempFilePath);
            https
                .get(imageUrl, (response) => {
                    const chunks: any[] = [];
                    response.pipe(tempFile);
                    response.on('data', (chunk) => chunks.push(chunk));
                    tempFile.on('finish', () => {
                        tempFile.close(async () => {
                            const tempImageBuffer = Buffer.concat(chunks);
                            let isNewImage = true;
                            for (const otherImage of this.canonicalImages) {
                                const result = await resemble.compareImages(tempImageBuffer, otherImage.buffer, {
                                    returnEarlyThreshold: IMAGE_MISMATCH_THRESHOLD + 5,
                                    scaleToSameSize: true,
                                    ignore: 'colors',
                                });
                                const mismatch = +result.misMatchPercentage;
                                if (mismatch < IMAGE_MISMATCH_THRESHOLD) {
                                    isNewImage = false;
                                    break;
                                }
                            }
                            if (isNewImage) {
                                await fs.promises.rename(tempFilePath, `./data/images/${filename}`);
                            } else {
                                await fs.promises.rm(tempFilePath);
                            }
                            resolve();
                        });
                    });
                })
                .on('error', (err) => {
                    reject(err);
                });
        });

    persist() {
        fs.writeFileSync(
            IMAGE_JSON_PATH,
            JSON.stringify(
                this.canonicalImages.map((image) => ({
                    filename: image.filename,
                    width: image.width,
                    height: image.height,
                    tweets: this.tweetsByImageName.get(image.filename),
                }))
            )
        );
    }
}
