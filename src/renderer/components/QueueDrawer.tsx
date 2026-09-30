import React from 'react';
import { Layers, X, CheckCircle2, Clock, AlertOctagon, XCircle, Play, RefreshCw, Trash2 } from 'lucide-react';
import { ConversionJob } from '../../shared/types';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: ConversionJob[];
  onCancelJob: (jobId: string) => void;
  onSelectJob: (job: ConversionJob) => void;
  onClearHistory?: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  isOpen,
  onClose,
  jobs,
  onCancelJob,
  onSelectJob,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-studio-card border-l border-studio-border shadow-2xl z-40 flex flex-col select-none animate-slideLeft">
      {/* Header */}
      <div className="h-16 px-5 border-b border-studio-border flex items-center justify-between flex-shrink-0 bg-studio-bg">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-studio-accent" />
          <h3 className="text-sm font-semibold text-studio-text">Conversion Queue & History</h3>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-studio-accent/20 text-studio-accent font-mono">
            {jobs.length}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {jobs.length > 0 && onClearHistory && (
            <button
              onClick={onClearHistory}
              title="Clear conversion history"
              className="text-xs text-studio-textMuted hover:text-studio-error p-1.5 transition-colors flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-studio-textMuted hover:text-studio-text p-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {jobs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-studio-textMuted">
            <Layers className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs font-medium text-studio-textSecondary mb-1">Queue is empty</p>
            <p className="text-[11px] max-w-xs">
              Jobs will automatically appear here when you convert sequences or batch process multi-shot folders.
            </p>
          </div>
        ) : (
          jobs.map((job) => {
            let statusBadge = (
              <span className="flex items-center space-x-1 text-[10px] font-mono text-studio-textMuted">
                <Clock className="w-3 h-3" />
                <span>Waiting</span>
              </span>
            );

            if (job.status === 'converting') {
              statusBadge = (
                <span className="flex items-center space-x-1 text-[10px] font-mono text-studio-accent font-medium">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>{job.progress}%</span>
                </span>
              );
            } else if (job.status === 'completed') {
              statusBadge = (
                <span className="flex items-center space-x-1 text-[10px] font-mono text-studio-success font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Complete</span>
                </span>
              );
            } else if (job.status === 'failed') {
              statusBadge = (
                <span className="flex items-center space-x-1 text-[10px] font-mono text-studio-error font-medium">
                  <AlertOctagon className="w-3 h-3" />
                  <span>Failed</span>
                </span>
              );
            } else if (job.status === 'cancelled') {
              statusBadge = (
                <span className="flex items-center space-x-1 text-[10px] font-mono text-studio-textMuted">
                  <XCircle className="w-3 h-3" />
                  <span>Cancelled</span>
                </span>
              );
            }

            return (
              <div
                key={job.id}
                onClick={() => onSelectJob(job)}
                className="p-3 rounded-lg bg-studio-bg border border-studio-border hover:border-studio-borderLight cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold text-studio-text truncate max-w-[180px]">
                    {job.sequenceName}
                  </span>
                  {statusBadge}
                </div>

                {job.status === 'converting' && (
                  <div className="w-full h-1.5 bg-studio-card rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-studio-accent transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-studio-textMuted font-mono">
                  <span>
                    {job.targetWidth}×{job.targetHeight} • {job.frameCount} f
                  </span>
                  <span>{job.outputFormat.toUpperCase()}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
