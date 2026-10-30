import { spawn, ChildProcess, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { BrowserWindow } from 'electron';
import {
  WatermarkBatchResult,
  WatermarkItem,
  WatermarkItemStatus,
  WatermarkMediaType,
  WatermarkOptions,
  WatermarkProgressEvent,
  WatermarkScanResult,
} from '../../shared/types';
import { ffmpegService } from './ffmpegService';
import { hardwareDetector } from './hardwareDetector';
import { logger } from './logger';
import {
  applyVideoResidualCleanup,
  BufferCanvasContextLike,
  calculateWatermarkPosition,
  detectVideoWatermarkFromFrames,
  detectWatermarkConfig,
  getEmbeddedAlphaMap,
  ImageDataLike,
  removeWatermark,
  removeWatermarkFromImageDataSync,
  resolveVideoWatermarkCandidates,
  scoreVideoWatermarkFrame,
  selectVideoWatermarkDetectionForFrame,
  VIDEO_DENOISE_BACKENDS,
  VideoSampleFrame,
} from './watermark/gwrEngine';

export const SUPPORTED_IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
]);

export const SUPPORTED_VIDEO_EXTS = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
  '.m4v',
]);

class BufferCanvasContext implements BufferCanvasContextLike {
  public readonly canvas: { width: number; height: number };

  constructor(
    public data: Uint8ClampedArray,
    width: number,
    height: number
  ) {
    this.canvas = { width, height };
  }

  public getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike {
    const out = new Uint8ClampedArray(sw * sh * 4);
    const fullW = this.canvas.width;
    const fullH = this.canvas.height;
    const startX = Math.max(0, sx);
    const endX = Math.min(fullW, sx + sw);
    if (endX <= startX) {
      return { width: sw, height: sh, data: out };
    }

    for (let y = 0; y < sh; y++) {
      const srcY = sy + y;
      if (srcY < 0 || srcY >= fullH) continue;
      const srcStart = (srcY * fullW + startX) * 4;
      const srcEnd = (srcY * fullW + endX) * 4;
      const dstStart = (y * sw + (startX - sx)) * 4;
      out.set(this.data.subarray(srcStart, srcEnd), dstStart);
    }
    return { width: sw, height: sh, data: out };
  }

  public putImageData(imageData: ImageDataLike, dx: number, dy: number): void {
    const sw = imageData.width;
    const sh = imageData.height;
    const fullW = this.canvas.width;
    const fullH = this.canvas.height;
    const startX = Math.max(0, dx);
    const endX = Math.min(fullW, dx + sw);
    if (endX <= startX) return;

    for (let y = 0; y < sh; y++) {
      const dstY = dy + y;
      if (dstY < 0 || dstY >= fullH) continue;
      const srcStart = (y * sw + (startX - dx)) * 4;
      const srcEnd = srcStart + (endX - startX) * 4;
      const dstStart = (dstY * fullW + startX) * 4;
      this.data.set(imageData.data.subarray(srcStart, srcEnd), dstStart);
    }
  }
}

interface ProbedMediaInfo {
  width: number;
  height: number;
  fpsNum: number;
  frameRateRational: string;
  durationSeconds: number;
  totalFrames: number;
  bitrateBps: number;
}

export class WatermarkService {
  private mainWindow: BrowserWindow | null = null;
  private isCancelling = false;
  private activeChildProcesses = new Set<ChildProcess>();
  private hasLibWebpEncoderCache: boolean | null = null;

  public setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  public getMediaType(filePath: string): WatermarkMediaType | null {
    const ext = path.extname(filePath).toLowerCase();
    if (SUPPORTED_IMAGE_EXTS.has(ext)) return 'image';
    if (SUPPORTED_VIDEO_EXTS.has(ext)) return 'video';
    return null;
  }

