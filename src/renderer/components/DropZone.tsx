import React, { useState } from 'react';
import { FolderOpen } from 'lucide-react';

interface DropZoneProps {
  onSelectFolder: () => void;
  onDropPath: (folderPath: string | string[]) => void;
  isScanning: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onSelectFolder,
  onDropPath,
  isScanning,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const paths = Array.from(e.dataTransfer.files)
        .map((f: any) => f.path)
        .filter(Boolean);
      if (paths.length === 1) {
        onDropPath(paths[0]);
      } else if (paths.length > 1) {
        onDropPath(paths);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[460px] p-6 max-w-xl mx-auto w-full">
      {/* Drop Target Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full rounded-2xl border border-dashed p-12 flex flex-col items-center justify-center text-center transition-all duration-200 ${
          isDragOver
            ? 'border-studio-accent bg-studio-accent/10 shadow-glow-accent scale-[1.01]'
            : 'border-studio-border/70 bg-studio-card/40 hover:border-studio-borderLight hover:bg-studio-card/60'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-studio-bg border border-studio-border flex items-center justify-center mb-4 text-studio-accent shadow-sm">
          <FolderOpen className="w-7 h-7" />
        </div>

        <h3 className="text-lg font-semibold text-studio-text mb-1">
          Drop EXR Folder or Frames
        </h3>
        <p className="text-xs text-studio-textSecondary mb-6 max-w-xs">
          Drag and drop an image sequence folder or individual .exr files
        </p>

        <button
          onClick={onSelectFolder}
          disabled={isScanning}
          className="studio-button-primary px-6 py-2.5 text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 shadow-glow-accent cursor-pointer"
        >
          <FolderOpen className="w-4 h-4" />
          <span>{isScanning ? 'Scanning Files...' : 'Select Folder or Files'}</span>
        </button>
      </div>

      <p className="mt-4 text-[11px] text-studio-textMuted font-mono">
        Auto-groups shot sequences • Fast local conversion
      </p>
    </div>
  );
};
