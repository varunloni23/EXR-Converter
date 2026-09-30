import React from 'react';
import { AlertTriangle, X, CheckCircle, AlertCircle } from 'lucide-react';

interface MissingFramesModalProps {
  sequenceName: string;
  missingFrames: number[];
  firstFrame: number;
  lastFrame: number;
  isOpen: boolean;
  onClose: () => void;
  onProceedAnyway: () => void;
}

export const MissingFramesModal: React.FC<MissingFramesModalProps> = ({
  sequenceName,
  missingFrames,
  firstFrame,
  lastFrame,
  isOpen,
  onClose,
  onProceedAnyway,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-fadeIn">
      <div className="studio-card max-w-lg w-full p-6 border-studio-warning/40 shadow-2xl relative">
        {/* Close icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-studio-textMuted hover:text-studio-text p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-studio-warningMuted border border-studio-warning/30 flex items-center justify-center text-studio-warning flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-studio-text">Missing Frames Detected</h3>
            <p className="text-xs text-studio-textSecondary font-mono">{sequenceName}</p>
          </div>
        </div>

        <p className="text-xs text-studio-textSecondary mb-4">
          Sequence range is <code className="font-mono text-studio-text">{firstFrame} → {lastFrame}</code>, but{' '}
          <strong className="text-studio-warning">{missingFrames.length} frames</strong> are missing from the folder:
        </p>

        {/* Missing Frames List */}
        <div className="max-h-48 overflow-y-auto p-3 rounded-md bg-studio-bg border border-studio-border mb-5">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {missingFrames.slice(0, 120).map((frame) => (
              <span
                key={frame}
                className="px-2 py-1 rounded bg-studio-warning/10 text-studio-warning border border-studio-warning/20 text-xs font-mono text-center font-medium"
              >
                {frame}
              </span>
            ))}
            {missingFrames.length > 120 && (
              <span className="col-span-full text-center text-xs font-mono text-studio-textMuted py-1">
                + {missingFrames.length - 120} more frames...
              </span>
            )}
          </div>
        </div>

        <div className="p-3 rounded-md bg-studio-warning/10 border border-studio-warning/20 text-xs text-studio-warning mb-6 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Converting an incomplete sequence may cause sudden visual jumps or timing discrepancies in editorial review.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="studio-button-secondary px-4 py-2 text-xs font-medium"
          >
            Cancel & Fix Frames
          </button>

          <button
            onClick={() => {
              onClose();
              onProceedAnyway();
            }}
            className="px-4 py-2 text-xs font-medium rounded-md bg-studio-warning hover:bg-amber-400 text-black transition-colors font-semibold"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
};
