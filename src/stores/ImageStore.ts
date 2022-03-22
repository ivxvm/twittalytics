import https from 'https';
import fs from 'fs';
import { ResembleSingleCallbackComparisonOptions, ResembleSingleCallbackComparisonResult } from 'resemblejs';
import { MediaObjectV2 } from 'twitter-api-v2';
import { StaticPool } from 'node-worker-threads-pool';
import { Image } from '../core/Image';

const IMAGES_DIR = './data/images';
const IMAGE_JSON_PATH = './data/images.json';
const IMAGE_MISMATCH_THRESHOLD = 25;

type FindSimilarImageTask = (param: {
    imagePath: string;
    otherImagesDir: string;
    imageMismatchThreshold: number;
}) => Promise<string | undefined>;

const findSimilarImageTask: FindSimilarImageTask = async ({ imagePath, otherImagesDir, imageMismatchThreshold }) => {
    const fs = require('fs');
    const path = require('path');
    const resemble = require('resemblejs');
    const compareImages = (a: Buffer, b: Buffer, opts: ResembleSingleCallbackComparisonOptions) =>
        new Promise<ResembleSingleCallbackComparisonResult>((resolve, reject) =>
            resemble.compare(a, b, opts, (err: any, res: any) => (err ? reject(err) : resolve(res)))
        );
    console.log(`Searching for image similar to '${imagePath}'`);
    const imageBuffer = await fs.promises.readFile(imagePath);
    for (const otherImageFilename of await fs.promises.readdir(otherImagesDir)) {
        const otherImagePath = `${otherImagesDir}/${otherImageFilename}`;
        if (imagePath === otherImagePath) continue;
        console.log(`Comparing images '${imagePath}' and '${otherImagePath}'`);
        const otherImageBuffer = await fs.promises.readFile(otherImagePath);
        const result = await compareImages(imageBuffer, otherImageBuffer, {
            returnEarlyThreshold: imageMismatchThreshold + 5,
            scaleToSameSize: true,
            ignore: 'colors',
        });
        const mismatch = +result.misMatchPercentage;
        if (mismatch < imageMismatchThreshold) {
            console.log(`Found similar image '${otherImagePath}' (${100 - mismatch}% similar)`);
            return path.basename(otherImagePath);
        }
    }
};

export class ImageStore {
    canonicalImagesByFilename: Map<string, Image>;
    tempImageCounter: number;
    findSimilarImageThreadPool: StaticPool<FindSimilarImageTask>;

    constructor() {
        this.canonicalImagesByFilename = new Map();
        this.tempImageCounter = 0;
        const images: Image[] = fs.existsSync(IMAGE_JSON_PATH)
            ? JSON.parse(fs.readFileSync(IMAGE_JSON_PATH, 'utf8'))
            : [];
        for (const image of images) {
            this.canonicalImagesByFilename.set(image.filename, image);
        }
        this.findSimilarImageThreadPool = new StaticPool({
            size: 1,
            task: findSimilarImageTask,
        });
    }

    addFromMediaObject = (media: MediaObjectV2) =>
        new Promise<Image>((resolve, reject) => {
            if (!media.url) {
                reject(new Error('media.url is undefined'));
                return;
            }
            const filename = media.url.split('/').slice(-1)[0];
            const existingImage = this.canonicalImagesByFilename.get(filename);
            if (existingImage) {
                resolve(existingImage);
                return;
            }
            const ext = filename.split('/').slice(-1)[0];
            const tempFilePath = `./data/images/temp_${this.tempImageCounter++}.${ext}`;
            const tempFile = fs.createWriteStream(tempFilePath);
            https
                .get(media.url, (response) => {
                    response.pipe(tempFile);
                    tempFile.on('finish', () => {
                        tempFile.close(async () => {
                            const similarImageFilename = await this.findSimilarImageThreadPool.exec({
                                imagePath: tempFilePath,
                                otherImagesDir: IMAGES_DIR,
                                imageMismatchThreshold: IMAGE_MISMATCH_THRESHOLD,
                            });
                            if (similarImageFilename) {
                                await fs.promises.rm(tempFilePath);
                                resolve(this.canonicalImagesByFilename.get(similarImageFilename)!);
                            } else {
                                await fs.promises.rename(tempFilePath, `${IMAGES_DIR}/${filename}`);
                                const image = {
                                    filename,
                                    width: media.width || -1,
                                    height: media.height || -1,
                                };
                                this.canonicalImagesByFilename.set(filename, image);
                                resolve(image);
                            }
                        });
                    });
                })
                .on('error', (err) => {
                    reject(err);
                });
        });

    persist() {
        fs.writeFileSync(IMAGE_JSON_PATH, JSON.stringify(Array.from(this.canonicalImagesByFilename.values())));
    }
}
