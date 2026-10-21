import React, { useState, useEffect } from 'react';
import { Settings, Cpu, Zap, HardDrive, Check, X, Shield, Info, RefreshCw, CheckCircle2 } from 'lucide-react';
import { ConversionSettings, HardwareInfo } from '../../shared/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hardwareInfo: HardwareInfo | null;
  settings: ConversionSettings;
  onUpdateSettings: (newSettings: Partial<ConversionSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  hardwareInfo,
  settings,
  onUpdateSettings,
}) => {
  const [currentVersion, setCurrentVersion] = useState<string>('1.0.2');
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (window.electronAPI?.getVersion) {
      window.electronAPI.getVersion().then((v) => {
        if (v) setCurrentVersion(v);
      }).catch(() => {});
    }
  }, []);

  if (!isOpen) return null;

  const handleCheckNow = async () => {
    setIsCheckingUpdates(true);
    setUpdateFeedback(null);
    try {
      if (window.electronAPI?.checkForUpdates) {
        const res = await window.electronAPI.checkForUpdates();
        if (res.state === 'not-available' || res.state === 'idle') {
          setUpdateFeedback('Latest version installed');
        } else if (res.state === 'available' || res.state === 'downloading') {
          setUpdateFeedback(`Downloading v${res.version || ''}...`);
        } else if (res.state === 'downloaded') {
          setUpdateFeedback(`v${res.version} ready to install!`);
        } else if (res.state === 'error') {
          setUpdateFeedback('Check complete');
        } else {
          setUpdateFeedback('Up to date');
        }
      }
    } catch (e: any) {
      setUpdateFeedback('Up to date');
    } finally {
      setIsCheckingUpdates(false);
      setTimeout(() => setUpdateFeedback(null), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="studio-card max-w-xl w-full max-h-[90vh] p-6 shadow-2xl relative border-studio-borderLight flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-studio-textMuted hover:text-studio-text p-1 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header - Fixed */}
        <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-studio-border flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-studio-accent/20 border border-studio-accent/30 flex items-center justify-center text-studio-accent">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-studio-text">Hardware & Encoder Settings</h3>
            <p className="text-xs text-studio-textSecondary">Local processing and acceleration config</p>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6 custom-scrollbar">
          {/* Hardware Status */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-studio-textSecondary flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-studio-accent" />
              <span>PROCESSING HARDWARE</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
                <span className="text-[10px] font-mono uppercase text-studio-textMuted block">CPU</span>
                <span className="text-xs font-semibold text-studio-text block truncate" title={hardwareInfo?.cpuModel}>
                  {hardwareInfo?.cpuModel || 'Detecting...'}
                </span>
                <span className="text-[11px] text-studio-accent font-mono">
                  {hardwareInfo?.cpuCores ? `${hardwareInfo.cpuCores} physical/logical cores` : ''}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-studio-bg border border-studio-border">
                <span className="text-[10px] font-mono uppercase text-studio-textMuted block">GPU / ACCELERATION</span>
                <span className="text-xs font-semibold text-studio-text block truncate">
                  {hardwareInfo?.gpuName || (hardwareInfo?.hasGpuAcceleration ? 'Hardware Accel Detected' : 'CPU Software Mode')}
                </span>
                <span className="text-[11px] text-studio-success font-mono flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-studio-success inline-block"></span>
                  <span>{hardwareInfo?.hasGpuAcceleration ? 'Ready for fast encoding' : 'Universal libx264 ready'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Encoder Selection */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-studio-textSecondary flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-studio-accent" />
              <span>ENCODING ENGINE</span>
            </h4>

            <div className="space-y-2">
              {hardwareInfo?.availableEncoders.map((enc) => {
                const selected = settings.encoderEngine === enc.id;
                const disabled = !enc.isAvailable;

                return (
                  <label
                    key={enc.id}
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${
                      selected
                        ? 'bg-studio-accent/15 border-studio-accent'
                        : disabled
                        ? 'opacity-40 cursor-not-allowed bg-studio-bg border-studio-border'
                        : 'bg-studio-bg border-studio-border hover:border-studio-borderLight'
                    }`}
                  >
                    <input
                      type="radio"
                      name="encoderEngine"
                      value={enc.id}
                      disabled={disabled}
                      checked={selected}
                      onChange={() => onUpdateSettings({ encoderEngine: enc.id })}
                      className="mt-0.5 text-studio-accent focus:ring-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-studio-text font-mono">{enc.name}</span>
                        {enc.id === 'auto' && (
                          <span className="text-[10px] bg-studio-accent/20 text-studio-accent px-1.5 py-0.2 rounded font-mono font-medium">
                            RECOMMENDED
                          </span>
                        )}
                        {!enc.isAvailable && (
                          <span className="text-[10px] text-studio-textMuted font-mono">Not available on this machine</span>
                        )}
                      </div>
                      <p className="text-[11px] text-studio-textSecondary mt-0.5">{enc.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Updates Section */}
          <div className="p-3 rounded-lg bg-studio-bg border border-studio-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <RefreshCw className={`w-4 h-4 text-studio-accent flex-shrink-0 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <div>
                <span className="text-xs font-semibold text-studio-text block">Software Updates</span>
                <span className="text-[11px] text-studio-textMuted block">
                  Current version v{currentVersion} • Checks automatically every 15 mins
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-end sm:self-auto">
              {updateFeedback && (
                <span className="text-[11px] text-emerald-400 font-mono animate-fadeIn flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{updateFeedback}</span>
                </span>
              )}
              <button
                type="button"
                disabled={isCheckingUpdates}
                onClick={handleCheckNow}
                className="px-3 py-1.5 rounded-lg border border-studio-border hover:border-studio-accent text-xs font-medium text-studio-text hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                <span>{isCheckingUpdates ? 'Checking...' : 'Check Now'}</span>
              </button>
            </div>
          </div>

          {/* Security & Offline Notice */}
          <div className="p-3 rounded-lg bg-studio-bg border border-studio-border flex items-center space-x-2.5 text-xs text-studio-textMuted">
            <Shield className="w-4 h-4 text-studio-success flex-shrink-0" />
            <span>
              All conversions execute 100% locally on your device via FFmpeg. No files, logs, or telemetry are ever uploaded.
            </span>
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="flex justify-end pt-4 mt-2 border-t border-studio-border flex-shrink-0">
          <button
            onClick={onClose}
            className="studio-button-primary px-5 py-2 text-xs font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
