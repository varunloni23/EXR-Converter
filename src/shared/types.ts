export interface ExrFrameInfo {
  frameNumber: number;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  formattedSize: string;
}

export interface ExrSequence {
  id: string;
  folderPath: string;
  sequenceName: string;
  pattern: string; // e.g. SHOT_010_%04d.exr or render.%04d.exr
  globPattern: string; // e.g. SHOT_010_*.exr
  firstFrame: number;
  lastFrame: number;
  frameCount: number;
  padding: number;
  delimiter: '.' | '_' | '';
  prefix: string;
  extension: string;
  width: number;
  height: number;
  hasMissingFrames: boolean;
  missingFrames: number[];
  firstFramePath: string;
  frames: string[];
  frameDetails?: ExrFrameInfo[];
  thumbnailDataUrl?: string;
  expectedStartFrame?: number;
  expectedEndFrame?: number;
  expectedCount?: number;
  missingHeadFrames?: number[];
  missingMiddleFrames?: number[];
  missingTailFrames?: number[];
  allMissingFrames?: number[];
  missingFileNames?: string[];
}

export interface FrameComparisonReport {
  sequenceName: string;
  folderPath: string;
  expectedStartFrame: number;
  expectedEndFrame: number;
  expectedCount: number;
  foundCount: number;
  missingCount: number;
  missingHeadFrames: number[];
  missingMiddleFrames: number[];
  missingTailFrames: number[];
  allMissingFrames: number[];
  missingFileNames: string[];
  isComplete: boolean;
}

export type PresetType = 'editorial' | 'review' | 'offline' | 'custom';

export interface PresetConfig {
  id: PresetType;
  name: string;
  description: string;
  scalePercent: number;
  fps: number;
  crf: number;
  format: 'mov' | 'mp4' | 'jpg';
  codec: 'h264';
  ffmpegPreset: 'ultrafast' | 'fast' | 'medium' | 'slow';
}

export interface ConversionSettings {
  outputFolder: string;
  outputFileName: string;
  outputFormat: 'mov' | 'mp4' | 'jpg';
  codec: 'h264';
  fps: number;
  scalePercent: number; // default 50
  targetWidth: number;
  targetHeight: number;
  quality: 'high' | 'medium' | 'draft';
  crf: number;
  ffmpegPreset: 'ultrafast' | 'fast' | 'medium' | 'slow';
  encoderEngine: 'auto' | 'libx264' | 'videotoolbox' | 'nvenc' | 'qsv' | 'amf';
  presetId: PresetType;
  conversionMode?: 'sequence' | 'individual' | 'both'; // sequence (1 video), individual (N videos), or both
  reviewDurationSeconds?: number; // loop short sequence to e.g. 3s or 5s for review
  bitrateMbps?: number; // Target Bitrate in Mbps (e.g. 40 for QuickTime MOV CBR)
  bitrateMode?: 'cbr' | 'vbr'; // Bitrate encoding (CBR or VBR)
  jpegQuality?: number; // 1 to 12 (Photoshop scale, default 8 Maximum)
  jpegFormatOption?: 'baseline' | 'baseline_optimized' | 'progressive';
  jpegScans?: number; // Progressive scans (e.g. 3, 4, 5)
  expectedStartFrame?: number; // Start frame for gap/missing scan (e.g. 1001)
  expectedEndFrame?: number;
  createSubfolder?: boolean; // Create dedicated output folder (e.g. /JPEG or /MOV)
}

export interface FolderComparisonResult {
  sourceDir: string;
  targetDir: string;
  sequenceName: string;
  sourceFormat: string; // e.g. 'EXR'
  targetFormat: string; // e.g. 'JPEG' or 'MOV'
  sourceFilesCount: number;
  targetFilesCount: number;
  sourceFrames: number[];
  targetFrames: number[];
  missingInTarget: number[]; // Frames present in source EXR but missing in converted folder
  missingFromStart: number[]; // Frames missing from expected start (e.g. 1001)
  isPerfectMatch: boolean;
  expectedStartFrame: number;
  expectedEndFrame: number;
  missingFileNames: string[];
}

export type JobStatus =
  | 'waiting'
  | 'scanning'
  | 'converting'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ConversionJob {
  id: string;
  sequenceName: string;
  inputFolder: string;
  outputFolder: string;
  outputPath: string;
  firstFrame: number;
  lastFrame: number;
  frameCount: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
  fps: number;
  outputFormat: 'mov' | 'mp4' | 'jpg';
  codec: 'h264';
  status: JobStatus;
  progress: number; // 0 to 100
  currentFrame?: number;
  processedFrames: number;
  speedFps: number;
  speedMultiplier: number;
  etaSeconds: number;
  elapsedSeconds: number;
  fileSizeBytes: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  thumbnailDataUrl?: string;
  sequence: ExrSequence;
  settings: ConversionSettings;
}

export interface HardwareInfo {
  cpuModel: string;
  cpuCores: number;
  platform: string;
  arch: string;
  gpuName?: string;
  hasGpuAcceleration: boolean;
  availableEncoders: {
    id: 'auto' | 'libx264' | 'videotoolbox' | 'nvenc' | 'qsv' | 'amf';
    name: string;
    description: string;
    isAvailable: boolean;
  }[];
  activeEncoder: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: string;
}

export interface DiskSpaceInfo {
  availableBytes: number;
  estimatedRequiredBytes: number;
  isSufficient: boolean;
  availableFormatted: string;
  requiredFormatted: string;
}

export interface FileCollisionResult {
  collision: boolean;
  existingPath: string;
  suggestedNewPath: string;
}

export interface ScanResult {
  sequences: ExrSequence[];
  totalExrFiles: number;
  folderPath: string;
  error?: string;
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatus {
  state: UpdateState;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progressPercent?: number;
  bytesPerSecond?: number;
  transferredBytes?: number;
  totalBytes?: number;
  error?: string;
}
