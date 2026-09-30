import { spawn } from 'child_process';
import { logger } from './logger';

export class ThumbnailService {
  private cache: Map<string, string> = new Map();

  /**
   * Generates a base64 data URL thumbnail from an EXR image file.
   */
  public async generateThumbnail(
    exrFilePath: string,
    ffmpegPath: string = 'ffmpeg',
    maxWidth: number = 640
  ): Promise<string | null> {
    if (this.cache.has(exrFilePath)) {
      return this.cache.get(exrFilePath)!;
    }

    return new Promise((resolve) => {
      logger.info(`Generating thumbnail for: ${exrFilePath}`);

      // We scale keeping aspect ratio, clamp width to maxWidth, and export to stdout as mjpeg
      const args = [
        '-y',
        '-i',
        exrFilePath,
        '-vf',
        `scale='min(${maxWidth},iw)':-1:flags=fast_bilinear`,
        '-vframes',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-q:v',
        '4',
        'pipe:1',
      ];

      const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];

      child.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      let stderr = '';
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        logger.warn(`Thumbnail generation spawn error: ${err.message}`);
        resolve(null);
      });

      child.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          const buffer = Buffer.concat(chunks);
          const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          this.cache.set(exrFilePath, dataUrl);
          logger.info(`Thumbnail generated successfully (${(buffer.length / 1024).toFixed(1)} KB)`);
          resolve(dataUrl);
        } else {
          logger.warn(`Thumbnail generation failed with code ${code}. Stderr: ${stderr.slice(-300)}`);
          resolve(null);
        }
      });
    });
  }

  public clearCache() {
    this.cache.clear();
  }
}

export const thumbnailService = new ThumbnailService();
