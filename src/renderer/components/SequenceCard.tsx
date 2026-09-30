import React, { useState } from 'react';
import {
  Film,
  CheckCircle2,
  AlertTriangle,
  FolderSync,
  Layers,
  RefreshCw,
  List,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  FileCheck,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { ExrSequence } from '../../shared/types';

interface SequenceCardProps {
  sequence: ExrSequence;
  allSequences: ExrSequence[];
  onSelectSequence: (sequence: ExrSequence) => void;
  onSelectAnotherFolder: () => void;
  onOpenMissingFramesModal: () => void;
  isGeneratingThumbnail: boolean;
}

export const SequenceCard: React.FC<SequenceCardProps> = ({
  sequence,
  allSequences,
  onSelectSequence,
  onSelectAnotherFolder,
  onOpenMissingFramesModal,
  isGeneratingThumbnail,
}) => {
  const [showFileList, setShowFileList] = useState(false);

  const durationSeconds = (sequence.frameCount / 24).toFixed(2);

  const handleReveal = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.electronAPI?.revealInFolder) {
      window.electronAPI.revealInFolder(filePath);
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.electronAPI?.openDirectory) {
      window.electronAPI.openDirectory(sequence.folderPath);
    }
  };

  return (
    <div className="studio-card p-5 select-none space-y-4">
      {/* Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-studio-border/60">
        <div className="flex items-center space-x-2">
          <Film className="w-4 h-4 text-studio-accent" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-studio-textSecondary">
            Source Sequence
          </span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-studio-accent/15 text-studio-accent border border-studio-accent/25">
            {sequence.frameCount} {sequence.frameCount === 1 ? 'file' : 'files'}
          </span>
        </div>

        <button
          onClick={onSelectAnotherFolder}
          className="flex items-center space-x-1.5 text-xs text-studio-textSecondary hover:text-studio-text px-2.5 py-1 rounded-lg bg-studio-bg/60 border border-studio-border/60 hover:border-studio-border transition-colors cursor-pointer"
          title="Choose a different folder"
        >
          <FolderSync className="w-3.5 h-3.5 text-studio-accent" />
          <span>Change Folder</span>
        </button>
      </div>

      {/* Multiple Shots Tabs (if more than 1 sequence detected) */}
      {allSequences.length > 1 && (
        <div className="p-2 rounded-lg bg-studio-bg/80 border border-studio-border/60">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
            {allSequences.map((seq) => {
              const isSelected = seq.id === sequence.id;
              return (
                <button
                  key={seq.id}
                  onClick={() => onSelectSequence(seq)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-mono transition-all flex-shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-studio-accent text-white shadow-glow-accent font-semibold'
                      : 'bg-studio-card/80 border border-studio-border/60 text-studio-textSecondary hover:text-studio-text'
                  }`}
                >
                  <span>{seq.sequenceName}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${isSelected ? 'bg-black/40 text-white' : 'bg-studio-bg text-studio-textMuted'}`}>
                    {seq.frameCount}f
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Sequence Row: Compact Thumbnail + Clean Metadata */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Thumbnail Preview */}
        <div className="w-full sm:w-44 h-28 rounded-xl bg-studio-bg border border-studio-border/80 relative overflow-hidden flex-shrink-0 flex items-center justify-center shadow-inner">
          {sequence.thumbnailDataUrl ? (
            <img
              src={sequence.thumbnailDataUrl}
              alt={`${sequence.sequenceName} frame ${sequence.firstFrame}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-3 text-center">
              {isGeneratingThumbnail ? (
                <RefreshCw className="w-5 h-5 text-studio-accent animate-spin" />
              ) : (
                <Film className="w-6 h-6 text-studio-textMuted" />
              )}
            </div>
          )}

          {/* Minimal overlays on thumbnail */}
          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[9px] font-mono text-studio-textSecondary border border-white/10">
            F.{sequence.firstFrame}
          </div>
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[9px] font-mono text-studio-textSecondary border border-white/10">
            {sequence.width}×{sequence.height}
          </div>
        </div>

        {/* Info & Metadata */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-bold tracking-tight text-studio-text font-mono truncate">
              {sequence.sequenceName}
            </h3>

            {/* Sequence Status Badge */}
            {sequence.hasMissingFrames ? (
              <div className="flex items-center space-x-1.5">
                <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-studio-warningMuted text-studio-warning border border-studio-warning/30">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{sequence.missingFrames.length} missing frames</span>
                </span>
                <button
                  onClick={onOpenMissingFramesModal}
                  className="text-xs font-medium text-studio-warning hover:underline cursor-pointer"
                >
                  View
                </button>
              </div>
            ) : (
              <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-studio-successMuted text-studio-success border border-studio-success/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete Sequence</span>
              </span>
            )}
          </div>

          {/* Path row with Open button */}
          <div className="flex items-center space-x-2 text-xs text-studio-textMuted font-mono">
            <span className="truncate max-w-md text-studio-textSecondary" title={sequence.folderPath}>
              {sequence.folderPath}
            </span>
            <button
              onClick={handleOpenFolder}
              className="text-studio-accent hover:text-studio-accentHover flex items-center space-x-0.5 flex-shrink-0 cursor-pointer"
              title="Open folder in Finder"
            >
              <FolderOpen className="w-3 h-3" />
              <span>Open</span>
            </button>
          </div>

          {/* Minimal Inline Metadata Row */}
          <div className="flex items-center space-x-3 text-xs font-mono text-studio-textSecondary pt-1">
            <span className="text-studio-text font-medium">
              Frames {sequence.firstFrame} → {sequence.lastFrame} ({sequence.frameCount}f)
            </span>
            <span>•</span>
            <span>{sequence.width} × {sequence.height}</span>
            <span>•</span>
            <span>{durationSeconds}s @ 24fps</span>
            <span>•</span>
            <button
              onClick={() => setShowFileList(!showFileList)}
              className="text-studio-accent hover:underline flex items-center space-x-0.5 cursor-pointer font-medium"
            >
              <span>{showFileList ? 'Hide files' : `View ${sequence.frameCount} files`}</span>
              {showFileList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Detected Files Table */}
      {showFileList && (
        <div className="pt-2 border-t border-studio-border/60 animate-in fade-in duration-200">
          <div className="max-h-48 overflow-y-auto rounded-lg border border-studio-border/80 bg-studio-bg/90 scrollbar-thin">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-studio-card/80 text-studio-textMuted border-b border-studio-border/80 sticky top-0 backdrop-blur-sm">
                <tr>
                  <th className="py-1.5 px-3 font-semibold">#</th>
                  <th className="py-1.5 px-3 font-semibold">File Name</th>
                  <th className="py-1.5 px-3 font-semibold">Frame</th>
                  <th className="py-1.5 px-3 font-semibold">Size</th>
                  <th className="py-1.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-studio-border/40 text-studio-textSecondary">
                {(sequence.frameDetails && sequence.frameDetails.length > 0
                  ? sequence.frameDetails
                  : sequence.frames.map((filePath, i) => ({
                      frameNumber: sequence.firstFrame + i,
                      fileName: filePath.split(/[/\\]/).pop() || `frame.${sequence.firstFrame + i}.exr`,
                      filePath,
                      fileSizeBytes: 0,
                      formattedSize: '--',
                    }))
                ).map((frame, idx) => (
                  <tr key={frame.filePath || idx} className="hover:bg-studio-card/40 transition-colors">
                    <td className="py-1 px-3 text-studio-textMuted">{idx + 1}</td>
                    <td className="py-1 px-3 text-studio-text font-medium truncate max-w-[240px]" title={frame.fileName}>
                      {frame.fileName}
                    </td>
                    <td className="py-1 px-3 text-studio-accent font-semibold">{frame.frameNumber}</td>
                    <td className="py-1 px-3 text-studio-textMuted">{frame.formattedSize || '--'}</td>
                    <td className="py-1 px-3 text-right">
                      <button
                        onClick={(e) => handleReveal(frame.filePath, e)}
                        className="text-[11px] text-studio-accent hover:underline inline-flex items-center space-x-1 cursor-pointer"
                        title="Reveal file in Finder"
                      >
                        <span>Reveal</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
