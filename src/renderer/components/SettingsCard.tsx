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
  // Calculate target dimensions
  const calculateTarget = (scalePct: number) => {
    const factor = scalePct / 100;
    const w = Math.floor(Math.round(sequence.width * factor) / 2) * 2;
    const h = Math.floor(Math.round(sequence.height * factor) / 2) * 2;
    return { w, h };
  };

  const { w: currentTargetW, h: currentTargetH } = calculateTarget(settings.scalePercent);

  const handleScaleSelect = (pct: number) => {
    const { w, h } = calculateTarget(pct);
    onUpdateSettings({
      scalePercent: pct,
      targetWidth: w,
      targetHeight: h,
    });
  };

  const isMov = settings.outputFormat === 'mov';
  const isJpg = settings.outputFormat === 'jpg';

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
          {isMov ? 'QuickTime H.264 (1 Video)' : 'JPEG Frames (Quality 8)'}
        </div>
      </div>

      {/* 2 Primary Export Formats Only (MOV & JPEG) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Format 1: QuickTime MOV (1 Merged Video) */}
        <button
          type="button"
          onClick={() =>
            onUpdateSettings({
              outputFormat: 'mov',
              bitrateMbps: 40,
              bitrateMode: 'cbr',
              conversionMode: 'sequence', // Always 1 merged video
            })
          }
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
            H.264 • 40 Mbps CBR • 1 Merged Video
          </p>
        </button>

        {/* Format 2: JPEG Image Sequence */}
        <button
          type="button"
          onClick={() =>
            onUpdateSettings({
              outputFormat: 'jpg',
              scalePercent: 100,
              jpegQuality: settings.jpegQuality || 8,
              jpegFormatOption: settings.jpegFormatOption || 'baseline',
              conversionMode: 'individual',
            })
          }
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
            Quality 8 Maximum • Baseline / Progressive
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
        {/* 1. Resolution Scale */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-studio-textSecondary">Resolution</label>
            <span className="text-xs font-mono font-semibold text-studio-accent">
              {currentTargetW} × {currentTargetH}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: '50%*', val: 50 },
              { label: '100%', val: 100 },
              { label: '75%', val: 75 },
              { label: '25%', val: 25 },
            ].map((item) => {
              const active = settings.scalePercent === item.val;
              return (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => handleScaleSelect(item.val)}
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
