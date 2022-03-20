import https from 'https';
import fs from 'fs';
import resemble from 'resemblejs';
import { ResembleSingleCallbackComparisonOptions, ResembleSingleCallbackComparisonResult } from 'resemblejs';
import { MediaObjectV2 } from 'twitter-api-v2';
import { Image } from '../core/Image';

const IMAGE_JSON_PATH = './data/images.json';
const IMAGE_MISMATCH_THRESHOLD = 25;

const compareImages = (a: Buffer, b: Buffer, opts: ResembleSingleCallbackComparisonOptions) =>
    new Promise<ResembleSingleCallbackComparisonResult>((resolve, reject) =>
        resemble.compare(a, b, opts, (err, res) => (err ? reject(err) : resolve(res)))
    );

type ImageJson = {
    filename: string;
    width: number;
    height: number;
};

export class ImageStore {
    canonicalImagesByFilename: Map<string, Image>;
    tempImageCounter: number;

    constructor() {
        this.canonicalImagesByFilename = new Map();
        this.tempImageCounter = 0;
        const imagesJson: ImageJson[] = JSON.parse(fs.readFileSync(IMAGE_JSON_PATH, 'utf8'));
        for (const imageJson of imagesJson) {
            this.canonicalImagesByFilename.set(imageJson.filename, {
                filename: imageJson.filename,
                width: imageJson.width,
                height: imageJson.height,
                buffer: fs.readFileSync(`./data/images/${imageJson.filename}`),
            });
        }
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
                    const chunks: any[] = [];
                    response.pipe(tempFile);
                    response.on('data', (chunk) => chunks.push(chunk));
                    tempFile.on('finish', () => {
                        tempFile.close(async () => {
                            const tempImageBuffer = Buffer.concat(chunks);
                            for (const otherImage of this.canonicalImagesByFilename.values()) {
                                const result = await compareImages(tempImageBuffer, otherImage.buffer, {
                                    returnEarlyThreshold: IMAGE_MISMATCH_THRESHOLD + 5,
                                    scaleToSameSize: true,
                                    ignore: 'colors',
                                });
                                const mismatch = +result.misMatchPercentage;
                                if (mismatch < IMAGE_MISMATCH_THRESHOLD) {
                                    await fs.promises.rm(tempFilePath);
                                    resolve(otherImage);
                                    return;
                                }
                            }
                            await fs.promises.rename(tempFilePath, `./data/images/${filename}`);
                            const image = {
                                filename,
                                width: media.width || -1,
                                height: media.height || -1,
                                buffer: tempImageBuffer,
                            };
                            this.canonicalImagesByFilename.set(filename, image);
                            resolve(image);
                        });
                    });
                })
                .on('error', (err) => {
                    reject(err);
                });
        });

    persist() {
        const imagesJson: ImageJson[] = Array.from(this.canonicalImagesByFilename.values(), (image) => ({
            filename: image.filename,
            width: image.width,
            height: image.height,
        }));
        fs.writeFileSync(IMAGE_JSON_PATH, JSON.stringify(imagesJson));
    }
}
