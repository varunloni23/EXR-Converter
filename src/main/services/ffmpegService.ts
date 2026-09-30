import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ExrSequence, ConversionSettings, ConversionJob } from '../../shared/types';
import { logger } from './logger';
import { hardwareDetector } from './hardwareDetector';

export interface ProgressData {
  jobId: string;
  frame: number;
  totalFrames: number;
  currentFrameNumber: number;
  percentage: number;
  fps: number;
  speedMultiplier: number;
  etaSeconds: number;
  elapsedSeconds: number;
  fileSizeBytes: number;
}

export class FFmpegService {
  private customFfmpegPath: string | null = null;
  private customFfprobePath: string | null = null;
  private activeProcesses: Map<string, { process: ChildProcess; isPaused: boolean; outputPath: string }> = new Map();

  constructor() {
    this.detectBinaries();
  }

  public detectBinaries() {
    // 1. Check FFMPEG_PATH env
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
      this.customFfmpegPath = process.env.FFMPEG_PATH;
    }

    // 2. Comprehensive fallback paths on Windows, macOS, Linux, and bundled resources
    const isWin = os.platform() === 'win32';
    const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
    const localAppData = process.env.LOCALAPPDATA || '';

    const candidates: string[] = [
      // Packaged app resources (e.g. extraResources in electron-builder)
      ...(process.resourcesPath ? [
        path.join(process.resourcesPath, 'bin', exeName),
        path.join(process.resourcesPath, exeName),
      ] : []),
      // Current working directory / local bin
      path.join(process.cwd(), 'bin', isWin ? 'win' : 'mac', exeName),
      path.join(process.cwd(), 'bin', exeName),
      path.join(__dirname, '..', '..', 'bin', isWin ? 'win' : 'mac', exeName),
      path.join(__dirname, '..', '..', 'bin', exeName),
      // Windows standard installations (Winget, Scoop, Chocolatey, manual C:\)
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
      path.join(os.homedir(), 'scoop', 'shims', 'ffmpeg.exe'),
      path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
      // macOS & Linux standard installations
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
    ];

    for (const cand of candidates) {
      if (!this.customFfmpegPath && fs.existsSync(cand)) {
        this.customFfmpegPath = cand;
        break;
      }
    }

