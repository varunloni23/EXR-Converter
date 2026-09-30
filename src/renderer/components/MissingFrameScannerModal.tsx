import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  X,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Search,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Check,
} from 'lucide-react';
import { ExrSequence, FrameComparisonReport } from '../../shared/types';

interface MissingFrameScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sequence: ExrSequence | null;
  onProceedAnyway?: () => void;
}

export const MissingFrameScannerModal: React.FC<MissingFrameScannerModalProps> = ({
  isOpen,
  onClose,
  sequence,
  onProceedAnyway,
}) => {
  if (!isOpen || !sequence) return null;

  const defaultStart = sequence.expectedStartFrame ?? sequence.firstFrame;
  const defaultEnd = sequence.expectedEndFrame ?? sequence.lastFrame;

  const [startFrame, setStartFrame] = useState<number>(defaultStart);
  const [endFrame, setEndFrame] = useState<number>(defaultEnd);
  const [report, setReport] = useState<FrameComparisonReport | null>(null);
  const [copiedNumbers, setCopiedNumbers] = useState(false);
  const [copiedFileNames, setCopiedFileNames] = useState(false);
  const [savedReportPath, setSavedReportPath] = useState<string | null>(null);

  // Perform comparison whenever sequence, startFrame, or endFrame changes
  useEffect(() => {
    if (window.electronAPI && sequence) {
      window.electronAPI
        .compareFrames(sequence, startFrame, endFrame)
        .then((res) => {
          setReport(res);
        })
        .catch(console.error);
    }
  }, [sequence, startFrame, endFrame]);

  const handleSetStart1001 = () => {
    setStartFrame(1001);
  };

  const handleSetStart1 = () => {
    setStartFrame(1);
  };

  const handleResetAuto = () => {
    setStartFrame(sequence.expectedStartFrame ?? sequence.firstFrame);
    setEndFrame(sequence.expectedEndFrame ?? sequence.lastFrame);
  };

  const handleCopyNumbers = () => {
    if (!report || report.allMissingFrames.length === 0) return;
    navigator.clipboard.writeText(report.allMissingFrames.join(', '));
    setCopiedNumbers(true);
    setTimeout(() => setCopiedNumbers(false), 2000);
  };

  const handleCopyFileNames = () => {
    if (!report || report.missingFileNames.length === 0) return;
    navigator.clipboard.writeText(report.missingFileNames.join('\n'));
    setCopiedFileNames(true);
    setTimeout(() => setCopiedFileNames(false), 2000);
  };

  const handleSaveReport = async () => {
    if (!window.electronAPI || !report || !sequence.folderPath) return;
    const savedPath = await window.electronAPI.saveMissingReport(sequence.folderPath, report);
    if (savedPath) {
      setSavedReportPath(savedPath);
      setTimeout(() => setSavedReportPath(null), 3500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-fadeIn">
      <div className="studio-card max-w-2xl w-full p-6 border-studio-borderLight shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-studio-textMuted hover:text-studio-text p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-5 pb-4 border-b border-studio-border">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              report && report.isComplete
                ? 'bg-studio-success/20 text-studio-success border border-studio-success/30'
                : 'bg-studio-warning/20 text-studio-warning border border-studio-warning/30'
            }`}
          >
            {report && report.isComplete ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-studio-text flex items-center space-x-2 truncate">
              <span>Sequence Frame Audit & Gap Scanner</span>
            </h3>
            <p className="text-xs text-studio-textSecondary truncate font-mono">
              {sequence.sequenceName} • {sequence.folderPath}
            </p>
          </div>
        </div>

        {/* Frame Range Comparator Controls */}
        <div className="p-4 rounded-lg bg-studio-bg border border-studio-border mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-studio-textSecondary flex items-center space-x-1.5">
              <Search className="w-3.5 h-3.5 text-studio-accent" />
              <span>EXPECTED FRAME RANGE</span>
            </span>
            <div className="flex items-center space-x-1.5 text-[11px]">
              <span className="text-studio-textMuted mr-1">Quick Presets:</span>
              <button
                onClick={handleSetStart1001}
                className="px-2 py-0.5 rounded bg-studio-card border border-studio-border text-studio-text hover:border-studio-accent font-mono transition-colors"
                title="Standard VFX shot convention starting at 1001"
              >
                1001 (VFX)
              </button>
              <button
                onClick={handleSetStart1}
                className="px-2 py-0.5 rounded bg-studio-card border border-studio-border text-studio-text hover:border-studio-accent font-mono transition-colors"
                title="Standard animation convention starting at 1"
              >
                1
              </button>
              <button
                onClick={handleResetAuto}
                className="px-2 py-0.5 rounded bg-studio-card border border-studio-border text-studio-textMuted hover:text-studio-text font-mono transition-colors"
              >
                Auto
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
            <div>
              <label className="text-[11px] text-studio-textMuted block mb-1">Start Frame</label>
              <input
                type="number"
                value={startFrame}
                onChange={(e) => setStartFrame(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-studio-card border border-studio-border rounded px-2.5 py-1.5 text-xs text-studio-text font-mono focus:outline-none focus:border-studio-accent font-semibold"
              />
            </div>
            <div>
              <label className="text-[11px] text-studio-textMuted block mb-1">End Frame</label>
              <input
                type="number"
                value={endFrame}
                onChange={(e) => setEndFrame(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-studio-card border border-studio-border rounded px-2.5 py-1.5 text-xs text-studio-text font-mono focus:outline-none focus:border-studio-accent font-semibold"
              />
            </div>
            <div className="p-2 rounded bg-studio-card border border-studio-border text-center">
              <span className="text-[10px] uppercase font-mono text-studio-textMuted block">Expected</span>
              <span className="text-sm font-mono font-bold text-studio-text">
                {report ? report.expectedCount : 0}
              </span>
            </div>
            <div
              className={`p-2 rounded border text-center ${
                report && report.missingCount > 0
                  ? 'bg-studio-warning/10 border-studio-warning/30 text-studio-warning'
                  : 'bg-studio-success/10 border-studio-success/30 text-studio-success'
              }`}
            >
              <span className="text-[10px] uppercase font-mono block opacity-80">
                {report && report.missingCount > 0 ? 'Missing Files' : 'Status'}
              </span>
              <span className="text-sm font-mono font-bold">
                {report && report.missingCount > 0
                  ? `${report.missingCount} Missing`
                  : '100% Complete'}
              </span>
            </div>
          </div>
        </div>

        {/* Results / Missing Frames List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[160px]">
          {report && report.isComplete ? (
            <div className="p-5 rounded-lg bg-studio-success/10 border border-studio-success/30 flex items-center space-x-3 text-studio-success">
              <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-sm">Sequence is 100% Contiguous!</p>
                <p className="opacity-90 mt-0.5">
                  All {report.foundCount} frames from {report.expectedStartFrame} to{' '}
                  {report.expectedEndFrame} are present on disk with zero gaps.
                </p>
              </div>
            </div>
          ) : (
            report && (
              <div className="space-y-3">
                {/* Category breakdown badges */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {report.missingHeadFrames.length > 0 && (
                    <span className="px-2.5 py-1 rounded bg-studio-warning/15 border border-studio-warning/30 text-studio-warning font-mono">
                      Head Frames Missing: {report.missingHeadFrames.length} (
                      {report.missingHeadFrames[0]}–
                      {report.missingHeadFrames[report.missingHeadFrames.length - 1]})
                    </span>
                  )}
                  {report.missingMiddleFrames.length > 0 && (
                    <span className="px-2.5 py-1 rounded bg-studio-error/15 border border-studio-error/30 text-studio-error font-mono">
                      Middle Gaps: {report.missingMiddleFrames.length} frames
                    </span>
                  )}
                  {report.missingTailFrames.length > 0 && (
                    <span className="px-2.5 py-1 rounded bg-studio-warning/15 border border-studio-warning/30 text-studio-warning font-mono">
                      Tail Frames Missing: {report.missingTailFrames.length}
                    </span>
                  )}
                </div>

                {/* Missing Frames Grid */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-studio-textSecondary font-medium">Missing Frame Numbers:</span>
                    <span className="text-studio-textMuted font-mono text-[11px]">
                      {report.missingCount} total
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto p-3 rounded-lg bg-studio-bg border border-studio-border">
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                      {report.allMissingFrames.slice(0, 150).map((f) => (
                        <span
                          key={f}
                          className="px-2 py-1 rounded bg-studio-warning/10 text-studio-warning border border-studio-warning/20 text-xs font-mono text-center font-medium"
                        >
                          {f}
                        </span>
                      ))}
                      {report.allMissingFrames.length > 150 && (
                        <span className="col-span-full text-center text-xs font-mono text-studio-textMuted py-1">
                          + {report.allMissingFrames.length - 150} more frames...
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Missing Filenames Sample */}
                <div>
                  <span className="text-xs text-studio-textSecondary font-medium block mb-1.5">
                    Missing File Names (for Render Queue):
                  </span>
                  <div className="max-h-28 overflow-y-auto p-2.5 rounded-lg bg-studio-bg border border-studio-border font-mono text-[11px] text-studio-textMuted space-y-1">
                    {report.missingFileNames.slice(0, 20).map((fn) => (
                      <div key={fn} className="text-studio-warning truncate">
                        • {fn}
                      </div>
                    ))}
                    {report.missingFileNames.length > 20 && (
                      <div className="text-studio-textMuted text-[10px] pl-3">
                        ... and {report.missingFileNames.length - 20} more files
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-4 border-t border-studio-border flex flex-wrap items-center justify-between gap-2">
          {report && report.missingCount > 0 ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopyNumbers}
                className="px-3 py-1.5 text-xs font-medium rounded border border-studio-border bg-studio-bg hover:border-studio-accent text-studio-text flex items-center space-x-1.5 transition-colors"
                title="Copy comma-separated list of missing numbers"
              >
                {copiedNumbers ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-studio-success" />
                    <span className="text-studio-success">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-studio-accent" />
                    <span>Copy Numbers</span>
                  </>
                )}
              </button>

              <button
                onClick={handleCopyFileNames}
                className="px-3 py-1.5 text-xs font-medium rounded border border-studio-border bg-studio-bg hover:border-studio-accent text-studio-text flex items-center space-x-1.5 transition-colors"
                title="Copy missing filenames"
              >
                {copiedFileNames ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-studio-success" />
                    <span className="text-studio-success">Copied!</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-studio-accent" />
                    <span>Copy File Names</span>
                  </>
                )}
              </button>

              <button
                onClick={handleSaveReport}
                className="px-3 py-1.5 text-xs font-medium rounded border border-studio-border bg-studio-bg hover:border-studio-accent text-studio-text flex items-center space-x-1.5 transition-colors"
                title="Write _MISSING_FRAMES_REPORT.txt directly to sequence folder"
              >
                <Download className="w-3.5 h-3.5 text-studio-accent" />
                <span>Save Report (.txt)</span>
              </button>

              {savedReportPath && (
                <span className="text-xs text-studio-success flex items-center space-x-1 animate-fadeIn">
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </span>
              )}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="studio-button-secondary px-4 py-1.5 text-xs font-medium"
            >
              Close
            </button>
            {onProceedAnyway && report && report.missingCount > 0 && (
              <button
                onClick={() => {
                  onClose();
                  onProceedAnyway();
                }}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-studio-warning hover:bg-amber-400 text-black transition-colors"
              >
                Continue Conversion Anyway
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
