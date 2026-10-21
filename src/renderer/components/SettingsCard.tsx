import React from 'react';
import { Sliders, Zap, FolderCheck, Check, Search, Film, Image as ImageIcon } from 'lucide-react';
import { ConversionSettings, ExrSequence, HardwareInfo } from '../../shared/types';

interface SettingsCardProps {
  settings: ConversionSettings;
  sequence: ExrSequence;
  hardwareInfo: HardwareInfo | null;
  onUpdateSettings: (newSettings: Partial<ConversionSettings>) => void;
  onOpenGapScanner?: () => void;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
  settings,
  sequence,
  hardwareInfo,
  onUpdateSettings,
  onOpenGapScanner,
}) => {
  // Calculate target dimensions per format rules:
  // - JPG: Source Dimension (no resolution drop)
  // - MOV: 1920x1080 (fit to Width or Height, preserving aspect ratio, no crop)
  const calculateTarget = (format: string = settings.outputFormat) => {
    if (format === 'jpg' || (format as string) === 'jpeg') {
      return { w: sequence.width, h: sequence.height };
    }
    const scale = Math.min(1920 / sequence.width, 1080 / sequence.height);
    let w = Math.round(sequence.width * scale);
    let h = Math.round(sequence.height * scale);
    w = Math.floor(w / 2) * 2;
    h = Math.floor(h / 2) * 2;
    if (w > 1920) w = 1920;
    if (h > 1080) h = 1080;
    if (w < 2) w = 2;
    if (h < 2) h = 2;
    return { w, h };
  };

  const isMov = settings.outputFormat === 'mov';
  const isJpg = settings.outputFormat === 'jpg';
  const { w: currentTargetW, h: currentTargetH } = calculateTarget(settings.outputFormat);

  return (
    <div className="studio-card p-5 select-none space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-studio-border/60">
        <div className="flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-studio-accent" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-studio-textSecondary">
            Export Format & Settings
          </span>
        </div>

        <div className="text-[11px] font-mono text-studio-textMuted">
          {isMov ? 'QuickTime H.264 (1920×1080 Fit)' : `JPEG Frames (${sequence.width}×${sequence.height})`}
        </div>
      </div>

      {/* 2 Primary Export Formats Only (MOV & JPEG) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Format 1: QuickTime MOV (1 Merged Video) */}
        <button
          type="button"
          onClick={() => {
            const dims = calculateTarget('mov');
            onUpdateSettings({
              outputFormat: 'mov',
              targetWidth: dims.w,
              targetHeight: dims.h,
              bitrateMbps: 40,
              bitrateMode: 'cbr',
              conversionMode: 'sequence', // Always 1 merged video
            });
          }}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
            isMov
              ? 'bg-studio-accent/15 border-studio-accent shadow-glow-accent'
              : 'bg-studio-bg/60 border-studio-border/70 hover:border-studio-border hover:bg-studio-bg'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-2">
              <Film className={`w-4 h-4 ${isMov ? 'text-studio-accent' : 'text-studio-textMuted'}`} />
              <span className="text-xs font-mono font-bold text-studio-text">QuickTime MOV</span>
            </div>
            {isMov && (
              <span className="w-4 h-4 rounded-full bg-studio-accent text-white flex items-center justify-center text-[10px]">
                <Check className="w-3 h-3" />
              </span>
            )}
          </div>
          <p className="text-[11px] text-studio-textSecondary font-mono">
            1920×1080 Fit (No Crop) • 40 Mbps CBR
          </p>
        </button>

        {/* Format 2: JPEG Image Sequence */}
        <button
          type="button"
          onClick={() => {
            const dims = calculateTarget('jpg');
            onUpdateSettings({
              outputFormat: 'jpg',
              targetWidth: dims.w,
              targetHeight: dims.h,
              scalePercent: 100,
              jpegQuality: settings.jpegQuality || 8,
              jpegFormatOption: settings.jpegFormatOption || 'baseline',
              conversionMode: 'individual',
            });
          }}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
            isJpg
              ? 'bg-studio-accent/15 border-studio-accent shadow-glow-accent'
              : 'bg-studio-bg/60 border-studio-border/70 hover:border-studio-border hover:bg-studio-bg'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-2">
              <ImageIcon className={`w-4 h-4 ${isJpg ? 'text-studio-accent' : 'text-studio-textMuted'}`} />
              <span className="text-xs font-mono font-bold text-studio-text">JPEG Frames</span>
            </div>
            {isJpg && (
              <span className="w-4 h-4 rounded-full bg-studio-accent text-white flex items-center justify-center text-[10px]">
                <Check className="w-3 h-3" />
              </span>
            )}
          </div>
          <p className="text-[11px] text-studio-textSecondary font-mono">
            Source Dimension ({sequence.width}×{sequence.height}) • No Drop
          </p>
        </button>
      </div>

      {/* Dedicated Subfolder Toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-studio-bg/60 border border-studio-border/60">
        <div className="flex items-center space-x-2.5">
          <FolderCheck className="w-4 h-4 text-studio-accent flex-shrink-0" />
          <div>
            <div className="text-xs font-semibold text-studio-text font-mono">
              Create Dedicated Subfolder ({isJpg ? '/JPEG' : '/MOV'})
            </div>
            <div className="text-[11px] text-studio-textMuted">
              Keeps exports in a clean separate folder for easy folder comparison
            </div>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.createSubfolder !== false}
            onChange={(e) => onUpdateSettings({ createSubfolder: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-studio-card peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-studio-accent border border-studio-border"></div>
        </label>
      </div>

      {/* Minimal Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {/* 1. Resolution Rule Display */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-studio-textSecondary">Resolution</label>
            <span className="text-xs font-mono font-semibold text-studio-accent">
              {currentTargetW} × {currentTargetH}
            </span>
          </div>

          {isMov ? (
            <div className="p-2 rounded-lg bg-studio-bg border border-studio-border/70 flex items-center justify-between">
              <span className="text-[11px] font-mono text-studio-text">
                1920×1080 (Fit Aspect)
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                No Crop
              </span>
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-studio-bg border border-studio-border/70 flex items-center justify-between">
              <span className="text-[11px] font-mono text-studio-text">
                Source Dimension (1:1)
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-studio-accent/15 text-studio-accent border border-studio-accent/30">
                No Drop
              </span>
            </div>
          )}
        </div>

        {/* 2. Frame Rate */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-studio-textSecondary">Frame Rate</label>
            <span className="text-xs font-mono font-semibold text-studio-text">{settings.fps} FPS</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[24, 23.976, 25, 30].map((fpsVal) => {
              const active = settings.fps === fpsVal;
              return (
                <button
                  key={fpsVal}
                  type="button"
                  onClick={() => onUpdateSettings({ fps: fpsVal })}
                  className={`py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'bg-studio-accent/20 border-studio-accent text-studio-accent'
                      : 'bg-studio-bg border-studio-border/60 text-studio-textSecondary hover:text-studio-text'
                  }`}
                >
                  {fpsVal === 24 ? '24*' : fpsVal}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Format Specifics */}
        <div className="space-y-1.5">
          {isMov ? (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-studio-textSecondary">Target Bitrate</label>
                <span className="text-xs font-mono font-bold text-studio-accent">
                  {settings.bitrateMbps || 40} Mbps CBR
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: '20 Mbps', val: 20 },
                  { label: '40 Mbps*', val: 40 },
                  { label: '60 Mbps', val: 60 },
                ].map((item) => {
                  const active = (settings.bitrateMbps || 40) === item.val;
                  return (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => onUpdateSettings({ bitrateMbps: item.val, bitrateMode: 'cbr' })}
                      className={`py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'bg-studio-accent/20 border-studio-accent text-studio-accent'
                          : 'bg-studio-bg border-studio-border/60 text-studio-textSecondary hover:text-studio-text'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-studio-textSecondary">JPEG Quality</label>
                <span className="text-xs font-mono font-bold text-studio-accent">
                  Quality {settings.jpegQuality || 8} (Maximum)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: '6 (High)', val: 6 },
                  { label: '8 (Max)*', val: 8 },
                  { label: '10 (Fine)', val: 10 },
                ].map((item) => {
                  const active = (settings.jpegQuality || 8) === item.val;
                  return (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => onUpdateSettings({ jpegQuality: item.val })}
                      className={`py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'bg-studio-accent/20 border-studio-accent text-studio-accent'
                          : 'bg-studio-bg border-studio-border/60 text-studio-textSecondary hover:text-studio-text'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Frame Integrity & Gap Scanner row */}
      <div className="p-3 rounded-xl bg-studio-bg/60 border border-studio-border/60 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="text-studio-textMuted">Start Frame:</span>
          <span className="text-studio-text font-semibold">
            {sequence.expectedStartFrame ?? sequence.firstFrame ?? 1001}
          </span>
          <span className="text-studio-textMuted">•</span>
          <span className="text-studio-textSecondary">{sequence.frameCount} frames</span>
          {sequence.hasMissingFrames && (
            <span className="text-studio-warning font-semibold ml-2">
              ⚠️ {sequence.missingFrames?.length || 0} missing
            </span>
          )}
        </div>

        {onOpenGapScanner && (
          <button
            type="button"
            onClick={onOpenGapScanner}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-studio-border bg-studio-card hover:border-studio-accent text-studio-text flex items-center space-x-1 transition-colors cursor-pointer"
          >
            <Search className="w-3 h-3 text-studio-accent" />
            <span>Scan Gaps</span>
          </button>
        )}
      </div>
    </div>
  );
};