    // If still not set, check via `which` or `where`
    if (!this.customFfmpegPath) {
      try {
        const cmd = isWin ? 'where ffmpeg' : 'which ffmpeg';
        const found = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0].trim();
        if (found && fs.existsSync(found)) {
          this.customFfmpegPath = found;
        }
      } catch (e) {
        // Not in system path
      }
    }

    // Detect ffprobe similarly
    if (this.customFfmpegPath) {
      const probeSibling = path.join(path.dirname(this.customFfmpegPath), os.platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe');
      if (fs.existsSync(probeSibling)) {
        this.customFfprobePath = probeSibling;
      }
    }

    logger.info(`FFmpeg binary resolved: ${this.customFfmpegPath || 'system default (ffmpeg)'}`);
    logger.info(`FFprobe binary resolved: ${this.customFfprobePath || 'system default (ffprobe)'}`);
  }

  public getFfmpegPath(): string {
    return this.customFfmpegPath || 'ffmpeg';
  }

  public getFfprobePath(): string {
    return this.customFfprobePath || 'ffprobe';
  }

  public setFfmpegPath(newPath: string) {
    if (fs.existsSync(newPath)) {
      this.customFfmpegPath = newPath;
      logger.info(`Custom FFmpeg path set: ${newPath}`);
    }
  }

  /**
   * Calculates scaled target dimensions preserving aspect ratio and ensuring even integers for H.264 macroblocks.
   */
  public calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    scalePercent: number = 50
  ): { targetWidth: number; targetHeight: number } {
    const factor = scalePercent / 100;
    let targetWidth = Math.round(originalWidth * factor);
    let targetHeight = Math.round(originalHeight * factor);

    // Make divisible by 2 for yuv420p H.264
    targetWidth = Math.floor(targetWidth / 2) * 2;
    targetHeight = Math.floor(targetHeight / 2) * 2;

    if (targetWidth < 2) targetWidth = 2;
    if (targetHeight < 2) targetHeight = 2;

    return { targetWidth, targetHeight };
  }

  /**
   * Maps Photoshop JPEG Quality scale (1 to 12) to FFmpeg MJPEG quality parameter (q:v).
   * Quality 8 is Photoshop's standard "Maximum" preset (very high fidelity).
   */
  public mapPhotoshopQualityToFfmpegQ(quality: number = 8): number {
    if (quality >= 11) return 1;
    if (quality >= 8) return 2; // Quality 8: Maximum
    if (quality >= 6) return 4;
    if (quality >= 4) return 6;
    return 10;
  }

  /**
   * Spawns FFmpeg to convert the sequence.
   */
  public async convertSequence(
    job: ConversionJob,
    onProgress?: (data: ProgressData) => void
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const ffmpegBin = this.getFfmpegPath();
      const seq = job.sequence;
      const settings = job.settings;
      const outputPath = job.outputPath;

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const totalFrames = seq.frameCount;
      const startTime = Date.now();

      // Check if frames have gaps
      let inputArgs: string[] = [];
      let tempConcatPath: string | null = null;

      const isJpg = settings.outputFormat === 'jpg' || (settings.outputFormat as string) === 'jpeg';
      const isMov = settings.outputFormat === 'mov';
      const targetBitrate = settings.bitrateMbps || (isMov ? 40 : 12);
      const isCbr = settings.bitrateMode === 'cbr' || isMov;

      const isVideoInput =
        seq.extension === '.mov' ||
        seq.extension === '.mp4' ||
        seq.extension === 'mov' ||
        seq.extension === 'mp4' ||
        path.extname(seq.firstFramePath).toLowerCase() === '.mov' ||
        path.extname(seq.firstFramePath).toLowerCase() === '.mp4';

      // If input is video and target is JPEG, extract high-fidelity JPEGs directly!
      if (isVideoInput && isJpg) {
        return this.convertVideoToJpegSequence(job, onProgress).then(resolve).catch(reject);
      }

      if (isVideoInput) {
        inputArgs = ['-i', seq.firstFramePath];
      } else if (isJpg && seq.frameCount > 1) {
        // If converting an EXR sequence to JPEG, route through the master video pipeline
        // to guarantee 100% color, contrast, and aspect-ratio parity with MOV!
        return this.convertSequenceToJpegViaMaster(job, onProgress).then(resolve).catch(reject);
      } else if (isJpg || seq.frameCount === 1 || seq.frames.length === 1) {
        // Converting single frame or image to JPEG
        const singleFilePath = seq.firstFramePath || seq.frames[0];
        if (isJpg) {
          inputArgs = ['-i', singleFilePath];
        } else {
          // Single frame conversion for video: generate a 1-second hold so it can be previewed cleanly
          inputArgs = [
            '-loop',
            '1',
            '-t',
            '1',
            '-framerate',
            String(settings.fps),
            '-i',
            singleFilePath,
          ];
        }
      } else if (seq.hasMissingFrames) {
        // Use concat demuxer to avoid breaking when missing frames are skipped
        logger.warn(
          `Sequence has ${seq.missingFrames.length} missing frames. Creating temporary concat script.`
        );
        const frameDuration = (1 / settings.fps).toFixed(8);
        const concatLines: string[] = [];
        for (const frameFile of seq.frames) {
          const safePath = frameFile.replace(/\\/g, '/').replace(/'/g, "'\\''");
          concatLines.push(`file '${safePath}'`);
          concatLines.push(`duration ${frameDuration}`);
        }
        // Last file repeated without duration per ffmpeg concat spec
        if (seq.frames.length > 0) {
          const safeLastPath = seq.frames[seq.frames.length - 1].replace(/\\/g, '/').replace(/'/g, "'\\''");
          concatLines.push(`file '${safeLastPath}'`);
        }

        tempConcatPath = path.join(os.tmpdir(), `exr_concat_${job.id}.txt`);
        await fs.promises.writeFile(tempConcatPath, concatLines.join('\n'), 'utf8');

        inputArgs = ['-f', 'concat', '-safe', '0', '-i', tempConcatPath];
      } else {
        // Standard contiguous sequence pattern
        const patternPath = path.join(seq.folderPath, seq.pattern);
        let loopArgs: string[] = [];

        // If sequence is very short (e.g. 5 frames = 0.2s) and user specified review duration
        if (settings.reviewDurationSeconds && settings.reviewDurationSeconds > 0 && totalFrames > 0) {
          const natDuration = totalFrames / settings.fps;
          if (natDuration < settings.reviewDurationSeconds) {
            const count = Math.max(1, Math.ceil(settings.reviewDurationSeconds / natDuration) - 1);
            loopArgs = ['-stream_loop', String(count)];
            logger.info(`Looping short sequence ${count}x for review (target: ${settings.reviewDurationSeconds}s).`);
          }
        }

        inputArgs = [
          '-f',
          'image2',
          '-start_number',
          String(seq.firstFrame),
          ...loopArgs,
          '-framerate',
          String(settings.fps),
          '-i',
          patternPath,
        ];
      }

      // Video scale filter: ensures dimensions are even
      const scaleFilter = `scale=${job.targetWidth}:${job.targetHeight}:flags=lanczos`;

      // Codec & Output args
      let outputArgs: string[] = [];

      if (isJpg) {
        // JPEG output options (per user specification: Quality 1-12, Baseline Standard, Baseline Optimized, Progressive)
        const qv = this.mapPhotoshopQualityToFfmpegQ(settings.jpegQuality || 8);
        const formatOpt = settings.jpegFormatOption || 'baseline';
        const jpegArgs = ['-c:v', 'mjpeg', '-pix_fmt', 'yuvj420p', '-q:v', String(qv)];
        if (formatOpt === 'baseline_optimized') {
          jpegArgs.push('-huffman', '1');
        }
        outputArgs = [
          '-vf',
          scaleFilter,
          ...jpegArgs,
          '-frames:v',
          '1',
          '-y',
          outputPath,
        ];
      } else {
        // Video codec args (MOV / MP4)
        let codecArgs: string[] = [];
        let engine = settings.encoderEngine;

        if (engine === 'auto') {
          const recommended = hardwareDetector.getRecommendedEncoder();
          engine = (recommended as typeof engine) || 'libx264';
          logger.info(`Auto encoder resolved to: ${engine}`);
        }

        if (engine === 'videotoolbox') {
          // macOS VideoToolbox hardware encoder (supports CBR 40 Mbps)
          codecArgs = [
            '-c:v',
            'h264_videotoolbox',
            '-allow_sw',
            '1',
            '-b:v',
            `${targetBitrate}M`,
            '-maxrate',
            `${targetBitrate}M`,
            '-bufsize',
            `${targetBitrate}M`,
            '-pix_fmt',
            'yuv420p',
          ];
        } else if (engine === 'nvenc') {
          // NVIDIA GPU NVENC (Windows / Linux)
          codecArgs = [
            '-c:v',
            'h264_nvenc',
            '-preset',
            'p5',
            '-b:v',
            `${targetBitrate}M`,
            '-maxrate',
            `${targetBitrate}M`,
            '-bufsize',
            `${targetBitrate * 2}M`,
            '-pix_fmt',
            'yuv420p',
          ];
        } else if (engine === 'qsv') {
          // Intel QuickSync (Windows / Linux)
          codecArgs = [
            '-c:v',
            'h264_qsv',
            '-b:v',
            `${targetBitrate}M`,
            '-maxrate',
            `${targetBitrate}M`,
            '-pix_fmt',
            'yuv420p',
          ];
        } else if (engine === 'amf') {
          // AMD Radeon AMF (Windows)
          codecArgs = [
            '-c:v',
            'h264_amf',
            '-quality',
            'quality',
            '-rc',
            'cbr',
            '-b:v',
            `${targetBitrate}M`,
            '-pix_fmt',
            'yuv420p',
          ];
        } else {
          // Standard libx264 CPU encoder (universal fallback)
          codecArgs = [
            '-c:v',
            'libx264',
            '-preset',
            settings.ffmpegPreset || 'medium',
            '-b:v',
            `${targetBitrate}M`,
            ...(isCbr
              ? ['-minrate', `${targetBitrate}M`, '-maxrate', `${targetBitrate}M`, '-bufsize', `${targetBitrate * 2}M`]
              : ['-crf', String(settings.crf || 18)]),
            '-pix_fmt',
            'yuv420p',
          ];
        }

        outputArgs = [
          '-vf',
          scaleFilter,
          ...codecArgs,
          ...(isMov ? ['-f', 'mov'] : []),
          '-movflags',
          '+faststart',
          '-y',
          outputPath,
        ];
      }

      // Full FFmpeg argument list with machine-readable progress pipe
      const fullArgs = ['-hide_banner', ...inputArgs, ...outputArgs, '-progress', 'pipe:1'];

      logger.info(
        `Starting FFmpeg for job ${job.id}`,
        `Command: ${ffmpegBin} ${fullArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
      );

      const child = spawn(ffmpegBin, fullArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(job.id, {
        process: child,
        isPaused: false,
        outputPath,
      });

      let currentFrame = 0;
      let lastFps = 0;
      let lastSpeed = 1.0;
      let stderrLog = '';

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          const [k, val] = line.split('=');
          if (!k || val === undefined) continue;

          const key = k.trim();
          const value = val.trim();

          if (key === 'frame') {
            currentFrame = parseInt(value, 10) || currentFrame;
          } else if (key === 'fps') {
            const parsedFps = parseFloat(value);
            if (!isNaN(parsedFps)) lastFps = parsedFps;
          } else if (key === 'speed') {
            const parsedSpeed = parseFloat(value.replace('x', ''));
            if (!isNaN(parsedSpeed)) lastSpeed = parsedSpeed;
          } else if (key === 'progress' && (value === 'continue' || value === 'end')) {
            const elapsedSeconds = Math.max(0.1, (Date.now() - startTime) / 1000);
            const percentage = Math.min(100, Math.round((currentFrame / totalFrames) * 100));

            // Estimate remaining time
            const remainingFrames = Math.max(0, totalFrames - currentFrame);
            const effectiveFps = lastFps > 0 ? lastFps : currentFrame / elapsedSeconds;
            const etaSeconds = effectiveFps > 0 ? Math.ceil(remainingFrames / effectiveFps) : 0;

            let fileSizeBytes = 0;
            try {
              if (fs.existsSync(outputPath)) {
                fileSizeBytes = fs.statSync(outputPath).size;
              }
            } catch (e) {}

            if (onProgress) {
              onProgress({
                jobId: job.id,
                frame: currentFrame,
                totalFrames,
                currentFrameNumber: seq.firstFrame + Math.min(currentFrame, totalFrames - 1),
                percentage,
                fps: Math.round(lastFps * 10) / 10,
                speedMultiplier: Math.round(lastSpeed * 100) / 100,
                etaSeconds,
                elapsedSeconds: Math.round(elapsedSeconds),
                fileSizeBytes,
              });
            }
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const str = data.toString();
        stderrLog += str;
        // Keep last 4000 characters of stderr for debugging
        if (stderrLog.length > 4000) {
          stderrLog = stderrLog.slice(-4000);
        }
      });

      child.on('error', (err) => {
        this.activeProcesses.delete(job.id);
        if (tempConcatPath && fs.existsSync(tempConcatPath)) {
          fs.unlinkSync(tempConcatPath);
        }
        logger.error(`FFmpeg process failed to start: ${err.message}`);
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });

      child.on('close', (code, signal) => {
        this.activeProcesses.delete(job.id);
        if (tempConcatPath && fs.existsSync(tempConcatPath)) {
          try {
            fs.unlinkSync(tempConcatPath);
          } catch (e) {}
        }

        if (code === 0) {
          logger.success(
            `Conversion complete for job ${job.id}`,
            `Saved to ${outputPath} (${totalFrames} frames converted)`
          );
          resolve(outputPath);
        } else if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          logger.warn(`Conversion cancelled by user for job ${job.id}`);
          reject(new Error('Conversion was cancelled by user.'));
        } else {
          logger.error(
            `FFmpeg exited with error code ${code}`,
            `Stderr output:\n${stderrLog.slice(-1000)}`
          );
          reject(
            new Error(
              `FFmpeg failed with exit code ${code}. Please check the technical log for details.`
            )
          );
        }
      });
    });
  }

  /**
   * High-fidelity EXR sequence to JPEG converter.
   * Renders the sequence through the high-bitrate (40Mbps CBR H.264) video pipeline
   * and extracts the JPEGs, ensuring 100% color space, gamma, and framing parity with MOV.
   */
  private async convertSequenceToJpegViaMaster(
    job: ConversionJob,
    onProgress?: (data: ProgressData) => void
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const ffmpegBin = this.getFfmpegPath();
      const seq = job.sequence;
      const settings = job.settings;
      const outputDir = path.dirname(job.outputPath);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const totalFrames = seq.frameCount;
      const startTime = Date.now();
      const tempMasterMov = path.join(outputDir, `.temp_master_${job.id}.mov`);
      let tempConcatPath: string | null = null;

      // 1. Prepare input args
      let inputArgs: string[] = [];
      if (seq.hasMissingFrames) {
        const frameDuration = (1 / settings.fps).toFixed(8);
        const concatLines: string[] = [];
        for (const frameFile of seq.frames) {
          const safePath = frameFile.replace(/\\/g, '/').replace(/'/g, "'\\''");
          concatLines.push(`file '${safePath}'`);
          concatLines.push(`duration ${frameDuration}`);
        }
        if (seq.frames.length > 0) {
          const safeLastPath = seq.frames[seq.frames.length - 1].replace(/\\/g, '/').replace(/'/g, "'\\''");
          concatLines.push(`file '${safeLastPath}'`);
        }
        tempConcatPath = path.join(os.tmpdir(), `exr_concat_${job.id}.txt`);
        await fs.promises.writeFile(tempConcatPath, concatLines.join('\n'), 'utf8');
        inputArgs = ['-f', 'concat', '-safe', '0', '-i', tempConcatPath];
      } else {
        const patternPath = path.join(seq.folderPath, seq.pattern);
        inputArgs = [
          '-f', 'image2',
          '-start_number', String(seq.firstFrame),
          '-framerate', String(settings.fps),
          '-i', patternPath,
        ];
      }

      const scaleFilter = `scale=${job.targetWidth}:${job.targetHeight}:flags=lanczos`;
      const targetBitrate = settings.bitrateMbps || 40;

      // Master MOV encoding args: H.264 40Mbps CBR yuv420p
      const masterMovArgs = [
        '-hide_banner',
        ...inputArgs,
        '-vf', scaleFilter,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-b:v', `${targetBitrate}M`,
        '-minrate', `${targetBitrate}M`,
        '-maxrate', `${targetBitrate}M`,
        '-bufsize', `${targetBitrate * 2}M`,
        '-pix_fmt', 'yuv420p',
        '-f', 'mov',
        '-y', tempMasterMov,
        '-progress', 'pipe:1',
      ];

      logger.info(`Starting Master MOV encode for JPEG job ${job.id}`);

      const cleanupTemps = () => {
        if (tempConcatPath && fs.existsSync(tempConcatPath)) {
          try { fs.unlinkSync(tempConcatPath); } catch (e) {}
        }
        if (tempMasterMov && fs.existsSync(tempMasterMov)) {
          try { fs.unlinkSync(tempMasterMov); } catch (e) {}
        }
      };

      const proc1 = spawn(ffmpegBin, masterMovArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.activeProcesses.set(job.id, { process: proc1, isPaused: false, outputPath: tempMasterMov });

      let currentFrame = 0;
      let lastFps = 0;
      let lastSpeed = 1.0;

      proc1.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const [k, val] = line.split('=');
          if (!k || val === undefined) continue;
          const key = k.trim();
          const value = val.trim();
          if (key === 'frame') currentFrame = parseInt(value, 10) || currentFrame;
          else if (key === 'fps') { const p = parseFloat(value); if (!isNaN(p)) lastFps = p; }
          else if (key === 'speed') { const p = parseFloat(value.replace('x', '')); if (!isNaN(p)) lastSpeed = p; }
          else if (key === 'progress' && (value === 'continue' || value === 'end')) {
            const elapsed = Math.max(0.1, (Date.now() - startTime) / 1000);
            const percentage = Math.min(85, Math.round((currentFrame / totalFrames) * 85));
            if (onProgress) {
              onProgress({
                jobId: job.id,
                frame: currentFrame,
                totalFrames,
                currentFrameNumber: seq.firstFrame + Math.min(currentFrame, totalFrames - 1),
                percentage,
                fps: Math.round(lastFps * 10) / 10,
                speedMultiplier: Math.round(lastSpeed * 100) / 100,
                etaSeconds: Math.ceil(Math.max(0, totalFrames - currentFrame) / Math.max(1, lastFps)),
                elapsedSeconds: Math.round(elapsed),
                fileSizeBytes: 0,
              });
            }
          }
        }
      });

      proc1.on('error', (err) => {
        cleanupTemps();
        this.activeProcesses.delete(job.id);
        reject(new Error(`Failed to encode intermediate master video: ${err.message}`));
      });

      proc1.on('close', async (code, signal) => {
        if (tempConcatPath && fs.existsSync(tempConcatPath)) {
          try { fs.unlinkSync(tempConcatPath); } catch (e) {}
        }

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          cleanupTemps();
          this.activeProcesses.delete(job.id);
          return reject(new Error('Conversion was cancelled by user.'));
        }

        if (code !== 0) {
          cleanupTemps();
          this.activeProcesses.delete(job.id);
          return reject(new Error(`Master video encoding failed with exit code ${code}`));
        }

        // Phase 2: Extract JPEG sequence with matching color space
        const qv = this.mapPhotoshopQualityToFfmpegQ(settings.jpegQuality || 8);
        const formatOpt = settings.jpegFormatOption || 'baseline';
        const outPatternName = seq.pattern.replace(/\.[^/.]+$/, '.jpg');
        const outputPattern = path.join(outputDir, outPatternName);

        const extractArgs = [
          '-hide_banner',
          '-i', tempMasterMov,
          '-pix_fmt', 'yuvj420p',
          '-q:v', String(qv),
          ...(formatOpt === 'baseline_optimized' ? ['-huffman', '1'] : []),
          '-start_number', String(seq.firstFrame),
          '-y', outputPattern,
          '-progress', 'pipe:1',
        ];

        logger.info(`Extracting high-fidelity JPEGs for job ${job.id}`);
        const proc2 = spawn(ffmpegBin, extractArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
        this.activeProcesses.set(job.id, { process: proc2, isPaused: false, outputPath: job.outputPath });

        proc2.stdout.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            const [k, val] = line.split('=');
            if (!k || val === undefined) continue;
            if (k.trim() === 'frame') {
              const f = parseInt(val.trim(), 10) || 0;
              const pct = 85 + Math.min(15, Math.round((f / totalFrames) * 15));
              if (onProgress) {
                onProgress({
                  jobId: job.id,
                  frame: f,
                  totalFrames,
                  currentFrameNumber: seq.firstFrame + Math.min(f, totalFrames - 1),
                  percentage: pct,
                  fps: lastFps,
                  speedMultiplier: lastSpeed,
                  etaSeconds: 0,
                  elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
                  fileSizeBytes: 0,
                });
              }
            }
          }
        });

        proc2.on('error', (err) => {
          cleanupTemps();
          this.activeProcesses.delete(job.id);
          reject(new Error(`Failed to extract JPEGs: ${err.message}`));
        });

        proc2.on('close', async (c2, sig2) => {
          cleanupTemps();
          this.activeProcesses.delete(job.id);

          if (sig2 === 'SIGTERM' || sig2 === 'SIGKILL') {
            return reject(new Error('Conversion was cancelled by user.'));
          }

          if (c2 !== 0) {
            return reject(new Error(`JPEG extraction failed with exit code ${c2}`));
          }

          // If sequence had missing frames/gaps, ensure names align with source frames
          if (seq.hasMissingFrames && seq.frames && seq.frames.length > 0) {
            try {
              const generatedFiles = (await fs.promises.readdir(outputDir))
                .filter((f) => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'))
                .sort();
              if (generatedFiles.length === seq.frames.length) {
                for (let i = 0; i < seq.frames.length; i++) {
                  const expectedBase = path.basename(seq.frames[i]).replace(/\.[^/.]+$/, '.jpg');
                  const currentFile = generatedFiles[i];
                  if (currentFile !== expectedBase) {
                    const oldP = path.join(outputDir, currentFile);
                    const newP = path.join(outputDir, expectedBase);
                    if (fs.existsSync(oldP) && !fs.existsSync(newP)) {
                      await fs.promises.rename(oldP, newP);
                    }
                  }
                }
              }
            } catch (renameErr) {
              logger.warn(`Gap frame rename warning: ${renameErr}`);
            }
          }

          logger.success(
            `JPEG sequence conversion complete for job ${job.id}`,
            `Saved to ${outputDir} (${totalFrames} frames with 100% MOV color parity)`
          );
          resolve(job.outputPath);
        });
      });
    });
  }

  /**
   * Pauses an ongoing conversion process.
   */
  public pause(jobId: string): boolean {
    const item = this.activeProcesses.get(jobId);
    if (!item || item.isPaused) return false;

    try {
      if (os.platform() !== 'win32') {
        item.process.kill('SIGSTOP');
        item.isPaused = true;
        logger.info(`Paused job ${jobId}`);
        return true;
      }
    } catch (e) {
      logger.error(`Failed to pause job ${jobId}`, String(e));
    }
    return false;
  }

  /**
   * Resumes a paused conversion process.
   */
  public resume(jobId: string): boolean {
    const item = this.activeProcesses.get(jobId);
    if (!item || !item.isPaused) return false;

    try {
      if (os.platform() !== 'win32') {
        item.process.kill('SIGCONT');
        item.isPaused = false;
        logger.info(`Resumed job ${jobId}`);
        return true;
      }
    } catch (e) {
      logger.error(`Failed to resume job ${jobId}`, String(e));
    }
    return false;
  }

  /**
   * Cancels an ongoing conversion and cleans up the partial output file.
   */
  public cancel(jobId: string, cleanupPartialFile: boolean = true): boolean {
    const item = this.activeProcesses.get(jobId);
    if (!item) return false;

    try {
      if (os.platform() === 'win32' && item.process.pid) {
        spawn('taskkill', ['/pid', String(item.process.pid), '/f', '/t']);
      } else {
        item.process.kill('SIGKILL');
      }
      this.activeProcesses.delete(jobId);

      if (cleanupPartialFile && item.outputPath && fs.existsSync(item.outputPath)) {
        setTimeout(() => {
          try {
            if (fs.existsSync(item.outputPath)) {
              fs.unlinkSync(item.outputPath);
              logger.info(`Cleaned up partial output file: ${item.outputPath}`);
            }
          } catch (e) {
            logger.warn(`Could not remove partial file ${item.outputPath}: ${e}`);
          }
        }, 300);
      }

      logger.info(`Cancelled job ${jobId}`);
      return true;
    } catch (e) {
      logger.error(`Error cancelling job ${jobId}`, String(e));
      return false;
    }
  }

  public isProcessRunning(jobId: string): boolean {
    return this.activeProcesses.has(jobId);
  }

  public isProcessPaused(jobId: string): boolean {
    return this.activeProcesses.get(jobId)?.isPaused || false;
  }
  /**
   * Directly extracts high-fidelity JPEG frames from a video file (.mov / .mp4).
   * Maps frame numbering to VFX convention (e.g. 1001..1003) and runs at lightning speed.
   */
  public async convertVideoToJpegSequence(
    job: ConversionJob,
    onProgress?: (data: ProgressData) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpegBin = this.getFfmpegPath();
      const seq = job.sequence;
      const settings = job.settings;
      const outputDir = path.dirname(job.outputPath);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const totalFrames = Math.max(1, seq.frameCount);
      const startTime = Date.now();
      const qv = this.mapPhotoshopQualityToFfmpegQ(settings.jpegQuality || 8);
      const formatOpt = settings.jpegFormatOption || 'baseline';
      const outPatternName = `${seq.sequenceName}.%04d.jpg`;
      const outputPattern = path.join(outputDir, outPatternName);

      const extractArgs = [
        '-hide_banner',
        '-i',
        seq.firstFramePath,
        '-pix_fmt',
        'yuvj420p',
        '-q:v',
        String(qv),
        ...(formatOpt === 'baseline_optimized' ? ['-huffman', '1'] : []),
        '-start_number',
        String(seq.firstFrame || 1001),
        '-y',
        outputPattern,
        '-progress',
        'pipe:1',
      ];

      logger.info(
        `Directly extracting high-fidelity JPEGs from video ${seq.firstFramePath} for job ${job.id}`,
        `Command: ${ffmpegBin} ${extractArgs.join(' ')}`
      );

      const child = spawn(ffmpegBin, extractArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.activeProcesses.set(job.id, { process: child, isPaused: false, outputPath: job.outputPath });

      child.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const [k, val] = line.split('=');
          if (!k || val === undefined) continue;
          if (k.trim() === 'frame') {
            const f = parseInt(val.trim(), 10) || 0;
            const pct = Math.min(100, Math.round((f / totalFrames) * 100));
            if (onProgress) {
              onProgress({
                jobId: job.id,
                frame: f,
                totalFrames,
                currentFrameNumber: (seq.firstFrame || 1001) + Math.min(f, totalFrames - 1),
                percentage: pct,
                fps: 60,
                speedMultiplier: 2.0,
                etaSeconds: 0,
                elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
                fileSizeBytes: 0,
              });
            }
          }
        }
      });

      child.on('error', (err) => {
        this.activeProcesses.delete(job.id);
        reject(new Error(`Failed to extract JPEGs from video: ${err.message}`));
      });

      child.on('close', (code, sig) => {
        this.activeProcesses.delete(job.id);
        if (sig === 'SIGTERM' || sig === 'SIGKILL') {
          return reject(new Error('Conversion was cancelled by user.'));
        }
        if (code !== 0) {
          return reject(new Error(`JPEG extraction failed with exit code ${code}`));
        }
        logger.info(`Successfully extracted JPEGs from video to ${outputDir}`);
        resolve(outputPattern);
      });
    });
  }
}

export const ffmpegService = new FFmpegService();
