import React from 'react';
import { Folder, HardDrive, AlertCircle, FileCheck, FileCode } from 'lucide-react';
import { DiskSpaceInfo } from '../../shared/types';

interface OutputFolderPickerProps {
  outputFolder: string;
  outputFileName: string;
  onSelectOutputFolder: () => void;
  diskSpaceInfo: DiskSpaceInfo | null;
  hasCollision: boolean;
}

export const OutputFolderPicker: React.FC<OutputFolderPickerProps> = ({
  outputFolder,
  outputFileName,
  onSelectOutputFolder,
  diskSpaceInfo,
  hasCollision,
}) => {
  return (
    <div className="studio-card p-4 select-none space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-studio-border/60">
        <div className="flex items-center space-x-2">
          <Folder className="w-4 h-4 text-studio-accent" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-studio-textSecondary">
            Output Destination
          </span>
        </div>

        {diskSpaceInfo && !diskSpaceInfo.isSufficient && (
          <div className="flex items-center space-x-1.5 text-xs text-studio-error font-mono">
            <HardDrive className="w-3.5 h-3.5" />
            <span>Low disk space ({diskSpaceInfo.availableFormatted})</span>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0 flex items-center space-x-3 bg-studio-bg/80 border border-studio-border/80 rounded-xl px-3.5 py-2.5">
          <Folder className="w-4 h-4 text-studio-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono text-studio-text truncate select-all" title={outputFolder}>
              {outputFolder || 'No output folder chosen'}
            </div>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-[11px] font-mono text-studio-textMuted flex items-center space-x-1">
                <FileCode className="w-3 h-3 text-studio-accent" />
                <span className="text-studio-accent font-semibold">{outputFileName}</span>
              </span>

              {hasCollision && (
                <span className="flex items-center space-x-1 text-[10px] font-medium text-studio-warning bg-studio-warningMuted px-1.5 py-0.2 rounded border border-studio-warning/30">
                  <AlertCircle className="w-2.5 h-2.5" />
                  <span>Existing file</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onSelectOutputFolder}
          className="studio-button-secondary px-4 py-2 text-xs font-semibold flex items-center justify-center space-x-1.5 flex-shrink-0 cursor-pointer rounded-xl"
        >
          <Folder className="w-3.5 h-3.5 text-studio-accent" />
          <span>Change Destination</span>
        </button>
      </div>
    </div>
  );
};