  public isSupportedWatermarkPath(targetPath: string): boolean {
    try {
      if (!fs.existsSync(targetPath)) return false;
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) return true;
      if (stat.isFile()) return this.getMediaType(targetPath) !== null;
    } catch {
      return false;
    }
    return false;
  }

  public async selectFilesDialog(window: BrowserWindow | null): Promise<string[] | null> {
    if (!window) return null;
    const { dialog } = await import('electron');
    const res = await dialog.showOpenDialog(window, {
      title: 'Select Watermarked Images or Videos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Images & Videos',
          extensions: [
            'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff',
            'mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v',
          ],
        },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] },
        { name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths;
  }

  public async selectFoldersDialog(window: BrowserWindow | null): Promise<string[] | null> {
    if (!window) return null;
    const { dialog } = await import('electron');
    const res = await dialog.showOpenDialog(window, {
      title: 'Select Folder(s) with Watermarked Images or Videos',
      properties: ['openDirectory', 'multiSelections', 'createDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths;
  }

  /**
   * Scans any combination of single file, multiple files, single folder, or multiple folders.
   */
  public async scanPaths(rawPaths: string | string[]): Promise<WatermarkScanResult> {
    const inputList = (Array.isArray(rawPaths) ? rawPaths : [rawPaths])
      .filter((p) => typeof p === 'string' && p.trim().length > 0)
      .map((p) => path.resolve(p));

    const seenFiles = new Set<string>();
    const items: WatermarkItem[] = [];
    const rootPaths: string[] = [];
    let folderCount = 0;

    const addFileItem = (
      fullPath: string,
      stat: fs.Stats,
      sourceRootFolder?: string
    ) => {
      const normalized = process.platform === 'win32' ? fullPath.toLowerCase() : fullPath;
      if (seenFiles.has(normalized)) return;

      const mediaType = this.getMediaType(fullPath);
      if (!mediaType) return;

      seenFiles.add(normalized);
      const ext = path.extname(fullPath).toLowerCase();
      const relativePath = sourceRootFolder
        ? path.relative(sourceRootFolder, fullPath)
        : undefined;

      items.push({
        id: `wm_${Date.now()}_${items.length}_${Math.random().toString(36).slice(2, 7)}`,
        inputPath: fullPath,
        fileName: path.basename(fullPath),
        mediaType,
        extension: ext,
        fileSizeBytes: stat.size,
        sourceRootFolder,
        relativePath,
        status: 'pending',
        progress: 0,
      });
    };

    const walkDirectory = async (dirPath: string, rootFolder: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      } catch (err) {
        logger.warn(`Watermark scanner could not read folder ${dirPath}: ${err}`);
        return;
      }

      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (
          entry.name === 'node_modules' ||
          entry.name === 'Gemini_Cleaned' ||
          entry.name.endsWith('_Cleaned')
        ) {
          continue;
        }

        const fullEntryPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            await walkDirectory(fullEntryPath, rootFolder);
          } else if (entry.isFile()) {
            const st = await fs.promises.stat(fullEntryPath);
            addFileItem(fullEntryPath, st, rootFolder);
          }
        } catch {
          // Ignore unreadable entry
        }
      }
    };

    for (const candidatePath of inputList) {
      try {
        if (!fs.existsSync(candidatePath)) continue;
        const st = await fs.promises.stat(candidatePath);
        rootPaths.push(candidatePath);

        if (st.isDirectory()) {
          folderCount++;
          await walkDirectory(candidatePath, candidatePath);
        } else if (st.isFile()) {
          addFileItem(candidatePath, st, undefined);
        }
      } catch (err) {
        logger.warn(`Skipping invalid watermark input path ${candidatePath}: ${err}`);
      }
    }

    const imageCount = items.filter((i) => i.mediaType === 'image').length;
    const videoCount = items.filter((i) => i.mediaType === 'video').length;

    logger.info(
      `Watermark scan found ${items.length} media files (${imageCount} images, ${videoCount} videos across ${folderCount} folders)`
    );

    return {
      items,
      imageCount,
      videoCount,
      folderCount,
      rootPaths,
    };
  }

  private hasLibWebpEncoder(): boolean {
    if (this.hasLibWebpEncoderCache !== null) {
      return this.hasLibWebpEncoderCache;
    }
    try {
      const ffmpegBin = ffmpegService.getFfmpegPath();
      const out = execFileSync(ffmpegBin, ['-hide_banner', '-encoders'], {
        encoding: 'utf8',
        timeout: 4000,
      });
      this.hasLibWebpEncoderCache = /\blibwebp\b/.test(out);
    } catch {
      this.hasLibWebpEncoderCache = false;
    }
    return this.hasLibWebpEncoderCache;
  }

  /**
   * Computes output path for an item supporting single file, multiple files, single folder, and multiple folders.
   */
  public computeOutputPath(
    item: WatermarkItem,
    options: WatermarkOptions,
    context: { directFileCount: number; distinctRootFolders: number }
  ): string {
    const ext = this.resolveOutputExtension(item);
    const baseWithoutExt = path.basename(item.inputPath, path.extname(item.inputPath));
    const fileDir = path.dirname(item.inputPath);
    const mode = options.outputMode || 'auto';

    let candidateOut: string;

    if (mode === 'custom' && options.customOutputDir) {
      if (item.sourceRootFolder && item.relativePath) {
        const relWithoutExt = item.relativePath.slice(
          0,
          item.relativePath.length - path.extname(item.relativePath).length
        );
        const relOut = `${relWithoutExt}${ext}`;
        candidateOut =
          context.distinctRootFolders > 1
            ? path.join(options.customOutputDir, path.basename(item.sourceRootFolder), relOut)
            : path.join(options.customOutputDir, relOut);
      } else {
        candidateOut = path.join(options.customOutputDir, `${baseWithoutExt}${ext}`);
      }
    } else if (mode === 'suffix') {
      candidateOut = path.join(fileDir, `${baseWithoutExt}_clean${ext}`);
    } else if (mode === 'subfolder') {
      if (item.sourceRootFolder && item.relativePath) {
        const cleanRoot = item.sourceRootFolder.replace(/[/\\]+$/, '');
        const siblingDir = `${cleanRoot}_Cleaned`;
        const relWithoutExt = item.relativePath.slice(
          0,
          item.relativePath.length - path.extname(item.relativePath).length
        );
        candidateOut = path.join(siblingDir, `${relWithoutExt}${ext}`);
      } else {
        candidateOut = path.join(fileDir, 'Gemini_Cleaned', `${baseWithoutExt}${ext}`);
      }
    } else {
      // 'auto' smart default:
      // - Folder(s) -> <FolderName>_Cleaned/<relativePath> (preserves original filenames & subfolder tree)
      // - Single file -> <FileDir>/<name>_clean.<ext> right next to original file
      // - Multiple files -> <FileDir>/Gemini_Cleaned/<name>.<ext> neatly grouped
      if (item.sourceRootFolder && item.relativePath) {
        const cleanRoot = item.sourceRootFolder.replace(/[/\\]+$/, '');
        const siblingDir = `${cleanRoot}_Cleaned`;
        const relWithoutExt = item.relativePath.slice(
          0,
          item.relativePath.length - path.extname(item.relativePath).length
        );
        candidateOut = path.join(siblingDir, `${relWithoutExt}${ext}`);
      } else if (context.directFileCount <= 1) {
        candidateOut = path.join(fileDir, `${baseWithoutExt}_clean${ext}`);
      } else {
        candidateOut = path.join(fileDir, 'Gemini_Cleaned', `${baseWithoutExt}${ext}`);
      }
    }

    // Never overwrite original input file
    if (path.resolve(candidateOut) === path.resolve(item.inputPath)) {
      candidateOut = path.join(fileDir, `${baseWithoutExt}_clean${ext}`);
    }

    return candidateOut;
  }

  private resolveOutputExtension(item: WatermarkItem): string {
    const ext = item.extension.toLowerCase();
    if (item.mediaType === 'image') {
      if (ext === '.webp' && !this.hasLibWebpEncoder()) {
        // Fallback to lossless PNG when FFmpeg lacks libwebp encoder
        return '.png';
      }
      return ext;
    }
    // Video output extension: keep .mp4, .mov, .m4v directly; transcode .webm/.mkv/.avi to universal .mp4
    if (ext === '.mov' || ext === '.mp4' || ext === '.m4v') {
      return ext;
    }
    return '.mp4';
  }

  public cancelBatch(): boolean {
    this.isCancelling = true;
    for (const proc of this.activeChildProcesses) {
      try {
        if (os.platform() === 'win32' && proc.pid) {
          spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { windowsHide: true });
        } else {
          proc.kill('SIGKILL');
        }
      } catch {
        // Ignore termination errors
      }
    }
    this.activeChildProcesses.clear();
    logger.warn('Watermark removal batch cancelled by user.');
    return true;
  }

  private emitProgress(event: WatermarkProgressEvent, onProgress?: (e: WatermarkProgressEvent) => void) {
    if (onProgress) {
      onProgress(event);
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('watermark:progress', event);
    }
  }

  /**
   * Processes a batch of WatermarkItems (or raw paths if passed) sequentially/concurrently.
   */
  public async processBatch(
    itemsInput: WatermarkItem[],
    options: WatermarkOptions = { outputMode: 'auto', copySkippedInFolderMode: true },
    onProgress?: (event: WatermarkProgressEvent) => void
  ): Promise<WatermarkBatchResult> {
    this.isCancelling = false;
    const batchId = `wmbatch_${Date.now()}`;
    const batchStart = Date.now();

    const items: WatermarkItem[] = itemsInput.map((item) => ({
      ...item,
      status: 'pending',
      progress: 0,
      error: undefined,
      skipReason: undefined,
    }));

    const directFileCount = items.filter((i) => !i.sourceRootFolder).length;
    const distinctRootFolders = new Set(
      items.map((i) => i.sourceRootFolder).filter(Boolean)
    ).size;

    let cleanedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let primaryOutputDir = '';

    for (let idx = 0; idx < items.length; idx++) {
      if (this.isCancelling) {
        for (let r = idx; r < items.length; r++) {
          items[r].status = 'cancelled';
        }
        break;
      }

      const item = items[idx];
      const itemStart = Date.now();
      const targetOutputPath = this.computeOutputPath(item, options, {
        directFileCount,
        distinctRootFolders,
      });

      if (!primaryOutputDir) {
        primaryOutputDir = path.dirname(targetOutputPath);
      }

      item.status = 'processing';
      item.outputPath = targetOutputPath;

      this.emitProgress(
        {
          batchId,
          itemId: item.id,
          itemIndex: idx,
          totalItems: items.length,
          itemProgress: 2,
          overallProgress: Math.round((idx / Math.max(1, items.length)) * 100),
          status: 'processing',
          outputPath: targetOutputPath,
        },
        onProgress
      );

      try {
        if (item.mediaType === 'image') {
          await this.processImageItem(item, targetOutputPath, options);
        } else {
          await this.processVideoItem(
            item,
            targetOutputPath,
            options,
            (videoPct) => {
              item.progress = videoPct;
              const overall = Math.min(
                99,
                Math.round(((idx + videoPct / 100) / Math.max(1, items.length)) * 100)
              );
              this.emitProgress(
                {
                  batchId,
                  itemId: item.id,
                  itemIndex: idx,
                  totalItems: items.length,
                  itemProgress: videoPct,
                  overallProgress: overall,
                  status: 'processing',
                  outputPath: item.outputPath,
                  width: item.width,
                  height: item.height,
                  watermarkDetected: item.watermarkDetected,
                  watermarkInfo: item.watermarkInfo,
                },
                onProgress
              );
            }
          );
        }

        item.processingTimeMs = Date.now() - itemStart;
        item.progress = 100;

        const finalStatus = item.status as WatermarkItemStatus;
        if (finalStatus === 'cleaned') {
          cleanedCount++;
        } else if (finalStatus === 'skipped') {
          skippedCount++;
        }
      } catch (err: any) {
        if (this.isCancelling) {
          item.status = 'cancelled';
          // Remove partial output file on cancel
          if (item.outputPath && fs.existsSync(item.outputPath)) {
            try {
              fs.unlinkSync(item.outputPath);
            } catch {}
          }
          break;
        }
        failedCount++;
        item.status = 'failed';
        item.error = err?.message || String(err);
        item.processingTimeMs = Date.now() - itemStart;
        logger.error(`Watermark removal failed for ${item.fileName}: ${item.error}`);
      }

      this.emitProgress(
        {
          batchId,
          itemId: item.id,
          itemIndex: idx,
          totalItems: items.length,
          itemProgress: 100,
          overallProgress: Math.round(((idx + 1) / Math.max(1, items.length)) * 100),
          status: item.status,
          outputPath: item.outputPath,
          width: item.width,
          height: item.height,
          watermarkDetected: item.watermarkDetected,
          watermarkInfo: item.watermarkInfo,
          skipReason: item.skipReason,
          error: item.error,
          processingTimeMs: item.processingTimeMs,
        },
        onProgress
      );
    }

    const elapsedMs = Date.now() - batchStart;
    logger.success(
      `Watermark batch finished in ${(elapsedMs / 1000).toFixed(1)}s: ${cleanedCount} cleaned, ${skippedCount} skipped, ${failedCount} failed`
    );

    return {
      batchId,
      items,
      cleanedCount,
      skippedCount,
      failedCount,
      cancelled: this.isCancelling,
      primaryOutputDir,
      elapsedMs,
    };
  }

  private async probeMedia(inputPath: string): Promise<ProbedMediaInfo> {
    const ffprobeBin = ffmpegService.getFfprobePath();
    return new Promise((resolve, reject) => {
      const args = [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,r_frame_rate,avg_frame_rate,duration,nb_frames,bit_rate',
        '-show_entries',
        'format=duration,bit_rate',
        '-of',
        'json',
        inputPath,
      ];

      const proc = spawn(ffprobeBin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => reject(new Error(`FFprobe error: ${err.message}`)));
      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`FFprobe exited with code ${code}: ${stderr.trim()}`));
        }
        try {
          const parsed = JSON.parse(stdout);
          const stream = parsed?.streams?.[0];
          const format = parsed?.format || {};
          const width = Number(stream?.width) || 0;
          const height = Number(stream?.height) || 0;
          if (width <= 0 || height <= 0) {
            return reject(new Error(`Could not determine dimensions for ${path.basename(inputPath)}`));
          }

          const parseRate = (rateStr?: string): { num: number; rational: string } | null => {
            if (!rateStr || rateStr === '0/0') return null;
            const parts = rateStr.split('/');
            if (parts.length === 2) {
              const n = Number(parts[0]);
              const d = Number(parts[1]);
              if (n > 0 && d > 0) {
                return { num: n / d, rational: `${n}/${d}` };
              }
            }
            const val = Number(rateStr);
            if (Number.isFinite(val) && val > 0) {
              return { num: val, rational: String(val) };
            }
            return null;
          };

          const avgRate = parseRate(stream?.avg_frame_rate);
          const rRate = parseRate(stream?.r_frame_rate);
          const chosenRate = avgRate || rRate || { num: 30, rational: '30' };

          const durationSeconds =
            Number(stream?.duration) ||
            Number(format?.duration) ||
            0;

          const nbFrames = Number(stream?.nb_frames);
          const totalFrames =
            Number.isFinite(nbFrames) && nbFrames > 0
              ? Math.round(nbFrames)
              : durationSeconds > 0
              ? Math.max(1, Math.round(durationSeconds * chosenRate.num))
              : 1;

          const rawBitrate = Number(stream?.bit_rate) || Number(format?.bit_rate) || 14_000_000;
          const bitrateBps = Math.max(4_000_000, Math.min(60_000_000, rawBitrate));

          resolve({
            width,
            height,
            fpsNum: chosenRate.num,
            frameRateRational: chosenRate.rational,
            durationSeconds,
            totalFrames,
            bitrateBps,
          });
        } catch (e: any) {
          reject(new Error(`Failed to parse FFprobe output: ${e.message}`));
        }
      });
    });
  }

  private async decodeSingleFrameRgba(
    inputPath: string,
    width: number,
    height: number,
    seekSeconds?: number
  ): Promise<Buffer> {
    const ffmpegBin = ffmpegService.getFfmpegPath();
    const expectedBytes = width * height * 4;
    const args: string[] = ['-hide_banner', '-v', 'error'];
    if (typeof seekSeconds === 'number' && seekSeconds > 0) {
      args.push('-ss', seekSeconds.toFixed(3));
    }
    args.push(
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      'pipe:1'
    );

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      this.activeChildProcesses.add(proc);
      const chunks: Buffer[] = [];
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => {
        this.activeChildProcesses.delete(proc);
        reject(err);
      });
      proc.on('close', (code) => {
        this.activeChildProcesses.delete(proc);
        if (code !== 0) {
          return reject(new Error(`FFmpeg RGBA decode failed (code ${code}): ${stderr.trim()}`));
        }
        const buf = Buffer.concat(chunks);
        if (buf.length < expectedBytes) {
          return reject(
            new Error(
              `Decoded frame buffer (${buf.length}B) smaller than expected ${width}x${height} RGBA (${expectedBytes}B)`
            )
          );
        }
        resolve(buf.length === expectedBytes ? buf : buf.subarray(0, expectedBytes));
      });
    });
  }

  private async encodeImageRgba(
    rgbaData: Uint8ClampedArray,
    width: number,
    height: number,
    outputPath: string
  ): Promise<void> {
    const ffmpegBin = ffmpegService.getFfmpegPath();
    const outDir = path.dirname(outputPath);
    await fs.promises.mkdir(outDir, { recursive: true });

    const ext = path.extname(outputPath).toLowerCase();
    let codecArgs: string[];
    if (ext === '.jpg' || ext === '.jpeg') {
      codecArgs = ['-c:v', 'mjpeg', '-qmin', '1', '-q:v', '1'];
    } else if (ext === '.webp' && this.hasLibWebpEncoder()) {
      codecArgs = ['-c:v', 'libwebp', '-quality', '98'];
    } else if (ext === '.bmp') {
      codecArgs = ['-c:v', 'bmp'];
    } else if (ext === '.tif' || ext === '.tiff') {
      codecArgs = ['-c:v', 'tiff'];
    } else {
      codecArgs = ['-c:v', 'png'];
    }

    const args = [
      '-hide_banner',
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${width}x${height}`,
      '-i',
      'pipe:0',
      ...codecArgs,
      '-frames:v',
      '1',
      '-update',
      '1',
      outputPath,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
      this.activeChildProcesses.add(proc);
      let stderr = '';

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => {
        this.activeChildProcesses.delete(proc);
        reject(err);
      });
      proc.on('close', (code) => {
        this.activeChildProcesses.delete(proc);
        if (code !== 0) {
          return reject(new Error(`FFmpeg image encode failed (code ${code}): ${stderr.trim()}`));
        }
        resolve();
      });

      const rawBuf = Buffer.from(rgbaData.buffer, rgbaData.byteOffset, rgbaData.byteLength);
      proc.stdin.on('error', () => {
        // Handled by close event
      });
      proc.stdin.end(rawBuf);
    });
  }

  /**
   * Removes Gemini watermark from a single image using mathematical Reverse Alpha Blending.
   */
  private async processImageItem(
    item: WatermarkItem,
    outputPath: string,
    options: WatermarkOptions
  ): Promise<void> {
    const info = await this.probeMedia(item.inputPath);
    item.width = info.width;
    item.height = info.height;

    const rawBuf = await this.decodeSingleFrameRgba(item.inputPath, info.width, info.height);
    const pixelData = new Uint8ClampedArray(
      rawBuf.buffer,
      rawBuf.byteOffset,
      info.width * info.height * 4
    );

    const result = removeWatermarkFromImageDataSync(
      {
        width: info.width,
        height: info.height,
        data: pixelData,
      },
      {
        adaptiveMode: options.forceRemoveLowConfidence ? 'always' : 'auto',
      }
    );

    let applied = Boolean(result.meta?.applied);
    let outputImageData = result.imageData;
    let watermarkInfo = '';

    if (applied) {
      const wmSize = result.meta.size || result.meta.position?.width || 48;
      const origScore = result.meta.detection?.originalSpatialScore;
      const pct = typeof origScore === 'number'
        ? ` (${Math.min(100, Math.max(50, Math.round(Math.abs(origScore) * 100)))}% match)`
        : '';
      watermarkInfo = `${wmSize}×${wmSize}px Gemini Star${pct}`;
    } else if (options.forceRemoveLowConfidence) {
      // Explicit user override: force standard Gemini corner reverse-alpha removal
      const cfg = detectWatermarkConfig(info.width, info.height);
      const pos = calculateWatermarkPosition(info.width, info.height, cfg);
      if (pos.x >= 0 && pos.y >= 0 && pos.x + pos.width <= info.width && pos.y + pos.height <= info.height) {
        const forcedData = new Uint8ClampedArray(pixelData);
        const alphaMap = getEmbeddedAlphaMap(cfg.logoSize);
        const forcedImg = { width: info.width, height: info.height, data: forcedData };
        removeWatermark(forcedImg, alphaMap, pos, { alphaGain: 1 });
        outputImageData = forcedImg;
        applied = true;
        watermarkInfo = `${cfg.logoSize}×${cfg.logoSize}px Forced Corner`;
      }
    }

    if (!applied) {
      item.watermarkDetected = false;
      if (item.sourceRootFolder && options.copySkippedInFolderMode !== false) {
        await fs.promises.mkdir(path.dirname(item.inputPath === outputPath ? outputPath : outputPath), {
          recursive: true,
        });
        // Preserve original extension when copying untouched file
        const copiedPath = path.join(path.dirname(outputPath), item.fileName);
        await fs.promises.copyFile(item.inputPath, copiedPath);
        item.outputPath = copiedPath;
        item.status = 'skipped';
        item.skipReason = 'Already clean (copied to output folder)';
      } else {
        item.outputPath = undefined;
        item.status = 'skipped';
        item.skipReason = 'No Gemini watermark detected';
      }
      return;
    }

    await this.encodeImageRgba(outputImageData.data, info.width, info.height, outputPath);
    item.watermarkDetected = true;
    item.watermarkInfo = watermarkInfo;
    item.outputPath = outputPath;
    item.status = 'cleaned';
  }

  /**
   * Detects and removes Gemini Diamond / Veo Text watermarks across an entire video stream.
   * Specifically tuned for 720p videos (48x48px watermark).
   */
  private async processVideoItem(
    item: WatermarkItem,
    outputPath: string,
    options: WatermarkOptions,
    onVideoProgress: (pct: number) => void
  ): Promise<void> {
    const info = await this.probeMedia(item.inputPath);
    item.width = info.width;
    item.height = info.height;
    item.durationSeconds = info.durationSeconds;
    item.frameCount = info.totalFrames;

    // Watermark removal is specifically supported for 720p videos
    if (Math.min(info.width, info.height) > 720) {
      item.watermarkDetected = false;
      if (item.sourceRootFolder && options.copySkippedInFolderMode !== false) {
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        const copiedPath = path.join(path.dirname(outputPath), item.fileName);
        await fs.promises.copyFile(item.inputPath, copiedPath);
        item.outputPath = copiedPath;
        item.status = 'skipped';
        item.skipReason = 'Video watermark removal is only supported for 720p videos';
      } else {
        item.outputPath = undefined;
        item.status = 'skipped';
        item.skipReason = 'Video watermark removal is only supported for 720p videos';
      }
      return;
    }

    onVideoProgress(4);

    // 1. Sample up to 10 frames across duration for watermark detection
    const sampleCount = Math.min(10, Math.max(1, info.totalFrames));
    const sampledFrames: VideoSampleFrame[] = [];

    for (let i = 0; i < sampleCount; i++) {
      if (this.isCancelling) throw new Error('Cancelled');
      const seekSec =
        info.durationSeconds > 0.25
          ? (info.durationSeconds * (i + 0.4)) / sampleCount
          : 0;
      try {
        const frameBuf = await this.decodeSingleFrameRgba(
          item.inputPath,
          info.width,
          info.height,
          seekSec
        );
        const copied = new Uint8ClampedArray(info.width * info.height * 4);
        copied.set(
          new Uint8Array(frameBuf.buffer, frameBuf.byteOffset, info.width * info.height * 4)
        );
        sampledFrames.push({
          timestamp: seekSec,
          imageData: { width: info.width, height: info.height, data: copied },
        });
      } catch {
        // Ignore seek failure near EOF
      }
    }

    if (sampledFrames.length === 0) {
      const firstBuf = await this.decodeSingleFrameRgba(item.inputPath, info.width, info.height, 0);
      const copied = new Uint8ClampedArray(info.width * info.height * 4);
      copied.set(new Uint8Array(firstBuf.buffer, firstBuf.byteOffset, info.width * info.height * 4));
      sampledFrames.push({
        timestamp: 0,
        imageData: { width: info.width, height: info.height, data: copied },
      });
    }

    onVideoProgress(12);

    // Build candidate list: Veo video catalog + standard Gemini image corner fallback
    const catalogCandidates = resolveVideoWatermarkCandidates(info.width, info.height);
    const stdCfg = detectWatermarkConfig(info.width, info.height);
    const stdPos = calculateWatermarkPosition(info.width, info.height, stdCfg);
    const allCandidates = [...catalogCandidates];
    if (
      stdPos.x >= 0 &&
      stdPos.y >= 0 &&
      stdPos.x + stdPos.width <= info.width &&
      stdPos.y + stdPos.height <= info.height &&
      !allCandidates.some(
        (c) => Math.abs(c.x - stdPos.x) <= 2 && Math.abs(c.y - stdPos.y) <= 2 && c.size === stdCfg.logoSize
      )
    ) {
      allCandidates.push({
        id: 'gemini-image-standard-corner',
        label: `Gemini standard ${stdCfg.logoSize}px`,
        x: stdPos.x,
        y: stdPos.y,
        size: stdCfg.logoSize,
        marginRight: stdCfg.marginRight,
        marginBottom: stdCfg.marginBottom,
      });
    }

    const detection = detectVideoWatermarkFromFrames({
      frames: sampledFrames,
      width: info.width,
      height: info.height,
      candidates: allCandidates,
    });

    const isDetected = Boolean(detection?.isConfident || options.forceRemoveLowConfidence);

    if (!isDetected) {
      item.watermarkDetected = false;
      if (item.sourceRootFolder && options.copySkippedInFolderMode !== false) {
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        const copiedPath = path.join(path.dirname(outputPath), item.fileName);
        await fs.promises.copyFile(item.inputPath, copiedPath);
        item.outputPath = copiedPath;
        item.status = 'skipped';
        item.skipReason = 'Already clean (copied to output folder)';
      } else {
        item.outputPath = undefined;
        item.status = 'skipped';
        item.skipReason = 'No Gemini or Veo video watermark detected';
      }
      return;
    }

    const kindLabel =
      detection.watermarkKind === 'veo-text'
        ? 'Veo Text Watermark'
        : `${detection.position.width}×${detection.position.height}px Gemini/Veo Star`;
    const bestConf =
      detection.summary?.best?.meanConfidence ??
      detection.summary?.best?.meanNcc;
    item.watermarkDetected = true;
    item.watermarkInfo =
      typeof bestConf === 'number'
        ? `${kindLabel} (${Math.min(100, Math.round(bestConf * 100))}% score)`
        : kindLabel;

    onVideoProgress(15);

    // 2. Stream full video: FFmpeg raw RGBA decode -> BufferCanvasContext ROI clean -> FFmpeg encode
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    const ffmpegBin = ffmpegService.getFfmpegPath();
    const frameByteSize = info.width * info.height * 4;

    const decoderArgs = [
      '-hide_banner',
      '-v',
      'error',
      '-i',
      item.inputPath,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      'pipe:1',
    ];

    const recommendedEncoder = hardwareDetector.getRecommendedEncoder();
    const targetMbps = Math.max(8, Math.round(info.bitrateBps / 1_000_000));
    let videoCodecArgs: string[];

    if (recommendedEncoder === 'videotoolbox') {
      videoCodecArgs = [
        '-c:v',
        'h264_videotoolbox',
        '-allow_sw',
        '1',
        '-b:v',
        `${targetMbps}M`,
        '-pix_fmt',
        'yuv420p',
      ];
    } else if (recommendedEncoder === 'nvenc') {
      videoCodecArgs = [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p5',
        '-b:v',
        `${targetMbps}M`,
        '-pix_fmt',
        'yuv420p',
      ];
    } else {
      videoCodecArgs = [
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
      ];
    }

    const needsEvenPad = info.width % 2 !== 0 || info.height % 2 !== 0;
    const vfArgs = needsEvenPad ? ['-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2'] : [];
    const inExt = item.extension.toLowerCase();
    const canCopyAudio = inExt === '.mp4' || inExt === '.mov' || inExt === '.m4v';
    const audioArgs = canCopyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k'];
    const outExt = path.extname(outputPath).toLowerCase();

    const encoderArgs = [
      '-hide_banner',
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${info.width}x${info.height}`,
      '-framerate',
      info.frameRateRational,
      '-i',
      'pipe:0',
      '-i',
      item.inputPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a?',
      ...vfArgs,
      ...videoCodecArgs,
      ...audioArgs,
      ...(outExt === '.mov' ? ['-f', 'mov'] : []),
      '-movflags',
      '+faststart',
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const decoder = spawn(ffmpegBin, decoderArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      const encoder = spawn(ffmpegBin, encoderArgs, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
      this.activeChildProcesses.add(decoder);
      this.activeChildProcesses.add(encoder);

      let decoderStderr = '';
      let encoderStderr = '';
      let settled = false;
      let processedFrames = 0;
      let lastProgressEmit = 0;

      // Rolling accumulator for incoming RGBA chunks
      let leftover: Buffer = Buffer.alloc(0);

      const cleanupProcs = () => {
        this.activeChildProcesses.delete(decoder);
        this.activeChildProcesses.delete(encoder);
      };

      const failOnce = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanupProcs();
        try {
          decoder.kill('SIGKILL');
        } catch {}
        try {
          encoder.kill('SIGKILL');
        } catch {}
        reject(err);
      };

      decoder.stderr.on('data', (d: Buffer) => {
        decoderStderr += d.toString();
      });
      encoder.stderr.on('data', (d: Buffer) => {
        encoderStderr += d.toString();
      });

      decoder.on('error', (err) => failOnce(new Error(`Video decoder failed: ${err.message}`)));
      encoder.on('error', (err) => failOnce(new Error(`Video encoder failed: ${err.message}`)));
      encoder.stdin.on('error', () => {
        // Handled by encoder close
      });

      const pos = detection.position;
      const alphaMap = detection.alphaMap;
      const is72px = pos.width === 72 || pos.height === 72;
      const seedGain =
        Number.isFinite(options.videoGain) && (options.videoGain as number) > 0
          ? (options.videoGain as number)
          : 0.60;

      const processSingleFrameBuffer = (frameBuf: Buffer) => {
        const frameClamped = new Uint8ClampedArray(
          frameBuf.buffer,
          frameBuf.byteOffset,
          frameByteSize
        );
        const ctx = new BufferCanvasContext(frameClamped, info.width, info.height);

        const roi = ctx.getImageData(pos.x, pos.y, pos.width, pos.height);

        // Exact Reverse Alpha Blending formula from dearabhin/gemini-watermark-remover:
        // Pixel_orig = (Pixel_final - alpha * 255) / (1 - alpha)
        // Default video gain is 0.60 (60%), matching dearabhin VIDEO_DEFAULTS.gain
        removeWatermark(
          roi,
          alphaMap,
          { x: 0, y: 0, width: roi.width, height: roi.height },
          { alphaGain: seedGain }
        );
        ctx.putImageData(roi, pos.x, pos.y);

        // Only apply residual cleanup if explicitly requested
        if (options.highQualityVideoCleanup) {
          applyVideoResidualCleanup(ctx, pos, alphaMap, {
            highQualityCleanup: true,
            residualCleanupStrength: 0.4,
          });
        }

        processedFrames++;
        const now = Date.now();
        if (now - lastProgressEmit >= 80 || processedFrames === info.totalFrames) {
          lastProgressEmit = now;
          const pct = Math.min(
            99,
            15 + Math.round((processedFrames / Math.max(1, info.totalFrames)) * 84)
          );
          onVideoProgress(pct);
        }

        return frameBuf;
      };

      encoder.stdin.on('drain', () => {
        if (!settled && !decoder.killed) {
          decoder.stdout.resume();
        }
      });

      decoder.stdout.on('data', (chunk: Buffer) => {
        if (settled || this.isCancelling) return;
        leftover = leftover.length === 0 ? chunk : Buffer.concat([leftover, chunk]);

        let offset = 0;
        let shouldPause = false;

        while (leftover.length - offset >= frameByteSize) {
          // Copy frame slice into its own buffer so mutations & async stdin writes don't alias subsequent chunks
          const frameCopy = Buffer.allocUnsafe(frameByteSize);
          leftover.copy(frameCopy, 0, offset, offset + frameByteSize);
          offset += frameByteSize;

          const cleanedFrame = processSingleFrameBuffer(frameCopy);
          const canContinue = encoder.stdin.write(cleanedFrame);
          if (!canContinue) {
            shouldPause = true;
          }
        }

        if (offset > 0) {
          leftover =
            offset === leftover.length
              ? Buffer.alloc(0)
              : Buffer.from(leftover.subarray(offset));
        }

        if (shouldPause) {
          decoder.stdout.pause();
        }
      });

      decoder.on('close', (code) => {
        if (settled) return;
        if (code !== 0 && !this.isCancelling) {
          return failOnce(
            new Error(`FFmpeg video decode failed (code ${code}): ${decoderStderr.slice(-600)}`)
          );
        }
        try {
          encoder.stdin.end();
        } catch {}
      });

      encoder.on('close', (code) => {
        if (settled) return;
        settled = true;
        cleanupProcs();
        if (this.isCancelling) {
          return reject(new Error('Cancelled'));
        }
        if (code !== 0) {
          return reject(
            new Error(`FFmpeg video encode failed (code ${code}): ${encoderStderr.slice(-600)}`)
          );
        }
        resolve();
      });
    });

    item.outputPath = outputPath;
    item.status = 'cleaned';
    onVideoProgress(100);
  }
}

export const watermarkService = new WatermarkService();
