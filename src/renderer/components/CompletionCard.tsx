import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Play,
  Pause,
  FolderOpen,
  RefreshCw,
  Film,
  RotateCcw,
  SkipBack,
  SkipForward,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCheck,
  FolderCheck,
  Search,
} from 'lucide-react';
import { ConversionJob } from '../../shared/types';

interface CompletionCardProps {
  job: ConversionJob;
  onOpenVideo: () => void;
  onOpenFolder: () => void;
  onConvertAnother: () => void;
  onCompareFolders?: () => void;
  onOpenSourceFolder?: () => void;
}

export const CompletionCard: React.FC<CompletionCardProps> = ({
  job,
  onOpenVideo,
  onOpenFolder,
  onConvertAnother,
  onCompareFolders,
  onOpenSourceFolder,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrameNumber, setCurrentFrameNumber] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(true);
  const [showFramesList, setShowFramesList] = useState(false);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileName = job.outputPath.split(/[/\\]/).pop() || `${job.sequenceName}.mp4`;
  const frameDuration = 1 / (job.fps || 24);
  const videoSrc = `media://${encodeURIComponent(job.outputPath)}`;

  // Track video frame updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const frameIdx = Math.min(
        job.frameCount,
        Math.max(1, Math.floor(video.currentTime / frameDuration) + 1)
      );
      setCurrentFrameNumber(frameIdx);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [job.frameCount, frameDuration]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
    } else {
      videoRef.current.pause();
    }
  };

  const stepFrame = (delta: number) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    const newTime = Math.max(
      0,
      Math.min(videoRef.current.duration || 1, videoRef.current.currentTime + delta * frameDuration)
    );
    videoRef.current.currentTime = newTime;
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  return (
    <div className="studio-card p-6 select-none max-w-3xl mx-auto w-full border-studio-success/40 shadow-glow-success space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-studio-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-studio-successMuted border border-studio-success/30 flex items-center justify-center text-studio-success flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-studio-text flex items-center space-x-2">
              <span>Conversion Complete</span>
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-studio-success/20 text-studio-success border border-studio-success/30">
                {job.frameCount} Frames Enqueued &amp; Merged
              </span>
            </h2>
            <p className="text-xs text-studio-textSecondary font-mono">{fileName}</p>
          </div>
        </div>

        <button
          onClick={onConvertAnother}
          className="studio-button-secondary px-3 py-1.5 text-xs font-medium flex items-center space-x-1.5 text-studio-textSecondary hover:text-studio-text"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Convert Another</span>
        </button>
      </div>

      {/* Embedded Studio Video Player */}
      <div className="rounded-xl overflow-hidden bg-black border border-studio-border shadow-inner">
        <div className="relative aspect-video max-h-[360px] flex items-center justify-center bg-black/90 group">
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay
            loop={isLooping}
            muted
            playsInline
            onClick={togglePlay}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* Frame Number Overlay Badge */}
          <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/80 backdrop-blur-md border border-white/10 text-xs font-mono text-white flex items-center space-x-1.5">
            <Film className="w-3.5 h-3.5 text-studio-accent" />
            <span className="font-semibold text-studio-accent">Frame {currentFrameNumber}</span>
            <span className="text-studio-textMuted">/</span>
            <span>{job.frameCount}</span>
            <span className="text-[10px] text-studio-textMuted font-mono ml-1">
              (F.{job.firstFrame + currentFrameNumber - 1})
            </span>
          </div>

          {/* Looping Status Badge */}
          {isLooping && (
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-studio-accent/20 border border-studio-accent/40 text-[10px] font-mono text-studio-accent flex items-center space-x-1">
              <RotateCcw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '4s' }} />
              <span>Looping</span>
            </div>
          )}
        </div>

        {/* Video Player Control Bar */}
        <div className="bg-studio-card p-3 border-t border-studio-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center space-x-2">
            <button
              onClick={togglePlay}
              className="studio-button-primary p-2 rounded-lg text-white"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            {/* Frame-by-frame step buttons */}
            <button
              onClick={() => stepFrame(-1)}
              className="studio-button-secondary p-2 rounded-lg text-studio-textSecondary hover:text-studio-text"
              title="Previous Frame"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => stepFrame(1)}
              className="studio-button-secondary p-2 rounded-lg text-studio-textSecondary hover:text-studio-text"
              title="Next Frame"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono text-studio-textSecondary px-2">
              Frame <strong className="text-studio-text">{currentFrameNumber}</strong> of {job.frameCount}
            </span>
          </div>

          {/* Speed & Loop Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsLooping(!isLooping)}
              className={`px-2.5 py-1 rounded text-xs font-mono border transition-all ${
                isLooping
                  ? 'bg-studio-accent/20 border-studio-accent text-studio-accent'
                  : 'bg-studio-bg border-studio-border text-studio-textMuted'
              }`}
              title="Toggle Loop"
            >
              Loop
            </button>

            <div className="flex items-center rounded border border-studio-border bg-studio-bg text-xs font-mono">
              {[0.25, 0.5, 1].map((rate) => (
                <button
                  key={rate}
                  onClick={() => changeSpeed(rate)}
                  className={`px-2 py-1 text-[11px] transition-colors ${
                    playbackRate === rate
                      ? 'bg-studio-accent text-white font-semibold'
                      : 'text-studio-textSecondary hover:text-studio-text'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Video Specs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
          <span className="text-[10px] uppercase font-mono tracking-wider text-studio-textMuted block">
            Resolution
          </span>
          <span className="text-sm font-semibold text-studio-text font-mono">
            {job.targetWidth} × {job.targetHeight}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
          <span className="text-[10px] uppercase font-mono tracking-wider text-studio-textMuted block">
            Frame Rate
          </span>
          <span className="text-sm font-semibold text-studio-text font-mono">
            {job.fps} FPS
          </span>
        </div>

        <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
          <span className="text-[10px] uppercase font-mono tracking-wider text-studio-textMuted block">
            Frames Encoded
          </span>
          <span className="text-sm font-semibold text-studio-text font-mono">
            {job.frameCount} frames
          </span>
          <span className="text-[10px] text-studio-textMuted font-mono block">
            {job.firstFrame} → {job.lastFrame}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
          <span className="text-[10px] uppercase font-mono tracking-wider text-studio-textMuted block">
            Size / Render Time
          </span>
          <span className="text-sm font-semibold text-studio-text font-mono">
            {formatBytes(job.fileSizeBytes)} • {job.elapsedSeconds}s
          </span>
        </div>
      </div>

      {/* Output File Path Bar */}
      <div className="p-3 rounded-lg bg-studio-bg border border-studio-border flex items-center justify-between gap-3">
        <div className="truncate">
          <span className="text-[10px] uppercase font-mono tracking-wider text-studio-textMuted block mb-0.5">
            Output File Location
          </span>
          <p className="text-xs font-mono text-studio-text truncate select-all" title={job.outputPath}>
            {job.outputPath}
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            onClick={onOpenVideo}
            className="studio-button-primary px-4 py-2 text-xs font-medium flex items-center space-x-1.5"
            title="Open in default video player (e.g. QuickTime)"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Open in QuickTime</span>
          </button>

          <button
            onClick={onOpenFolder}
            className="studio-button-secondary px-3 py-2 text-xs font-medium flex items-center space-x-1.5"
            title="Reveal video in Finder"
          >
            <FolderOpen className="w-3.5 h-3.5 text-studio-accent" />
            <span>Reveal in Finder</span>
          </button>
        </div>
      </div>

      {/* 2-Folder Verification & Comparison Banner */}
      <div className="p-3.5 rounded-lg bg-studio-bg/80 border border-studio-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-studio-accent/20 border border-studio-accent/30 text-studio-accent flex items-center justify-center flex-shrink-0">
            <FolderCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold text-studio-text flex items-center space-x-2">
              <span>2-Folder Verification & Missing Frames Compare</span>
            </div>
            <div className="text-[11px] text-studio-textSecondary font-mono mt-0.5">
              Compare source EXR folder with converted {job.outputFormat.toUpperCase()} folder to verify all frames exist
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          {onOpenSourceFolder && (
            <button
              onClick={onOpenSourceFolder}
              className="studio-button-secondary px-3 py-1.5 text-xs font-mono flex items-center space-x-1.5 cursor-pointer text-studio-textSecondary hover:text-studio-text"
              title="Reveal source EXR folder"
            >
              <FolderOpen className="w-3.5 h-3.5 text-studio-textMuted" />
              <span>Source Folder</span>
            </button>
          )}

          {onCompareFolders && (
            <button
              onClick={onCompareFolders}
              className="studio-button-primary px-3.5 py-1.5 text-xs font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
              title="Open side-by-side 2-Folder Comparison Modal"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Compare 2 Folders</span>
            </button>
          )}
        </div>
      </div>

      {/* Converted Frames Confirmation Toggle */}
      <div className="border border-studio-border rounded-lg bg-studio-bg/60 p-3">
        <button
          onClick={() => setShowFramesList(!showFramesList)}
          className="w-full flex items-center justify-between text-xs font-mono text-studio-textSecondary hover:text-studio-text transition-colors"
        >
          <div className="flex items-center space-x-2">
            <FileCheck className="w-4 h-4 text-studio-success" />
            <span className="font-semibold text-studio-text">
              Verified: All {job.frameCount} EXR frames were encoded into this video
            </span>
          </div>
          <div className="flex items-center space-x-1 text-studio-accent text-[11px]">
            <span>{showFramesList ? 'Hide Frame Details' : 'Show Encoded Frames'}</span>
            {showFramesList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {showFramesList && (
          <div className="mt-3 pt-3 border-t border-studio-border/60 max-h-40 overflow-y-auto scrollbar-thin">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-studio-textMuted border-b border-studio-border">
                <tr>
                  <th className="py-1 px-2">Frame #</th>
                  <th className="py-1 px-2">File Source</th>
                  <th className="py-1 px-2 text-right">Timecode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-studio-border/40 text-studio-textSecondary">
                {Array.from({ length: job.frameCount }).map((_, i) => {
                  const frameNum = job.firstFrame + i;
                  const timecode = (i * frameDuration).toFixed(2);
                  return (
                    <tr key={frameNum} className="hover:bg-studio-card/50">
                      <td className="py-1 px-2 text-studio-accent font-semibold">{frameNum}</td>
                      <td className="py-1 px-2 text-studio-text truncate max-w-[280px]">
                        {job.sequence?.frameDetails?.[i]?.fileName || `${job.sequenceName}.${frameNum}.exr`}
                      </td>
                      <td className="py-1 px-2 text-right text-studio-textMuted">{timecode}s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
