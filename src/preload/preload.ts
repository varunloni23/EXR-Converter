import { contextBridge, ipcRenderer } from 'electron';
import {
  ExrSequence,
  ConversionSettings,
  ConversionJob,
  HardwareInfo,
  LogEntry,
  ScanResult,
  DiskSpaceInfo,
  FileCollisionResult,
  FrameComparisonReport,
  FolderComparisonResult,
  UpdateStatus,
} from '../shared/types';

export interface ElectronAPI {
  selectInputFolder: () => Promise<string | string[] | null>;
  selectOutputFolder: (defaultPath?: string) => Promise<string | null>;
  scanFolder: (folderPath: string | string[], singleFileOnly?: boolean) => Promise<ScanResult>;
  generateThumbnail: (filePath: string) => Promise<string | null>;
  checkFileCollision: (
    folder: string,
    fileName: string,
    ext: string
  ) => Promise<FileCollisionResult>;
  checkDiskSpace: (
    folder: string,
    frames: number,
    fps: number,
    w: number,
    h: number
  ) => Promise<DiskSpaceInfo>;
  getHardwareInfo: () => Promise<HardwareInfo>;
  startConversion: (
    sequence: ExrSequence,
    settings: ConversionSettings
  ) => Promise<ConversionJob>;
  pauseConversion: (jobId: string) => Promise<boolean>;
  resumeConversion: (jobId: string) => Promise<boolean>;
  cancelConversion: (jobId: string, cleanupFile?: boolean) => Promise<boolean>;
  openVideo: (filePath: string) => Promise<boolean>;
  revealInFolder: (filePath: string) => Promise<void>;
  openDirectory: (dirPath: string) => Promise<void>;
  getLogs: () => Promise<LogEntry[]>;
  openLogFolder: () => Promise<void>;
  generateSampleSequence: (targetDir?: string) => Promise<ScanResult>;
  getInitialPath: () => Promise<any>;
  getSettings: () => Promise<ConversionSettings>;
  saveSettings: (settings: Partial<ConversionSettings>) => Promise<ConversionSettings>;
  getHistory: () => Promise<ConversionJob[]>;
  clearHistory: () => Promise<boolean>;
  waitForJob: (jobId: string) => Promise<ConversionJob | null>;
  notifyCompletion: (title: string, body: string) => Promise<boolean>;
  compareFrames: (
    sequence: ExrSequence,
    customStart?: number,
    customEnd?: number
  ) => Promise<FrameComparisonReport>;
  saveMissingReport: (
    folderPath: string,
    report: FrameComparisonReport
  ) => Promise<string | null>;
  compareFolders: (
    sourceDir: string,
    targetDir: string,
    customStart?: number,
    customEnd?: number
  ) => Promise<FolderComparisonResult>;
  saveFolderComparisonReport: (
    targetDir: string,
    report: FolderComparisonResult
  ) => Promise<string | null>;

  // Auto Updater
  checkForUpdates: () => Promise<UpdateStatus>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  quitAndInstallUpdate: () => Promise<boolean>;

