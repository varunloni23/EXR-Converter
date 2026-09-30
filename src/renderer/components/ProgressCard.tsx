import React from 'react';
import { Pause, Play, XCircle, Film, Clock, Gauge, Layers } from 'lucide-react';
import { ConversionJob } from '../../shared/types';

interface ProgressCardProps {
  job: ConversionJob;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({
  job,
  onPause,
  onResume,
  onCancel,
}) => {
  const isPaused = job.status === 'paused';

  const formatEta = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return 'Calculating...';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="studio-card p-6 select-none max-w-3xl mx-auto w-full border-studio-accent/40 shadow-glow-accent">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-studio-border">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 rounded-full bg-studio-accent animate-ping" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-studio-accent">
            {isPaused ? 'PAUSED' : 'CONVERTING SEQUENCE'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Pause / Resume button */}
          {isPaused ? (
            <button
              onClick={onResume}
              className="studio-button-secondary px-3 py-1.5 text-xs font-medium flex items-center space-x-1.5 text-studio-success hover:border-studio-success/50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume</span>
            </button>
          ) : (
            <button
              onClick={onPause}
              className="studio-button-secondary px-3 py-1.5 text-xs font-medium flex items-center space-x-1.5 text-studio-warning hover:border-studio-warning/50"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}

          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="studio-button-secondary px-3 py-1.5 text-xs font-medium flex items-center space-x-1.5 text-studio-error hover:bg-studio-error/10 hover:border-studio-error/40"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      {/* Main progress center */}
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-studio-text font-mono">
              {job.sequenceName}
            </h2>
            <p className="text-xs font-mono text-studio-textMuted mt-0.5">
              {job.targetWidth} × {job.targetHeight} • {job.fps} FPS • H.264 {job.outputFormat.toUpperCase()}
            </p>
          </div>

          <div className="text-right">
            <span className="text-3xl font-extrabold font-mono text-studio-accent tracking-tight">
              {job.progress}%
            </span>
            <p className="text-xs font-mono text-studio-textSecondary">
              {job.processedFrames} / {job.frameCount} frames
            </p>
          </div>
        </div>

        {/* Dynamic Progress Bar with animated gradient glow */}
        <div className="relative w-full h-4 bg-studio-bg rounded-full overflow-hidden border border-studio-border p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isPaused
                ? 'bg-studio-warning'
                : 'bg-gradient-to-r from-studio-accent via-[#9175ff] to-studio-accent'
            }`}
            style={{ width: `${Math.max(2, job.progress)}%` }}
          />
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {/* Current Frame */}
          <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
            <div className="flex items-center space-x-1.5 text-[10px] font-mono uppercase tracking-wider text-studio-textMuted mb-1">
              <Film className="w-3 h-3 text-studio-accent" />
              <span>Current Frame</span>
            </div>
            <span className="text-base font-semibold text-studio-text font-mono">
              {job.currentFrame || job.firstFrame}
            </span>
          </div>

          {/* Speed */}
          <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
            <div className="flex items-center space-x-1.5 text-[10px] font-mono uppercase tracking-wider text-studio-textMuted mb-1">
              <Gauge className="w-3 h-3 text-studio-success" />
              <span>Speed</span>
            </div>
            <span className="text-base font-semibold text-studio-text font-mono">
              {job.speedFps > 0 ? `${job.speedFps} fps` : '--'}
            </span>
            {job.speedMultiplier > 0 && (
              <span className="text-[10px] font-mono text-studio-textMuted ml-1">
                ({job.speedMultiplier}x)
              </span>
            )}
          </div>

          {/* Remaining ETA */}
          <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
            <div className="flex items-center space-x-1.5 text-[10px] font-mono uppercase tracking-wider text-studio-textMuted mb-1">
              <Clock className="w-3 h-3 text-studio-warning" />
              <span>Est. Remaining</span>
            </div>
            <span className="text-base font-semibold text-studio-text font-mono">
              {formatEta(job.etaSeconds)}
            </span>
          </div>

          {/* File Size */}
          <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
            <div className="flex items-center space-x-1.5 text-[10px] font-mono uppercase tracking-wider text-studio-textMuted mb-1">
              <Layers className="w-3 h-3 text-studio-accent" />
              <span>File Size</span>
            </div>
            <span className="text-base font-semibold text-studio-text font-mono">
              {formatBytes(job.fileSizeBytes)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
