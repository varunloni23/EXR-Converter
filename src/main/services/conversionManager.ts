import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { ConversionJob, ConversionSettings, ExrSequence, JobStatus } from '../../shared/types';
import { ffmpegService, ProgressData } from './ffmpegService';
import { logger } from './logger';
import { historyService } from './historyService';

export class ConversionManager {
  private jobs: Map<string, ConversionJob> = new Map();
  private activeJobId: string | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    try {
      const historicalJobs = historyService.getHistory();
      for (const job of historicalJobs) {
        this.jobs.set(job.id, job);
      }
    } catch (e) {}
  }

  public setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
    if (this.mainWindow) {
      this.broadcastState();
    }
  }

  public createJob(sequence: ExrSequence, settings: ConversionSettings): ConversionJob {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let targetFolder = settings.outputFolder || '';

    // Normalize format-specific folder tags to prevent cross-contamination (e.g. JPEG going into _MOV)
    if (settings.outputFormat === 'jpg' || (settings.outputFormat as string) === 'jpeg') {
      targetFolder = targetFolder.replace(/_MOV$/i, '_JPEG').replace(/[/\\]MOV$/i, path.sep + 'JPEG');
    } else if (settings.outputFormat === 'mov') {
      targetFolder = targetFolder.replace(/_JPEG$/i, '_MOV').replace(/[/\\]JPEG$/i, path.sep + 'MOV');
    }

    // Check if targetFolder is empty, points to sequence folder, or is inside sequence folder
    const seqFolderClean = path.resolve(sequence.folderPath);
    let resolvedTarget = targetFolder ? path.resolve(targetFolder) : '';

    const isInsideSubfolder =
      resolvedTarget === path.join(seqFolderClean, 'JPEG') ||
      resolvedTarget === path.join(seqFolderClean, 'MOV') ||
      resolvedTarget === path.join(seqFolderClean, 'MP4');

    if (!resolvedTarget || resolvedTarget === seqFolderClean || isInsideSubfolder) {
      // Sibling folder outside sequence.folderPath so test1 is never polluted with output files/folders
      const parentDir = path.dirname(seqFolderClean);
      const folderName = path.basename(seqFolderClean).replace(/_(JPEG|MOV|MP4)$/i, '');
      const tag = settings.outputFormat === 'jpg' || (settings.outputFormat as string) === 'jpeg' ? '_JPEG' : settings.outputFormat === 'mov' ? '_MOV' : `_${settings.outputFormat.toUpperCase()}`;
      if (parentDir === '/' || parentDir === path.parse(seqFolderClean).root) {
        targetFolder = path.join(seqFolderClean, tag.replace(/^_/, ''));
      } else {
        targetFolder = path.join(parentDir, `${folderName}${tag}`);
      }
    } else {
      try {
        if (fs.existsSync(targetFolder) && fs.statSync(targetFolder).isFile()) {
          targetFolder = path.dirname(targetFolder);
        }
      } catch (e) {}
    }

    // Ensure output folder exists
    try {
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
        logger.info(`Auto-created dedicated output directory: ${targetFolder}`);
      }
    } catch (e: any) {
      logger.error(`Error ensuring target directory ${targetFolder}: ${e.message}`);
    }

    const outputFileName = settings.outputFileName || `${sequence.sequenceName}.${settings.outputFormat}`;
    const outputPath = path.join(targetFolder, outputFileName);

    const dims = ffmpegService.calculateDimensions(
      sequence.width,
      sequence.height,
      settings.scalePercent
    );

    const job: ConversionJob = {
      id: jobId,
      sequenceName: sequence.sequenceName,
      inputFolder: sequence.folderPath,
      outputFolder: targetFolder,
      outputPath,
      firstFrame: sequence.firstFrame,
      lastFrame: sequence.lastFrame,
      frameCount: sequence.frameCount,
      width: sequence.width,
      height: sequence.height,
      targetWidth: dims.targetWidth,
      targetHeight: dims.targetHeight,
      fps: settings.fps,
      outputFormat: settings.outputFormat,
      codec: settings.codec,
      status: 'waiting',
      progress: 0,
      processedFrames: 0,
      speedFps: 0,
      speedMultiplier: 0,
      etaSeconds: 0,
      elapsedSeconds: 0,
      fileSizeBytes: 0,
      thumbnailDataUrl: sequence.thumbnailDataUrl,
      sequence,
      settings,
    };

    this.jobs.set(jobId, job);
    logger.info(`Job created: ${jobId} for sequence ${sequence.sequenceName}`);
    this.broadcastState();
    return job;
  }

  private activeJobPromises: Map<string, Promise<ConversionJob>> = new Map();

  public async startJob(jobId: string): Promise<ConversionJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const jobPromise = (async () => {
      this.activeJobId = jobId;
      job.status = 'converting';
      job.startedAt = Date.now();
      job.error = undefined;
      this.broadcastState();

      try {
        await ffmpegService.convertSequence(job, (progressData: ProgressData) => {
          job.progress = progressData.percentage;
          job.currentFrame = progressData.currentFrameNumber;
          job.processedFrames = progressData.frame;
          job.speedFps = progressData.fps;
          job.speedMultiplier = progressData.speedMultiplier;
          job.etaSeconds = progressData.etaSeconds;
          job.elapsedSeconds = progressData.elapsedSeconds;
          job.fileSizeBytes = progressData.fileSizeBytes;

          this.sendToRenderer('job:progress', job);
        });

        job.status = 'completed';
        job.progress = 100;
        job.completedAt = Date.now();
        this.activeJobId = null;
        historyService.addJob(job);
        logger.success(`Job ${jobId} finished successfully.`);
        this.sendToRenderer('job:completed', job);
        this.broadcastState();
        return job;
      } catch (err: any) {
        if ((job.status as string) !== 'cancelled') {
          job.status = 'failed';
          job.error = err.message || 'Conversion failed';
          this.activeJobId = null;
          historyService.addJob(job);
          logger.error(`Job ${jobId} failed: ${job.error}`);
          this.sendToRenderer('job:failed', job);
          this.broadcastState();
        }
        throw err;
      } finally {
        this.activeJobPromises.delete(jobId);
      }
    })();

    this.activeJobPromises.set(jobId, jobPromise);
    return jobPromise;
  }

  public async waitForJob(jobId: string): Promise<ConversionJob | null> {
    const active = this.activeJobPromises.get(jobId);
    if (active) {
      try {
        return await active;
      } catch (e) {
        return this.jobs.get(jobId) || null;
      }
    }
    return this.jobs.get(jobId) || null;
  }

  public pauseJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'converting') return false;

    const paused = ffmpegService.pause(jobId);
    if (paused) {
      job.status = 'paused';
      this.sendToRenderer('job:paused', job);
      this.broadcastState();
      return true;
    }
    return false;
  }

  public resumeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'paused') return false;

    const resumed = ffmpegService.resume(jobId);
    if (resumed) {
      job.status = 'converting';
      this.sendToRenderer('job:resumed', job);
      this.broadcastState();
      return true;
    }
    return false;
  }

  public cancelJob(jobId: string, cleanupFile: boolean = true): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = 'cancelled';
    ffmpegService.cancel(jobId, cleanupFile);
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
    }
    this.sendToRenderer('job:cancelled', job);
    this.broadcastState();
    return true;
  }

  public getJob(jobId: string): ConversionJob | undefined {
    return this.jobs.get(jobId);
  }

  public getAllJobs(): ConversionJob[] {
    return Array.from(this.jobs.values());
  }

  public clearCompletedJobs() {
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') {
        this.jobs.delete(id);
      }
    }
    historyService.clearHistory();
    this.broadcastState();
  }

  private broadcastState() {
    this.sendToRenderer('jobs:update', this.getAllJobs());
  }

  private sendToRenderer(channel: string, payload: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }
}

export const conversionManager = new ConversionManager();
