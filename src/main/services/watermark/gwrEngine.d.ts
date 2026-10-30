export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface WatermarkPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  size?: number;
}

export interface WatermarkConfig {
  logoSize: number;
  marginRight: number;
  marginBottom: number;
}

export interface ImageWatermarkRemovalMeta {
  applied: boolean;
  skipReason: string | null;
  size: number | null;
  position: WatermarkPosition | null;
  config: WatermarkConfig | null;
  alphaGain: number;
  passCount: number;
  source: string | null;
  decisionTier: string | null;
  qualityStatus?: string;
  selectionConfidence?: number;
  detection?: {
    adaptiveConfidence?: number | null;
    originalSpatialScore?: number;
    originalGradientScore?: number;
    processedSpatialScore?: number;
    processedGradientScore?: number;
    suppressionGain?: number;
  };
}

export interface ImageWatermarkRemovalResult {
  imageData: ImageDataLike;
  meta: ImageWatermarkRemovalMeta;
}

export interface VideoWatermarkCandidate {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  marginRight?: number;
  marginBottom?: number;
}

export interface VideoSampleFrame {
  timestamp: number;
  imageData: ImageDataLike;
}

export interface VideoDetectionTrack {
  watermarkKind: 'diamond' | 'veo-text' | string;
  position: WatermarkPosition;
  alphaMap: Float32Array;
  alphaSeed?: {
    seedGain: number;
    estimates?: number[];
    estimateCount?: number;
  };
  candidate?: VideoWatermarkCandidate;
  meanConfidence?: number;
}

export interface VideoWatermarkDetectionResult extends VideoDetectionTrack {
  detections?: VideoDetectionTrack[];
  isConfident: boolean;
  summary: {
    frameCount: number;
    minConfidence?: number;
    best?: {
      candidateId?: string;
      label?: string;
      meanSpatial?: number;
      meanGradient?: number;
      meanConfidence?: number;
      maxConfidence?: number;
      meanNcc?: number;
      votes?: number;
    };
  };
}

export interface BufferCanvasContextLike {
  canvas: { width: number; height: number };
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  putImageData(imageData: ImageDataLike, dx: number, dy: number): void;
}

export function removeWatermarkFromImageDataSync(
  imageData: ImageDataLike,
  options?: {
    adaptiveMode?: 'auto' | 'always' | 'off';
    maxPasses?: number;
  }
): ImageWatermarkRemovalResult;

export function calculateWatermarkPosition(
  imageWidth: number,
  imageHeight: number,
  config: WatermarkConfig
): WatermarkPosition;

export function detectWatermarkConfig(
  imageWidth: number,
  imageHeight: number
): WatermarkConfig;

export function removeWatermark(
  imageData: ImageDataLike,
  alphaMap: Float32Array,
  position: WatermarkPosition,
  options?: { alphaGain?: number; alphaThreshold?: number; maxAlpha?: number }
): void;

export function getEmbeddedAlphaMap(size: number | string): Float32Array;

export function resolveVideoWatermarkCandidates(
  width: number,
  height: number
): VideoWatermarkCandidate[];

export function getVideoAlphaMap(
  size: number,
  options?: Record<string, unknown>
): Float32Array;

export function detectVideoWatermarkFromFrames(params: {
  frames: VideoSampleFrame[];
  width: number;
  height: number;
  candidates?: VideoWatermarkCandidate[];
  minConfidence?: number;
  alphaMapOptions?: Record<string, unknown>;
  veoTextOptions?: Record<string, unknown>;
}): VideoWatermarkDetectionResult;

export function scoreVideoWatermarkFrame(
  imageData: ImageDataLike,
  position: WatermarkPosition,
  alphaMap: Float32Array
): { spatial: number; gradient: number; confidence: number };

export function selectVideoWatermarkDetectionForFrame(
  imageSource: BufferCanvasContextLike | ImageDataLike,
  detection: VideoWatermarkDetectionResult
): {
  detection: VideoDetectionTrack;
  frameScore: { spatial: number; gradient: number; confidence: number };
  normalizedConfidence: number;
} | null;

export function applyVideoResidualCleanup(
  ctx: BufferCanvasContextLike,
  position: WatermarkPosition,
  alphaMap: Float32Array,
  options?: {
    residualCleanupStrength?: number;
    highQualityCleanup?: boolean;
    denoiseBackend?: string;
    edgeDenoiseStrength?: number;
    textureRepair?: boolean;
    textureRepairStrength?: number;
  }
): Record<string, unknown>;

export const VIDEO_DENOISE_BACKENDS: Readonly<Record<string, string>>;
export const DEFAULT_RESIDUAL_CLEANUP_STRENGTH: number;