  // Subscriptions
  onOpenPath: (callback: (data: { path: string; autoStart?: boolean } | string) => void) => () => void;
  onProgress: (callback: (job: ConversionJob) => void) => () => void;
  onJobCompleted: (callback: (job: ConversionJob) => void) => () => void;
  onJobFailed: (callback: (job: ConversionJob) => void) => () => void;
  onJobCancelled: (callback: (job: ConversionJob) => void) => () => void;
  onJobsUpdate: (callback: (jobs: ConversionJob[]) => void) => () => void;
  onNewLog: (callback: (log: LogEntry) => void) => () => void;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

const api: ElectronAPI = {
  selectInputFolder: () => ipcRenderer.invoke('dialog:selectInputFolder'),
  selectOutputFolder: (defaultPath) =>
    ipcRenderer.invoke('dialog:selectOutputFolder', defaultPath),
  scanFolder: (folderPath, singleFileOnly) =>
    ipcRenderer.invoke('sequence:scan', folderPath, singleFileOnly),
  generateThumbnail: (filePath) =>
    ipcRenderer.invoke('thumbnail:generate', filePath),
  checkFileCollision: (folder, fileName, ext) =>
    ipcRenderer.invoke('file:collision', folder, fileName, ext),
  checkDiskSpace: (folder, frames, fps, w, h) =>
    ipcRenderer.invoke('file:diskSpace', folder, frames, fps, w, h),
  getHardwareInfo: () => ipcRenderer.invoke('hardware:getInfo'),
  startConversion: (sequence, settings) =>
    ipcRenderer.invoke('conversion:start', sequence, settings),
  pauseConversion: (jobId) => ipcRenderer.invoke('conversion:pause', jobId),
  resumeConversion: (jobId) => ipcRenderer.invoke('conversion:resume', jobId),
  cancelConversion: (jobId, cleanupFile) =>
    ipcRenderer.invoke('conversion:cancel', jobId, cleanupFile),
  openVideo: (filePath) => ipcRenderer.invoke('file:openVideo', filePath),
  revealInFolder: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  openDirectory: (dirPath) => ipcRenderer.invoke('file:openDirectory', dirPath),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  openLogFolder: () => ipcRenderer.invoke('logs:openFolder'),
  generateSampleSequence: (targetDir) =>
    ipcRenderer.invoke('sequence:generateSample', targetDir),
  getInitialPath: () => ipcRenderer.invoke('app:getInitialPath'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  waitForJob: (jobId) => ipcRenderer.invoke('conversion:waitForJob', jobId),
  notifyCompletion: (title, body) => ipcRenderer.invoke('notify:completion', { title, body }),
  compareFrames: (sequence, customStart, customEnd) =>
    ipcRenderer.invoke('sequence:compareFrames', sequence, customStart, customEnd),
  saveMissingReport: (folderPath, report) =>
    ipcRenderer.invoke('sequence:saveMissingReport', folderPath, report),
  compareFolders: (sourceDir, targetDir, customStart, customEnd) =>
    ipcRenderer.invoke('sequence:compareFolders', sourceDir, targetDir, customStart, customEnd),
  saveFolderComparisonReport: (targetDir, report) =>
    ipcRenderer.invoke('sequence:saveFolderComparisonReport', targetDir, report),

  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getUpdateStatus: () => ipcRenderer.invoke('updater:getStatus'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater:quitAndInstall'),

  onOpenPath: (callback) => {
    const handler = (_: any, data: { path: string; autoStart?: boolean } | string) => callback(data);
    ipcRenderer.on('app:openPath', handler);
    return () => ipcRenderer.removeListener('app:openPath', handler);
  },

  onProgress: (callback) => {
    const handler = (_: any, job: ConversionJob) => callback(job);
    ipcRenderer.on('job:progress', handler);
    return () => ipcRenderer.removeListener('job:progress', handler);
  },
  onJobCompleted: (callback) => {
    const handler = (_: any, job: ConversionJob) => callback(job);
    ipcRenderer.on('job:completed', handler);
    return () => ipcRenderer.removeListener('job:completed', handler);
  },
  onJobFailed: (callback) => {
    const handler = (_: any, job: ConversionJob) => callback(job);
    ipcRenderer.on('job:failed', handler);
    return () => ipcRenderer.removeListener('job:failed', handler);
  },
  onJobCancelled: (callback) => {
    const handler = (_: any, job: ConversionJob) => callback(job);
    ipcRenderer.on('job:cancelled', handler);
    return () => ipcRenderer.removeListener('job:cancelled', handler);
  },
  onJobsUpdate: (callback) => {
    const handler = (_: any, jobs: ConversionJob[]) => callback(jobs);
    ipcRenderer.on('jobs:update', handler);
    return () => ipcRenderer.removeListener('jobs:update', handler);
  },
  onNewLog: (callback) => {
    const handler = (_: any, log: LogEntry) => callback(log);
    ipcRenderer.on('log:entry', handler);
    return () => ipcRenderer.removeListener('log:entry', handler);
  },
  onUpdateStatus: (callback) => {
    const handler = (_: any, status: UpdateStatus) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
