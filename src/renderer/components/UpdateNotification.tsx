import React, { useState, useEffect } from 'react';
import { DownloadCloud, CheckCircle2, Sparkles, X, ArrowUpCircle } from 'lucide-react';
import { UpdateStatus } from '../../shared/types';

interface UpdateNotificationProps {
  onManualCheck?: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;

    const unsub = window.electronAPI.onUpdateStatus((newStatus) => {
      setStatus(newStatus);
      if (newStatus.state === 'available' || newStatus.state === 'downloaded' || newStatus.state === 'downloading') {
        setIsDismissed(false);
      } else if (newStatus.state === 'not-available') {
        // Auto-dismiss "up to date" notification after 4 seconds
        setTimeout(() => {
          setIsDismissed(true);
        }, 4000);
      }
    });

    return () => unsub();
  }, []);

  if (
    !status ||
    isDismissed ||
    status.state === 'idle' ||
    status.state === 'checking' ||
    status.state === 'error'
  ) {
    return null;
  }

  const handleRestart = async () => {
    setIsInstalling(true);
    try {
      await window.electronAPI.quitAndInstallUpdate();
    } catch (err) {
      console.error('Failed to restart for update:', err);
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="bg-studio-card/95 border border-studio-accent/40 rounded-xl p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            {status.state === 'available' && (
              <DownloadCloud className="w-5 h-5 text-studio-accent animate-bounce" />
            )}
            {status.state === 'downloading' && (
              <DownloadCloud className="w-5 h-5 text-studio-accent animate-pulse" />
            )}
            {status.state === 'downloaded' && (
              <Sparkles className="w-5 h-5 text-emerald-400" />
            )}
            {status.state === 'not-available' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            )}

            <div>
              <h4 className="text-xs font-semibold text-white tracking-wide">
                {status.state === 'available' && `New Update v${status.version || ''} Available`}
                {status.state === 'downloading' && `Downloading Update v${status.version || ''}...`}
                {status.state === 'downloaded' && `Update v${status.version || ''} Ready!`}
                {status.state === 'not-available' && 'EXR Converter is Up to Date'}
              </h4>
              <p className="text-[11px] text-studio-textMuted mt-0.5">
                {status.state === 'available' && 'Starting background download...'}
                {status.state === 'downloading' && `${status.progressPercent || 0}% downloaded`}
                {status.state === 'downloaded' && 'Restart the app now to apply the update seamlessly.'}
                {status.state === 'not-available' && 'You are running the newest version.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDismissed(true)}
            className="text-studio-textMuted hover:text-white p-1 rounded-md transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress bar when downloading */}
        {status.state === 'downloading' && (
          <div className="mt-3 w-full bg-studio-border/60 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-studio-accent to-emerald-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${status.progressPercent || 0}%` }}
            />
          </div>
        )}

        {/* Action Button for downloaded state */}
        {status.state === 'downloaded' && (
          <div className="mt-3 flex items-center justify-end space-x-2">
            <button
              onClick={() => setIsDismissed(true)}
              className="px-2.5 py-1 text-xs text-studio-textMuted hover:text-white transition-colors"
            >
              Later
            </button>
            <button
              onClick={handleRestart}
              disabled={isInstalling}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-studio-accent hover:bg-studio-accent/90 text-white shadow-glow-accent transition-all cursor-pointer disabled:opacity-50"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>{isInstalling ? 'Restarting...' : 'Restart & Update'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
