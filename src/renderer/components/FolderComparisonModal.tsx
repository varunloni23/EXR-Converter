import React, { useState, useEffect } from 'react';
import {
  FolderCheck,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  RefreshCw,
  X,
  Check,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { FolderComparisonResult } from '../../shared/types';

interface FolderComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSourceDir: string;
  defaultTargetDir: string;
  defaultExpectedStart?: number;
}

export const FolderComparisonModal: React.FC<FolderComparisonModalProps> = ({
  isOpen,
  onClose,
  defaultSourceDir,
  defaultTargetDir,
  defaultExpectedStart = 1001,
}) => {
  if (!isOpen) return null;

  const [sourceDir, setSourceDir] = useState<string>(defaultSourceDir);
  const [targetDir, setTargetDir] = useState<string>(defaultTargetDir);
  const [startFrame, setStartFrame] = useState<number>(defaultExpectedStart);
  const [report, setReport] = useState<FolderComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedNumbers, setCopiedNumbers] = useState(false);
  const [copiedFileNames, setCopiedFileNames] = useState(false);
  const [savedReportPath, setSavedReportPath] = useState<string | null>(null);

  const getFolderBasename = (p: string) => {
    if (!p) return '';
    const clean = p.replace(/[/\\]+$/, '');
    const parts = clean.split(/[/\\]/);
    if (parts.length <= 2) return clean;
    return parts.slice(-2).join('/');
  };

  const runComparison = async (src: string, tgt: string, start?: number) => {
    if (!window.electronAPI || !src || !tgt) return;
    setIsLoading(true);
    try {
      const res = await window.electronAPI.compareFolders(src, tgt, start ?? startFrame);
      setReport(res);
    } catch (err) {
      console.error('Folder comparison error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setSourceDir(defaultSourceDir);
    setTargetDir(defaultTargetDir);
    if (defaultSourceDir && defaultTargetDir) {
      runComparison(defaultSourceDir, defaultTargetDir, defaultExpectedStart);
    } else if (defaultSourceDir && !defaultTargetDir && window.electronAPI?.compareFolders) {
      // Auto-check if defaultSourceDir has sibling _JPEG or _MOV, or legacy subfolder /JPEG or /MOV
      const cleanSrc = defaultSourceDir.replace(/[/\\]+$/, '');
      const parentDir = cleanSrc.replace(/[/\\][^/\\]+$/, '');
      const baseName = cleanSrc.split(/[/\\]/).filter(Boolean).pop() || '';
      const isConvertedFolder = /_(JPEG|MOV|MP4)$/i.test(baseName) || /\.(mov|mp4)$/i.test(cleanSrc);
      const cleanBase = baseName.replace(/_(JPEG|MOV|MP4)$/i, '').replace(/\.(mov|mp4)$/i, '');

      if (isConvertedFolder) {
        // If user right-clicked a converted folder/file (e.g. test1_MOV or STRM_E1_0370.mov),
        // the source EXR folder is the cleanBase sibling, and target is cleanSrc!
        const exrSourceDir = parentDir ? `${parentDir}/${cleanBase}` : cleanBase;
        setSourceDir(exrSourceDir);
        setTargetDir(cleanSrc);
        runComparison(exrSourceDir, cleanSrc, defaultExpectedStart);
        return;
      }

      const siblingJpeg = parentDir ? `${parentDir}/${cleanBase}_JPEG` : `${cleanBase}_JPEG`;
      const siblingMov = parentDir ? `${parentDir}/${cleanBase}_MOV` : `${cleanBase}_MOV`;
      const jpegSub = `${cleanSrc}/JPEG`;
      const movSub = `${cleanSrc}/MOV`;

      // Check sibling _JPEG first
      window.electronAPI
        .compareFolders(cleanSrc, siblingJpeg, defaultExpectedStart)
        .then((res) => {
          if (res && res.targetFilesCount > 0) {
            setTargetDir(siblingJpeg);
            setReport(res);
          } else {
            // Check sibling _MOV next
            return window.electronAPI.compareFolders(cleanSrc, siblingMov, defaultExpectedStart).then((movRes) => {
              if (movRes && (movRes.targetFilesCount > 0 || movRes.isPerfectMatch)) {
                setTargetDir(siblingMov);
                setReport(movRes);
              } else {
                // Fallback to legacy subfolders if present
                return window.electronAPI.compareFolders(cleanSrc, jpegSub, defaultExpectedStart).then((subRes) => {
                  if (subRes && subRes.targetFilesCount > 0) {
                    setTargetDir(jpegSub);
                    setReport(subRes);
                  } else {
                    return window.electronAPI.compareFolders(cleanSrc, movSub, defaultExpectedStart).then((subMovRes) => {
                      if (subMovRes && (subMovRes.targetFilesCount > 0 || subMovRes.isPerfectMatch)) {
                        setTargetDir(movSub);
                        setReport(subMovRes);
                      }
                    });
                  }
                });
              }
            });
          }
        })
        .catch(() => {});
    }
  }, [defaultSourceDir, defaultTargetDir, defaultExpectedStart]);

  const handleSelectSource = async () => {
    if (!window.electronAPI) return;
    const selected = await window.electronAPI.selectInputFolder();
    if (selected) {
      const p = Array.isArray(selected) ? selected[0] : selected;
      setSourceDir(p);
      runComparison(p, targetDir);
    }
  };

  const handleSelectTarget = async () => {
    if (!window.electronAPI) return;
    const selected = await window.electronAPI.selectOutputFolder(targetDir || sourceDir);
    if (selected) {
      setTargetDir(selected);
      runComparison(sourceDir, selected);
    }
  };

  const handleCopyNumbers = () => {
    if (!report || report.missingInTarget.length === 0) return;
    navigator.clipboard.writeText(report.missingInTarget.join(', '));
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
    if (!window.electronAPI || !report || !targetDir) return;
    const savedPath = await window.electronAPI.saveFolderComparisonReport(targetDir, report);
    if (savedPath) {
      setSavedReportPath(savedPath);
      setTimeout(() => setSavedReportPath(null), 3500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-fadeIn">
      <div className="studio-card max-w-2xl w-full p-5 border-studio-borderLight shadow-2xl relative max-h-[85vh] flex flex-col rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-studio-border/60">
          <div className="flex items-center space-x-2.5">
            <h3 className="text-sm font-semibold text-studio-text tracking-tight">
              Folder Comparison
            </h3>
            {report && (
              <span
                className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  report.isPerfectMatch
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${report.isPerfectMatch ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span>
                  {report.isPerfectMatch
                    ? `100% Match (${report.sourceFilesCount} frames)`
                    : `${report.missingInTarget.length} Missing Frame${report.missingInTarget.length > 1 ? 's' : ''}`}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => runComparison(sourceDir, targetDir)}
              disabled={isLoading}
              title="Re-scan comparison"
              className="p-1.5 rounded-md hover:bg-white/5 text-studio-textMuted hover:text-studio-text transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-studio-accent' : ''}`} />
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="p-1.5 rounded-md hover:bg-white/5 text-studio-textMuted hover:text-studio-text transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Minimal Comparison Strip */}
        <div className="mt-3.5 p-3 rounded-lg bg-studio-bg/70 border border-studio-border/60 flex items-center justify-between gap-3">
          {/* Source Folder */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-1.5 text-xs text-studio-textSecondary font-mono mb-0.5">
              <FolderCheck className="w-3.5 h-3.5 text-studio-accent flex-shrink-0" />
              <span className="font-medium text-studio-text">Source EXR</span>
            </div>
            <div className="text-xs font-mono text-studio-textSecondary truncate" title={sourceDir}>
              {getFolderBasename(sourceDir) || 'No folder selected'}
            </div>
            {sourceDir ? (
              <div className="flex items-center space-x-2 mt-1 text-[11px] text-studio-textMuted font-mono">
                <span className="text-studio-text font-semibold">{report?.sourceFilesCount ?? '...'} frames</span>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleSelectSource}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-studio-accent hover:text-white border border-studio-border/60 transition-colors text-[11px] cursor-pointer"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.revealInFolder(sourceDir)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-studio-textSecondary hover:text-studio-text border border-studio-border/60 transition-colors text-[11px] cursor-pointer"
                  title="Reveal in Finder / Explorer"
                >
                  Reveal
                </button>
              </div>
            ) : (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={handleSelectSource}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-mono font-medium bg-studio-accent/15 border border-studio-accent/30 text-studio-accent hover:bg-studio-accent/25 hover:border-studio-accent/60 transition-all cursor-pointer shadow-sm"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Select Folder</span>
                </button>
              </div>
            )}
          </div>

          {/* Flow Indicator */}
          <div className="flex flex-col items-center justify-center px-1 flex-shrink-0 text-studio-textMuted">
            <ArrowRight className="w-4 h-4 text-studio-borderLight" />
          </div>

          {/* Converted Folder */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-1.5 text-xs text-studio-textSecondary font-mono mb-0.5">
              <FolderOpen className="w-3.5 h-3.5 text-studio-success flex-shrink-0" />
              <span className="font-medium text-studio-text">Converted {report?.targetFormat || 'Output'}</span>
            </div>
            <div className="text-xs font-mono text-studio-textSecondary truncate" title={targetDir}>
              {getFolderBasename(targetDir) || 'No folder selected'}
            </div>
            {targetDir ? (
              <div className="flex items-center space-x-2 mt-1 text-[11px] text-studio-textMuted font-mono">
                <span className={`font-semibold ${report && report.missingInTarget.length > 0 ? 'text-amber-400' : 'text-studio-text'}`}>
                  {report?.targetFormat === 'MOV' ? '1 video' : `${report?.targetFilesCount ?? '...'} frames`}
                </span>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleSelectTarget}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-studio-accent hover:text-white border border-studio-border/60 transition-colors text-[11px] cursor-pointer"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.revealInFolder(targetDir)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-studio-textSecondary hover:text-studio-text border border-studio-border/60 transition-colors text-[11px] cursor-pointer"
                  title="Reveal in Finder / Explorer"
                >
                  Reveal
                </button>
              </div>
            ) : (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={handleSelectTarget}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-mono font-medium bg-studio-accent/15 border border-studio-accent/30 text-studio-accent hover:bg-studio-accent/25 hover:border-studio-accent/60 transition-all cursor-pointer shadow-sm"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Select Folder</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sequence & VFX Start Bar */}
        <div className="mt-2.5 flex items-center justify-between text-xs text-studio-textMuted font-mono px-1">
          <div className="flex items-center space-x-1.5">
            <span>VFX Start:</span>
            <button
              onClick={() => {
                const next = startFrame === 1001 ? 1 : 1001;
                setStartFrame(next);
                runComparison(sourceDir, targetDir, next);
              }}
              className="px-1.5 py-0.5 rounded border border-studio-border bg-studio-bg hover:border-studio-accent text-studio-text text-[11px] transition-colors cursor-pointer"
              title="Click to toggle between start 1001 and start 1"
            >
              {startFrame} {startFrame === 1001 ? '(1001 standard)' : '(start 1)'}
            </button>
          </div>

          {report && report.sourceFrames.length > 0 && (
            <span className="text-[11px]">
              Range: {report.sourceFrames[0]} → {report.sourceFrames[report.sourceFrames.length - 1]}
            </span>
          )}
        </div>

        {/* Results Area */}
        <div className="mt-3 flex-1 overflow-y-auto min-h-[140px] max-h-[300px] scrollbar-thin">
          {/* State 0: No comparison yet / Select Folders */}
          {!report && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3 rounded-lg bg-studio-bg/40 border border-studio-border/40">
              <div className="w-9 h-9 rounded-full bg-studio-accent/10 border border-studio-accent/20 text-studio-accent flex items-center justify-center">
                <FolderCheck className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-studio-text">
                {!sourceDir ? 'Select Source EXR Folder' : !targetDir ? 'Select Converted Output Folder' : 'Ready to Compare'}
              </div>
              <p className="text-[11px] text-studio-textSecondary max-w-sm">
                {!sourceDir
                  ? 'Select the folder containing original EXR sequence frames.'
                  : !targetDir
                  ? 'Choose the converted output folder (e.g. /JPEG or /MOV) to check for missing frames.'
                  : 'Click the refresh button above to start comparison.'}
              </p>
              {(!sourceDir || !targetDir) && (
                <button
                  type="button"
                  onClick={!sourceDir ? handleSelectSource : handleSelectTarget}
                  className="studio-button-primary px-4 py-2 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer rounded-lg"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{!sourceDir ? 'Choose Source EXR Folder' : 'Choose Output Folder'}</span>
                </button>
              )}
            </div>
          )}

          {/* State 1: Perfect Match */}
          {report && report.isPerfectMatch && (
            <div className="py-7 flex flex-col items-center justify-center text-center space-y-2 rounded-lg bg-studio-bg/40 border border-studio-border/40">
              <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-studio-text">
                Folders Match Perfectly
              </div>
              <p className="text-[11px] text-studio-textSecondary max-w-sm">
                All {report.sourceFilesCount} frames in the EXR sequence were successfully converted to {report.targetFormat} with zero missing frames.
              </p>
            </div>
          )}

          {/* State 2: Missing Frames */}
          {report && !report.isPerfectMatch && (
            <div className="space-y-2">
              {/* Header Action Strip */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-mono font-medium text-amber-400 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Missing in Converted Folder ({report.missingInTarget.length}):</span>
                </span>

                <div className="flex items-center space-x-2 text-[11px] font-mono">
                  <button
                    onClick={handleCopyNumbers}
                    className="text-studio-accent hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedNumbers ? <Check className="w-3 h-3 text-studio-success" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedNumbers ? 'Copied!' : 'Copy Numbers'}</span>
                  </button>
                  <span className="text-studio-borderLight">•</span>
                  <button
                    onClick={handleCopyFileNames}
                    className="text-studio-accent hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedFileNames ? <Check className="w-3 h-3 text-studio-success" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedFileNames ? 'Copied!' : 'Copy File Names'}</span>
                  </button>
                </div>
              </div>

              {/* Clean List */}
              <div className="rounded-lg border border-studio-border/70 bg-studio-bg divide-y divide-studio-border/40 overflow-hidden">
                {report.missingInTarget.map((frameNum, idx) => {
                  const fileName = report.missingFileNames[idx] || `frame_${frameNum}.${report.targetFormat.toLowerCase()}`;
                  return (
                    <div
                      key={frameNum}
                      className="px-3 py-2 flex items-center justify-between text-xs font-mono hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-semibold text-[11px]">
                          #{frameNum}
                        </span>
                        <span className="text-studio-text truncate">{fileName}</span>
                      </div>
                      <span className="text-[11px] text-rose-400/80 font-medium flex-shrink-0">
                        Missing
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Gaps Note if Start Frame has Gap */}
              {report.missingFromStart.length > 0 && (
                <div className="p-2.5 rounded bg-amber-500/5 border border-amber-500/15 text-[11px] font-mono text-amber-300/80 flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <span>
                    Sequence starts at frame {report.sourceFrames[0] ?? 1001} (missing {report.missingFromStart.length} head frames from expected {report.expectedStartFrame}).
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-studio-border/60 flex items-center justify-between">
          <button
            type="button"
            onClick={handleSaveReport}
            disabled={!report}
            className="px-3 py-1.5 rounded-md hover:bg-white/5 text-xs font-mono text-studio-textSecondary hover:text-studio-text flex items-center space-x-1.5 transition-colors border border-studio-border cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-studio-accent" />
            <span>{savedReportPath ? '✓ Report Saved' : 'Save Report (.txt)'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="studio-button-primary px-4 py-1.5 text-xs font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
