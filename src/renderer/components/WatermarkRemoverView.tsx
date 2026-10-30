import React, { useState, useEffect, useId, useRef } from 'react';
import {
  Sparkles,
  FolderOpen,
  FileImage,
  Film,
  Play,
  Square,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Plus,
  FolderPlus,
  SlidersHorizontal,
} from 'lucide-react';
import {
  WatermarkBatchResult,
  WatermarkItem,
  WatermarkOptions,
  WatermarkOutputMode,
} from '../../shared/types';

export interface WatermarkExternalLaunch {
  id: number;
  paths: string[];
  autoStart: boolean;
}

interface WatermarkRemoverViewProps {
  externalLaunch?: WatermarkExternalLaunch | null;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function toMediaUrl(filePath: string, cacheKey: number): string {
  return `media://local/${encodeURIComponent(filePath)}?v=${cacheKey}`;
}

function toPreviewFrameUrl(
  mediaType: 'image' | 'video',
  filePath: string,
  cacheKey: number,
  seekSec: number
): string {
  if (mediaType === 'video') {
    return `media://frame/${encodeURIComponent(filePath)}?t=${seekSec.toFixed(2)}&v=${cacheKey}`;
  }
  return toMediaUrl(filePath, cacheKey);
}

export const WatermarkRemoverView: React.FC<WatermarkRemoverViewProps> = ({
  externalLaunch,
}) => {
  const sliderId = useId();
  const outputModeId = useId();
  const lastLaunchIdRef = useRef<number>(0);

  const [items, setItems] = useState<WatermarkItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [batchResult, setBatchResult] = useState<WatermarkBatchResult | null>(null);
  const [cacheVersion, setCacheVersion] = useState<number>(() => Date.now());

  // Before / After comparison state
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [zoomCorner, setZoomCorner] = useState<boolean>(false);
  const [videoSeekSec, setVideoSeekSec] = useState<number>(0.5);

  // Options state
  const [options, setOptions] = useState<WatermarkOptions>({
    outputMode: 'auto',
    customOutputDir: '',
    copySkippedInFolderMode: true,
    forceRemoveLowConfidence: false,
    highQualityVideoCleanup: false,
    videoGain: 0.60,
  });

  // Subscribe to live watermark progress events from Main process
  useEffect(() => {
    if (!window.electronAPI?.onWatermarkProgress) return;
    const unsub = window.electronAPI.onWatermarkProgress((evt) => {
      setOverallProgress(evt.overallProgress);
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== evt.itemId) return item;
          return {
            ...item,
            status: evt.status,
            progress: evt.itemProgress,
            outputPath: evt.outputPath ?? item.outputPath,
            width: evt.width ?? item.width,
            height: evt.height ?? item.height,
            watermarkDetected: evt.watermarkDetected ?? item.watermarkDetected,
            watermarkInfo: evt.watermarkInfo ?? item.watermarkInfo,
            skipReason: evt.skipReason ?? item.skipReason,
            error: evt.error ?? item.error,
            processingTimeMs: evt.processingTimeMs ?? item.processingTimeMs,
          };
        })
      );
    });
    return () => unsub();
  }, []);

  // Handle right-click context menu launches (Single/Multiple Files or Single/Multiple Folders)
  useEffect(() => {
    if (!externalLaunch || externalLaunch.id === lastLaunchIdRef.current) return;
    lastLaunchIdRef.current = externalLaunch.id;

    if (externalLaunch.paths.length > 0) {
      handleIngestPaths(externalLaunch.paths, false, externalLaunch.autoStart);
    }
  }, [externalLaunch]);

  const handleIngestPaths = async (
    rawPaths: string[],
    append: boolean = false,
    autoStartBatch: boolean = false
  ) => {
    if (!rawPaths || rawPaths.length === 0) return;
    setIsScanning(true);
    try {
      const scanRes = await window.electronAPI.scanWatermarkPaths(rawPaths);
      if (scanRes.items.length === 0) {
        if (!autoStartBatch) {
          alert(
            'No supported images (.png, .jpg, .webp, .bmp, .tiff) or videos (.mp4, .mov, .webm, .mkv) were found in the selection.'
          );
        }
        return;
      }

      let nextItems: WatermarkItem[] = [];
      if (append && items.length > 0) {
        const existingPaths = new Set(items.map((i) => i.inputPath));
        const additions = scanRes.items.filter((i) => !existingPaths.has(i.inputPath));
        nextItems = [...items, ...additions];
      } else {
        nextItems = scanRes.items;
        setBatchResult(null);
        setOverallProgress(0);
      }

      setItems(nextItems);
      if (nextItems.length > 0 && (!selectedItemId || !append)) {
        setSelectedItemId(nextItems[0].id);
      }

      if (autoStartBatch && nextItems.length > 0) {
        await runBatch(nextItems, options, true);
      }
    } catch (err: any) {
      console.error('Watermark scan error:', err);
      if (!autoStartBatch) {
        alert(`Failed to scan selected paths: ${err?.message || err}`);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const runBatch = async (
    targetItems: WatermarkItem[],
    activeOptions: WatermarkOptions,
    notifyDesktop: boolean = false
  ) => {
    if (targetItems.length === 0 || isProcessing) return;

    if (activeOptions.outputMode === 'custom' && !activeOptions.customOutputDir) {
      const picked = await window.electronAPI.selectOutputFolder();
      if (!picked) return;
      activeOptions = { ...activeOptions, customOutputDir: picked };
      setOptions(activeOptions);
    }

    setIsProcessing(true);
    setBatchResult(null);
    setOverallProgress(1);
    setCacheVersion(Date.now());

    try {
      const res = await window.electronAPI.processWatermarkBatch(targetItems, activeOptions);
      setItems(res.items);
      setBatchResult(res);
      setOverallProgress(100);
      setCacheVersion(Date.now());

      // Auto-select the first cleaned item for immediate Before/After inspection
      const firstCleaned = res.items.find((i) => i.status === 'cleaned');
      if (firstCleaned) {
        setSelectedItemId(firstCleaned.id);
      }

      if (notifyDesktop && !res.cancelled) {
        const summary =
          res.cleanedCount > 0
            ? `Removed Gemini watermark from ${res.cleanedCount} file${res.cleanedCount > 1 ? 's' : ''}${
                res.skippedCount > 0 ? ` (${res.skippedCount} already clean)` : ''
              }.`
            : `Scanned ${res.items.length} file${res.items.length > 1 ? 's' : ''}: no Gemini watermarks detected.`;
        window.electronAPI.notifyCompletion('Gemini Watermark Remover', summary).catch(() => {});
      }
    } catch (err: any) {
      console.error('Watermark batch error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectFiles = async (append: boolean = false) => {
    const selected = await window.electronAPI.selectWatermarkFiles();
    if (selected && selected.length > 0) {
      handleIngestPaths(selected, append, false);
    }
  };

  const handleSelectFolders = async (append: boolean = false) => {
    const selected = await window.electronAPI.selectWatermarkFolders();
    if (selected && selected.length > 0) {
      handleIngestPaths(selected, append, false);
    }
  };

  const handleSelectCustomOutputDir = async () => {
    const picked = await window.electronAPI.selectOutputFolder(options.customOutputDir || undefined);
    if (picked) {
      setOptions((prev) => ({ ...prev, outputMode: 'custom', customOutputDir: picked }));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedPaths = Array.from(e.dataTransfer.files)
        .map((f) => window.electronAPI?.getPathForFile?.(f) || (f as any).path)
        .filter(Boolean);
      if (droppedPaths.length > 0) {
        handleIngestPaths(droppedPaths, items.length > 0, false);
      }
    }
  };

  const selectedItem = items.find((i) => i.id === selectedItemId) || items[0] || null;
  const imageCount = items.filter((i) => i.mediaType === 'image').length;
  const videoCount = items.filter((i) => i.mediaType === 'video').length;
  const distinctFolders = new Set(items.map((i) => i.sourceRootFolder).filter(Boolean)).size;
  const cleanedItemsCount = items.filter((i) => i.status === 'cleaned').length;

  // Empty DropZone State
  if (items.length === 0) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex flex-col items-center justify-center min-h-[480px] p-6 max-w-2xl mx-auto w-full"
      >
        <div
          className={`w-full rounded-2xl border border-dashed p-12 flex flex-col items-center justify-center text-center transition-all duration-200 ${
            isDragOver
              ? 'border-studio-accent bg-studio-accent/10 shadow-glow-accent scale-[1.01]'
              : 'border-studio-border/70 bg-studio-card/40 hover:border-studio-borderLight hover:bg-studio-card/60'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-studio-bg border border-studio-border flex items-center justify-center mb-4 text-studio-accent shadow-sm">
            <Sparkles className="w-7 h-7" />
          </div>

          <h2 className="text-lg font-semibold text-studio-text mb-1">
            Gemini &amp; Veo Watermark Remover
          </h2>
          <p className="text-xs text-studio-textSecondary mb-6 max-w-md leading-relaxed">
            Drop a single file, multiple files, a single folder, or multiple folders. Uses lossless
            mathematical Reverse Alpha Blending for pixel-accurate restoration.
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => handleSelectFiles(false)}
              disabled={isScanning}
              className="studio-button-primary px-5 py-2.5 text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              <FileImage className="w-4 h-4" />
              <span>{isScanning ? 'Scanning...' : 'Select File(s)'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectFolders(false)}
              disabled={isScanning}
              className="studio-button-secondary px-5 py-2.5 text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-studio-accent" />
              <span>Select Folder(s)</span>
            </button>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-studio-textMuted font-mono text-center">
          Supports PNG, JPG, WebP, BMP, TIFF &amp; MP4, MOV, WebM • 100% Local Offline Processing
        </p>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`space-y-4 w-full transition-all ${
        isDragOver ? 'ring-2 ring-studio-accent rounded-xl' : ''
      }`}
    >
      {/* Top Batch Controls & Output Settings Card */}
      <div className="studio-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Batch Summary */}
          <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-studio-accent" />
              <span className="text-sm font-semibold text-studio-text">
                {items.length} {items.length === 1 ? 'File' : 'Files'} Queued
              </span>
            </div>

            <div className="flex items-center space-x-1.5 text-[11px] font-mono text-studio-textSecondary">
              {imageCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-studio-bg border border-studio-border">
                  {imageCount} {imageCount === 1 ? 'Image' : 'Images'}
                </span>
              )}
              {videoCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-studio-bg border border-studio-border">
                  {videoCount} {videoCount === 1 ? 'Video' : 'Videos'}
                </span>
              )}
              {distinctFolders > 0 && (
                <span className="px-2 py-0.5 rounded bg-studio-accent/15 border border-studio-accent/40 text-studio-accent">
                  {distinctFolders} {distinctFolders === 1 ? 'Folder' : 'Folders'}
                </span>
              )}
            </div>
          </div>

          {/* Add / Clear / Run Buttons */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <button
              type="button"
              onClick={() => handleSelectFiles(true)}
              disabled={isProcessing || isScanning}
              className="studio-button-secondary px-2.5 py-1.5 text-xs flex items-center space-x-1 disabled:opacity-40 cursor-pointer"
              title="Add single or multiple files to batch"
            >
              <Plus className="w-3.5 h-3.5 text-studio-accent" />
              <span>Add Files</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectFolders(true)}
              disabled={isProcessing || isScanning}
              className="studio-button-secondary px-2.5 py-1.5 text-xs flex items-center space-x-1 disabled:opacity-40 cursor-pointer"
              title="Add single or multiple folders to batch"
            >
              <FolderPlus className="w-3.5 h-3.5 text-studio-accent" />
              <span>Add Folders</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setItems([]);
                setSelectedItemId(null);
                setBatchResult(null);
                setOverallProgress(0);
              }}
              disabled={isProcessing}
              className="studio-button-secondary px-2.5 py-1.5 text-xs flex items-center space-x-1 text-studio-textSecondary hover:text-studio-error disabled:opacity-40 cursor-pointer"
              title="Clear batch list"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>

            {isProcessing ? (
              <button
                type="button"
                onClick={() => window.electronAPI.cancelWatermarkBatch()}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-studio-error/20 border border-studio-error text-studio-error hover:bg-studio-error/30 flex items-center space-x-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Batch</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => runBatch(items, options, false)}
                className="studio-button-primary px-5 py-1.5 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {batchResult ? 'Re-Run Watermark Removal' : `Remove Watermark (${items.length})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Output Mode & Quality Settings Row */}
        <div className="pt-2 border-t border-studio-border/60 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-studio-textMuted" />
            <label htmlFor={outputModeId} className="text-studio-textSecondary font-medium">
              Output:
            </label>
            <select
              id={outputModeId}
              value={options.outputMode}
              disabled={isProcessing}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  outputMode: e.target.value as WatermarkOutputMode,
                }))
              }
              className="bg-studio-bg border border-studio-border rounded-md px-2.5 py-1 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
            >
              <option value="auto">
                Smart Auto (_Cleaned folder for folders • _clean for single file)
              </option>
              <option value="subfolder">Dedicated _Cleaned Folder</option>
              <option value="suffix">Beside Original (_clean suffix)</option>
              <option value="custom">Custom Output Folder...</option>
            </select>

            {options.outputMode === 'custom' && (
              <button
                type="button"
                onClick={handleSelectCustomOutputDir}
                disabled={isProcessing}
                className="studio-button-secondary px-2.5 py-1 text-xs font-mono truncate max-w-[220px] cursor-pointer"
                title={options.customOutputDir || 'Choose Output Folder'}
              >
                {options.customOutputDir
                  ? options.customOutputDir.split(/[/\\]/).pop()
                  : 'Choose Folder...'}
              </button>
            )}
          </div>

          <div className="flex items-center space-x-4 text-studio-textSecondary">
            {videoCount > 0 && (
              <div className="flex items-center space-x-2 text-xs" title="Video reverse-alpha removal strength (0.48× default calibrated for Veo videos)">
                <label htmlFor="watermark-strength-slider" className="text-studio-textSecondary font-medium select-none">
                  Strength:
                </label>
                <input
                  id="watermark-strength-slider"
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={options.videoGain ?? 0.60}
                  aria-valuetext={`${((options.videoGain ?? 0.60) * 100).toFixed(0)}%`}
                  disabled={isProcessing}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      videoGain: parseFloat(e.target.value),
                    }))
                  }
                  className="w-20 accent-studio-accent cursor-pointer"
                />
                <span className="font-mono text-[11px] text-studio-accent w-8" aria-hidden="true">
                  {((options.videoGain ?? 0.60) * 100).toFixed(0)}%
                </span>
              </div>
            )}

            {videoCount > 0 && (
              <>
                <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(options.highQualityVideoCleanup)}
                    disabled={isProcessing}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        highQualityVideoCleanup: e.target.checked,
                      }))
                    }
                    className="accent-studio-accent rounded"
                  />
                  <span>HQ Video Edge Polish</span>
                </label>
              </>
            )}

            <label
              className="flex items-center space-x-1.5 cursor-pointer select-none"
              title="Forces standard Gemini corner removal even if automatic confidence is low"
            >
              <input
                type="checkbox"
                checked={Boolean(options.forceRemoveLowConfidence)}
                disabled={isProcessing}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    forceRemoveLowConfidence: e.target.checked,
                  }))
                }
                className="accent-studio-accent rounded"
              />
              <span>Force Corner Removal</span>
            </label>
          </div>
        </div>

        {/* Live Progress / Batch Completion Bar */}
        {(isProcessing || batchResult) && (
          <div className="pt-2 border-t border-studio-border/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                {isProcessing ? (
                  <span className="text-studio-accent font-medium">
                    Cleaning watermarks... {overallProgress}%
                  </span>
                ) : batchResult ? (
                  <span className="text-studio-success font-medium flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      Done in {(batchResult.elapsedMs / 1000).toFixed(1)}s —{' '}
                      {batchResult.cleanedCount} cleaned
                      {batchResult.skippedCount > 0
                        ? `, ${batchResult.skippedCount} already clean`
                        : ''}
                      {batchResult.failedCount > 0 ? `, ${batchResult.failedCount} failed` : ''}
                    </span>
                  </span>
                ) : null}
              </div>

              {batchResult?.primaryOutputDir && (
                <button
                  type="button"
                  onClick={() => window.electronAPI.openDirectory(batchResult.primaryOutputDir)}
                  className="text-xs text-studio-accent hover:underline flex items-center space-x-1 cursor-pointer font-medium"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Open Output Folder</span>
                </button>
              )}
            </div>

            <div className="w-full h-1.5 bg-studio-bg rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  isProcessing ? 'bg-studio-accent' : 'bg-studio-success'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Split Workspace: Queue List (Left) + Before/After Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Batch Queue List */}
        <div className="studio-card lg:col-span-5 overflow-hidden flex flex-col max-h-[540px]">
          <div className="px-3.5 py-2.5 border-b border-studio-border bg-studio-bg/40 flex items-center justify-between text-xs">
            <span className="font-semibold text-studio-textSecondary uppercase tracking-wider text-[10px]">
              Batch Files ({items.length})
            </span>
            {cleanedItemsCount > 0 && (
              <span className="text-[11px] font-mono text-studio-success">
                {cleanedItemsCount} Cleaned
              </span>
            )}
          </div>

          <div className="divide-y divide-studio-border/50 overflow-y-auto flex-1">
            {items.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              const rootFolderName = item.sourceRootFolder
                ? item.sourceRootFolder.split(/[/\\]/).filter(Boolean).pop()
                : null;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`px-3.5 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-studio-accent/15 border-l-2 border-l-studio-accent'
                      : 'hover:bg-studio-cardHover'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-studio-bg border border-studio-border flex items-center justify-center shrink-0">
                      {item.mediaType === 'video' ? (
                        <Film className="w-4 h-4 text-studio-accent" />
                      ) : (
                        <FileImage className="w-4 h-4 text-studio-accent" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <p
                          className="text-xs font-medium text-studio-text truncate"
                          title={item.inputPath}
                        >
                          {item.fileName}
                        </p>
                      </div>

                      <div className="flex items-center space-x-1.5 text-[10px] font-mono text-studio-textMuted truncate">
                        {rootFolderName && (
                          <span className="text-studio-textSecondary truncate max-w-[110px]">
                            {rootFolderName}/
                          </span>
                        )}
                        <span>{formatBytes(item.fileSizeBytes)}</span>
                        {item.width && item.height && (
                          <span>
                            • {item.width}×{item.height}
                          </span>
                        )}
                        {item.watermarkInfo && (
                          <span className="text-studio-accent truncate">
                            • {item.watermarkInfo}
                          </span>
                        )}
                      </div>

                      {item.status === 'processing' && item.mediaType === 'video' && (
                        <div className="mt-1.5 w-full h-1 bg-studio-bg rounded-full overflow-hidden">
                          <div
                            className="h-full bg-studio-accent transition-all duration-150"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Badge & Reveal Action */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {item.status === 'pending' && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-studio-bg border border-studio-border text-studio-textMuted">
                        Ready
                      </span>
                    )}
                    {item.status === 'processing' && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-studio-accent/20 border border-studio-accent/50 text-studio-accent">
                        {item.mediaType === 'video' ? `${item.progress}%` : 'Cleaning...'}
                      </span>
                    )}
                    {item.status === 'cleaned' && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-studio-success/15 border border-studio-success/40 text-studio-success">
                        Cleaned
                      </span>
                    )}
                    {item.status === 'skipped' && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-studio-warning/15 border border-studio-warning/40 text-studio-warning"
                        title={item.skipReason}
                      >
                        No Watermark
                      </span>
                    )}
                    {item.status === 'failed' && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-studio-error/15 border border-studio-error/40 text-studio-error flex items-center space-x-1"
                        title={item.error}
                      >
                        <AlertCircle className="w-3 h-3" />
                        <span>Error</span>
                      </span>
                    )}

                    {(item.outputPath || item.inputPath) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.electronAPI.revealInFolder(item.outputPath || item.inputPath);
                        }}
                        className="p-1 rounded hover:bg-studio-bg text-studio-textMuted hover:text-studio-text transition-colors cursor-pointer"
                        title={
                          item.outputPath
                            ? `Reveal cleaned file: ${item.outputPath}`
                            : `Reveal source file: ${item.inputPath}`
                        }
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Before / After Interactive Comparison Inspector */}
        <div className="studio-card lg:col-span-7 p-4 space-y-3">
          {selectedItem ? (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-studio-text truncate">
                    {selectedItem.fileName}
                  </h3>
                  <p className="text-[11px] font-mono text-studio-textMuted truncate">
                    {selectedItem.status === 'cleaned' && selectedItem.outputPath
                      ? `Saved: ${selectedItem.outputPath}`
                      : selectedItem.skipReason || selectedItem.error || selectedItem.inputPath}
                  </p>
                </div>

                <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                  {selectedItem.mediaType === 'video' && (
                    <div className="flex items-center rounded-md bg-studio-bg border border-studio-border p-0.5 text-[10px] font-mono">
                      {[0.5, 2.0, 5.0]
                        .filter(
                          (t) =>
                            !selectedItem.durationSeconds ||
                            t <= Math.max(0.6, selectedItem.durationSeconds - 0.1)
                        )
                        .map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setVideoSeekSec(t)}
                            className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                              videoSeekSec === t
                                ? 'bg-studio-accent text-white'
                                : 'text-studio-textMuted hover:text-studio-text'
                            }`}
                            title={`Inspect video frame at ${t.toFixed(1)}s`}
                          >
                            {t.toFixed(1)}s
                          </button>
                        ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const nextZoom = !zoomCorner;
                      setZoomCorner(nextZoom);
                      if (nextZoom && splitPercent < 65) {
                        setSplitPercent(85);
                      } else if (!nextZoom) {
                        setSplitPercent(50);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center space-x-1 cursor-pointer transition-colors ${
                      zoomCorner
                        ? 'bg-studio-accent/20 border-studio-accent text-studio-accent'
                        : 'bg-studio-bg border-studio-border text-studio-textSecondary hover:text-studio-text'
                    }`}
                    title="Zoom 3.5× into bottom-right watermark corner"
                  >
                    {zoomCorner ? (
                      <ZoomOut className="w-3.5 h-3.5" />
                    ) : (
                      <ZoomIn className="w-3.5 h-3.5" />
                    )}
                    <span>{zoomCorner ? 'Reset Zoom' : 'Zoom Corner (3.5×)'}</span>
                  </button>

                  {selectedItem.mediaType === 'video' && (
                    <button
                      type="button"
                      onClick={() =>
                        window.electronAPI.openVideo(
                          selectedItem.status === 'cleaned' && selectedItem.outputPath
                            ? selectedItem.outputPath
                            : selectedItem.inputPath
                        )
                      }
                      className="studio-button-primary px-2.5 py-1 text-xs flex items-center space-x-1 cursor-pointer"
                      title="Open video in QuickTime / default media player"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>
                        {selectedItem.status === 'cleaned' ? 'Play Cleaned' : 'Play Video'}
                      </span>
                    </button>
                  )}

                  {selectedItem.outputPath && (
                    <button
                      type="button"
                      onClick={() =>
                        window.electronAPI.revealInFolder(selectedItem.outputPath as string)
                      }
                      className="studio-button-secondary px-2.5 py-1 text-xs flex items-center space-x-1 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-studio-accent" />
                      <span>Reveal File</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Media Preview Stage (Images & Lossless FFmpeg Video Frames) */}
              <div className="relative rounded-xl bg-studio-bg border border-studio-border overflow-hidden flex items-center justify-center min-h-[320px] max-h-[420px]">
                {selectedItem.status === 'cleaned' && selectedItem.outputPath ? (
                  <div className="relative inline-block max-w-full max-h-[410px] overflow-hidden select-none">
                    {/* Base Layer: Cleaned Frame / Image (After) */}
                    <img
                      src={toPreviewFrameUrl(
                        selectedItem.mediaType,
                        selectedItem.outputPath,
                        cacheVersion,
                        videoSeekSec
                      )}
                      alt={`Cleaned ${selectedItem.fileName}`}
                      style={{
                        transformOrigin: 'bottom right',
                        transform: zoomCorner ? 'scale(3.5)' : 'scale(1)',
                      }}
                      className="block max-w-full max-h-[410px] w-auto h-auto object-contain transition-transform duration-200"
                      draggable={false}
                    />

                    {/* Clipped Overlay Layer: Original Frame / Image (Before) */}
                    <img
                      src={toPreviewFrameUrl(
                        selectedItem.mediaType,
                        selectedItem.inputPath,
                        cacheVersion,
                        videoSeekSec
                      )}
                      alt={`Original ${selectedItem.fileName}`}
                      style={{
                        clipPath: `inset(0 ${100 - splitPercent}% 0 0)`,
                        transformOrigin: 'bottom right',
                        transform: zoomCorner ? 'scale(3.5)' : 'scale(1)',
                      }}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-transform duration-200"
                      draggable={false}
                    />

                    {/* Vertical Split Divider Line */}
                    <div
                      aria-hidden="true"
                      style={{ left: `${splitPercent}%` }}
                      className="absolute inset-y-0 w-0.5 bg-studio-accent shadow-[0_0_10px_rgba(124,92,255,0.9)] pointer-events-none"
                    />

                    {/* Corner Labels */}
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/75 border border-white/10 text-[10px] font-mono text-studio-textSecondary pointer-events-none">
                      BEFORE (ORIGINAL)
                    </span>
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-studio-accent/85 text-[10px] font-mono text-white pointer-events-none">
                      AFTER (CLEANED)
                    </span>
                  </div>
                ) : (
                  <img
                    src={toPreviewFrameUrl(
                      selectedItem.mediaType,
                      selectedItem.inputPath,
                      cacheVersion,
                      videoSeekSec
                    )}
                    alt={selectedItem.fileName}
                    style={{
                      transformOrigin: 'bottom right',
                      transform: zoomCorner ? 'scale(3.5)' : 'scale(1)',
                    }}
                    className="block max-w-full max-h-[410px] w-auto h-auto object-contain transition-transform duration-200"
                    draggable={false}
                  />
                )}
              </div>

              {/* Accessible Native Range Slider for Before/After Split (Images & Videos) */}
              {selectedItem.status === 'cleaned' && selectedItem.outputPath && (
                <div className="pt-1 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-studio-textSecondary">
                    <label htmlFor={sliderId} className="cursor-pointer">
                      Before / After Comparison Split
                      {selectedItem.mediaType === 'video'
                        ? ` (Frame @ ${videoSeekSec.toFixed(1)}s)`
                        : ''}
                    </label>
                    <span>
                      {splitPercent}% Before • {100 - splitPercent}% After
                    </span>
                  </div>
                  <input
                    id={sliderId}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={splitPercent}
                    aria-valuetext={`${splitPercent} percent original media, ${
                      100 - splitPercent
                    } percent cleaned media`}
                    onChange={(e) => setSplitPercent(Number(e.target.value))}
                    style={
                      {
                        '--attr-min': 0,
                        '--attr-max': 100,
                        '--control-value': splitPercent,
                      } as React.CSSProperties
                    }
                    className="studio-range-slider"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-studio-textMuted">
              Select a file from the batch list to preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

