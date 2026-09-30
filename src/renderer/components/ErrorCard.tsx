import React from 'react';
import { AlertOctagon, Terminal, RefreshCw, XCircle } from 'lucide-react';

interface ErrorCardProps {
  errorMessage?: string;
  onRetry: () => void;
  onOpenLogs: () => void;
  onDismiss: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({
  errorMessage,
  onRetry,
  onOpenLogs,
  onDismiss,
}) => {
  return (
    <div className="studio-card p-6 select-none max-w-2xl mx-auto w-full border-studio-error/40 shadow-glow-error">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-studio-errorMuted border border-studio-error/30 flex items-center justify-center text-studio-error flex-shrink-0">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-studio-text">Conversion Failed</h2>
            <p className="text-xs text-studio-textSecondary">
              The EXR sequence could not be processed.
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="text-studio-textMuted hover:text-studio-text p-1 transition-colors"
          title="Dismiss"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 rounded-lg bg-studio-bg border border-studio-border mb-5">
        <p className="text-xs font-semibold text-studio-textSecondary mb-2 font-mono uppercase tracking-wider">
          Possible reasons:
        </p>
        <ul className="text-xs text-studio-textSecondary space-y-1.5 list-disc list-inside">
          <li>A frame in the sequence is corrupted or incomplete</li>
          <li>One or more required frames are missing from the folder</li>
          <li>The output folder is locked or not writable</li>
          <li>FFmpeg encountered an unexpected encoding error</li>
        </ul>

        {errorMessage && (
          <div className="mt-3 pt-3 border-t border-studio-border">
            <span className="text-[10px] font-mono text-studio-error uppercase tracking-wider block mb-1">
              Error Details:
            </span>
            <p className="text-xs font-mono text-studio-error bg-studio-error/10 p-2 rounded border border-studio-error/20 break-words">
              {errorMessage}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <button
          onClick={onRetry}
          className="studio-button-primary px-5 py-2 text-xs font-medium flex items-center space-x-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Conversion</span>
        </button>

        <button
          onClick={onOpenLogs}
          className="studio-button-secondary px-4 py-2 text-xs font-medium flex items-center space-x-2"
        >
          <Terminal className="w-3.5 h-3.5 text-studio-accent" />
          <span>View Technical Log</span>
        </button>
      </div>
    </div>
  );
};
