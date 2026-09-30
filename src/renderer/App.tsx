import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { DropZone } from './components/DropZone';
import { SequenceCard } from './components/SequenceCard';
import { SettingsCard } from './components/SettingsCard';
import { OutputFolderPicker } from './components/OutputFolderPicker';
import { ProgressCard } from './components/ProgressCard';
import { CompletionCard } from './components/CompletionCard';
import { ErrorCard } from './components/ErrorCard';
import { MissingFramesModal } from './components/MissingFramesModal';
import { MissingFrameScannerModal } from './components/MissingFrameScannerModal';
import { LogViewerModal } from './components/LogViewerModal';
import { SettingsModal } from './components/SettingsModal';
import { CollisionModal } from './components/CollisionModal';
import { CancelModal } from './components/CancelModal';
import { HelpModal } from './components/HelpModal';
import { QueueDrawer } from './components/QueueDrawer';
import { FolderComparisonModal } from './components/FolderComparisonModal';
import {
  ConversionJob,
  ConversionSettings,
  DiskSpaceInfo,
  ExrSequence,
  FileCollisionResult,
  HardwareInfo,
  LogEntry,
} from '../shared/types';
import { Play, Sparkles, Layers, Film, Search, FolderCheck } from 'lucide-react';

export default function App() {
  const lastTargetRef = useRef<{ path: string; time: number } | null>(null);
  // Navigation & Screen state
  const [screenState, setScreenState] = useState<'empty' | 'ready' | 'converting' | 'completed' | 'failed'>('empty');

  // Sequence state
  const [inputFolder, setInputFolder] = useState<string | null>(null);
  const [detectedSequences, setDetectedSequences] = useState<ExrSequence[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<ExrSequence | null>(null);

  // Output & Settings state
  const [outputFolder, setOutputFolder] = useState<string>('');
  const [outputFileName, setOutputFileName] = useState<string>('');
  const [settings, setSettings] = useState<ConversionSettings>({
    outputFolder: '',
    outputFileName: '',
    outputFormat: 'mov', // QuickTime MOV per user requirement
    codec: 'h264',
    fps: 24,
    scalePercent: 50,
    targetWidth: 1920,
    targetHeight: 1080,
    quality: 'high',
    crf: 18,
    ffmpegPreset: 'medium',
    encoderEngine: 'auto',
    presetId: 'editorial',
    bitrateMbps: 40,
    bitrateMode: 'cbr',
    conversionMode: 'sequence', // MOV always merges into 1 single video
    jpegQuality: 8,
    jpegFormatOption: 'baseline',
    expectedStartFrame: 1001,
    createSubfolder: true,
  });

  // 2-Folder Comparison Modal State
  const [isFolderComparisonOpen, setIsFolderComparisonOpen] = useState(false);
  const [comparisonSourceDir, setComparisonSourceDir] = useState<string>('');
  const [comparisonTargetDir, setComparisonTargetDir] = useState<string>('');

  // Jobs & Progress
  const [currentJob, setCurrentJob] = useState<ConversionJob | null>(null);
  const [jobsQueue, setJobsQueue] = useState<ConversionJob[]>([]);

  // Diagnostics & Environment
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [diskSpaceInfo, setDiskSpaceInfo] = useState<DiskSpaceInfo | null>(null);
  const [collisionInfo, setCollisionInfo] = useState<FileCollisionResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Loading flags
  const [isScanning, setIsScanning] = useState(false);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);

  // Modals visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMissingFramesOpen, setIsMissingFramesOpen] = useState(false);
  const [isGapScannerOpen, setIsGapScannerOpen] = useState(false);
  const [isCollisionOpen, setIsCollisionOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // Initialize Hardware & IPC Listeners
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getHardwareInfo().then(setHardwareInfo).catch(console.error);
      window.electronAPI.getLogs().then(setLogs).catch(console.error);

      const unsubProgress = window.electronAPI.onProgress((job) => {
        setCurrentJob(job);
      });

      const unsubCompleted = window.electronAPI.onJobCompleted((job) => {
        setCurrentJob(job);
        setScreenState('completed');
      });

      const unsubFailed = window.electronAPI.onJobFailed((job) => {
        setCurrentJob(job);
        setScreenState('failed');
      });

      const unsubCancelled = window.electronAPI.onJobCancelled((job) => {
        setCurrentJob(job);
        setScreenState('ready');
      });

      const unsubJobs = window.electronAPI.onJobsUpdate((jobs) => {
        setJobsQueue(jobs);
      });

      const unsubLogs = window.electronAPI.onNewLog((entry) => {
        setLogs((prev) => [...prev.slice(-1500), entry]);
      });

      // Load persistent settings from disk
      window.electronAPI
        .getSettings()
        .then((saved) => {
          if (saved) {
            setSettings((prev) => ({ ...prev, ...saved }));
          }
        })
        .catch(console.error);

      // Load persistent job history from disk
      window.electronAPI
        .getHistory()
        .then((hist) => {
          if (hist && Array.isArray(hist) && hist.length > 0) {
            setJobsQueue(hist);
          }
        })
        .catch(console.error);

      // Handle target from right-click context menu (initial launch)
      window.electronAPI
        .getInitialPath()
        .then((initialTarget) => {
          if (initialTarget) {
            handleOpenTarget(initialTarget);
          }
        })
        .catch(console.error);

      // Handle target from right-click context menu (app already running)
      const unsubOpenPath = window.electronAPI.onOpenPath((target) => {
        handleOpenTarget(target);
      });

      return () => {
        unsubProgress();
        unsubCompleted();
        unsubFailed();
        unsubCancelled();
        unsubJobs();
        unsubLogs();
        unsubOpenPath();
      };
    }
  }, []);

  // Helper to compute sibling output directory outside the source EXR folder (e.g. test1 -> test1_JPEG or test1_MOV)
  const getSiblingOutputDir = (sourceDir: string, format: string) => {
    if (!sourceDir) return '';
    const clean = sourceDir.replace(/[/\\]+$/, '');
    const parent = clean.replace(/[/\\][^/\\]+$/, '');
    const base = clean.split(/[/\\]/).filter(Boolean).pop() || 'sequence';
    const tag = format === 'jpg' || format === 'jpeg' ? '_JPEG' : format === 'mov' ? '_MOV' : `_${format.toUpperCase()}`;
    if (base.toUpperCase().endsWith(tag)) {
      return clean;
    }
    const cleanBase = base.replace(/_(JPEG|MOV|MP4)$/i, '');
    return parent ? `${parent}/${cleanBase}${tag}` : `${cleanBase}${tag}`;
  };

  // Central Settings Updater with disk persistence
  const handleUpdateSettings = (newSettings: Partial<ConversionSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      const formatChanged = newSettings.outputFormat && newSettings.outputFormat !== prev.outputFormat;
      const subfolderChanged = newSettings.createSubfolder !== undefined && newSettings.createSubfolder !== prev.createSubfolder;

      if ((formatChanged || subfolderChanged) && selectedSequence) {
        const fmt = newSettings.outputFormat || prev.outputFormat;
        const newFileName = `${selectedSequence.sequenceName}.${fmt}`;
        setOutputFileName(newFileName);
        updated.outputFileName = newFileName;

        if (updated.createSubfolder !== false) {
          const rawBase = (inputFolder || selectedSequence.folderPath || '').replace(/[/\\](JPEG|MOV)$/i, '').replace(/_(JPEG|MOV)$/i, '');
          const newOut = getSiblingOutputDir(rawBase, fmt);
          setOutputFolder(newOut);
          updated.outputFolder = newOut;
        } else {
          const rawBase = (inputFolder || selectedSequence.folderPath || '').replace(/[/\\](JPEG|MOV)$/i, '').replace(/_(JPEG|MOV)$/i, '');
          setOutputFolder(rawBase);
          updated.outputFolder = rawBase;
        }

        checkCollisionAndDiskSpace(updated.outputFolder || outputFolder, newFileName, selectedSequence, updated.targetWidth, updated.targetHeight);
      } else if (newSettings.outputFormat && selectedSequence) {
        const newFileName = `${selectedSequence.sequenceName}.${newSettings.outputFormat}`;
        setOutputFileName(newFileName);
        updated.outputFileName = newFileName;
        checkCollisionAndDiskSpace(outputFolder, newFileName, selectedSequence, updated.targetWidth, updated.targetHeight);
      }
      window.electronAPI.saveSettings(updated).catch(console.error);
      return updated;
    });
  };

  // Update target dimensions when sequence or scalePercent changes
  const updateResolution = (seq: ExrSequence, scalePct: number) => {
    const factor = scalePct / 100;
    let w = Math.floor(Math.round(seq.width * factor) / 2) * 2;
    let h = Math.floor(Math.round(seq.height * factor) / 2) * 2;
    if (w < 2) w = 2;
    if (h < 2) h = 2;
    return { w, h };
  };

  // Open Target Handler (Folder, Multi-Folder Batch, or Single File)
  const handleOpenTarget = async (
    target:
      | {
          path: string;
          paths?: string[];
          autoStart?: boolean;
          format?: 'mov' | 'mp4' | 'jpg';
          mode?: 'sequence' | 'individual';
          openComparison?: boolean;
        }
      | string
      | null
  ) => {
    if (!target) return;
    const isObj = typeof target === 'object' && target !== null;
    const rawPaths = isObj && target.paths && target.paths.length > 0 ? target.paths : [typeof target === 'string' ? target : target.path];
    const targetPaths = rawPaths.filter((p) => Boolean(p && typeof p === 'string'));
    const targetPath = targetPaths[0];
    const shouldAutoStart = isObj ? Boolean(target.autoStart) : false;
    const formatOverride = isObj ? target.format : undefined;
    const modeOverride = isObj ? target.mode : undefined;

    // Direct Right-Click Compare Launch
    if (isObj && (target as any).openComparison) {
      if (targetPaths.length >= 2) {
        setComparisonSourceDir(targetPaths[0]);
        setComparisonTargetDir(targetPaths[1]);
      } else if (targetPaths.length === 1 && targetPaths[0]) {
        setComparisonSourceDir(targetPaths[0]);
      }
      setIsFolderComparisonOpen(true);
      return;
    }

    if (!targetPath) return;

    // Deduplicate rapid duplicate events for same path
    const now = Date.now();
    if (lastTargetRef.current && lastTargetRef.current.path === targetPath && now - lastTargetRef.current.time < 1500) {
      return;
    }
    lastTargetRef.current = { path: targetPath, time: now };

    // Fetch fresh saved settings from disk so right-click always honors any saved user configurations!
    let activeSettings = settings;
    try {
      const saved = await window.electronAPI.getSettings();
      if (saved) {
        activeSettings = { ...activeSettings, ...saved };
      }
    } catch (e) {}

    // Apply format & mode overrides
    if (formatOverride) {
      activeSettings.outputFormat = formatOverride;
    }

    if (activeSettings.outputFormat === 'mov') {
      activeSettings.codec = 'h264';
      activeSettings.bitrateMbps = 40;
      activeSettings.bitrateMode = 'cbr';
      activeSettings.conversionMode = 'sequence'; // MOV always merges into 1 video file per specification
    } else if (activeSettings.outputFormat === 'jpg') {
      activeSettings.jpegQuality = activeSettings.jpegQuality || 8;
      activeSettings.jpegFormatOption = activeSettings.jpegFormatOption || 'baseline';
      activeSettings.conversionMode = 'individual';
    } else if (modeOverride) {
      activeSettings.conversionMode = modeOverride;
    }

    setSettings(activeSettings);

    // Multi-folder batch conversion from right-click context menu
    if (shouldAutoStart && targetPaths.length > 1) {
      setScreenState('converting');
      let totalConvertedFrames = 0;
      let totalFoldersProcessed = 0;
      let totalMissingGaps = 0;

      for (const folder of targetPaths) {
        const isExr = folder.toLowerCase().endsWith('.exr');
        try {
          const scanRes = await window.electronAPI.scanFolder(folder, false);
          if (!scanRes || scanRes.sequences.length === 0) continue;

          for (const seq of scanRes.sequences) {
            // Check missing frames / gap audit
            try {
              const gapReport = await window.electronAPI.compareFrames(seq);
              if (gapReport && gapReport.missingCount > 0) {
                totalMissingGaps += gapReport.missingCount;
                await window.electronAPI.saveMissingReport(seq.folderPath, gapReport);
              }
            } catch (err) {
              console.error('Gap audit error:', err);
            }

            const dims = updateResolution(seq, activeSettings.scalePercent || 50);
            const baseDir = scanRes.folderPath || (isExr ? folder.replace(/[/\\][^/\\]+$/, '') : folder);
            const outDir = activeSettings.createSubfolder !== false
              ? getSiblingOutputDir(baseDir, activeSettings.outputFormat)
              : baseDir;
            let outName = `${seq.sequenceName}.${activeSettings.outputFormat}`;

            // Check collision
            try {
              const collision = await window.electronAPI.checkFileCollision(
                outDir,
                seq.sequenceName,
                activeSettings.outputFormat
              );
              if (collision?.collision && collision.suggestedNewPath) {
                outName = collision.suggestedNewPath.split(/[/\\]/).pop() || outName;
              }
            } catch (e) {}

            await executeConversion(
              outName,
              activeSettings.conversionMode,
              seq,
              outDir,
              {
                ...activeSettings,
                outputFolder: outDir,
                outputFileName: outName,
                targetWidth: dims.w,
                targetHeight: dims.h,
              }
            );

            totalConvertedFrames += seq.frameCount;
          }
          totalFoldersProcessed++;
        } catch (err) {
          console.error(`Error processing batch folder ${folder}:`, err);
        }
      }

      // Notify completion
      try {
        const gapInfo = totalMissingGaps > 0 ? ` ⚠️ ${totalMissingGaps} missing frame(s) detected. Reports saved.` : '';
        const msg = `Batch complete: ${totalConvertedFrames} frames across ${totalFoldersProcessed} folders converted to ${activeSettings.outputFormat.toUpperCase()}.${gapInfo}`;
        window.electronAPI.notifyCompletion('EXR Batch Conversion Complete', msg);
      } catch (e) {}
      return;
    }

    // Single folder or single EXR file target: scan folder to detect full sequence
    const isExrFile = targetPath.toLowerCase().endsWith('.exr');
    const scanned = await handleScanFolder(targetPath, false, activeSettings.outputFormat);

    if (shouldAutoStart && scanned && scanned.firstSeq) {
      const seq = scanned.firstSeq;
      const outDir = scanned.outFolder;
      let outName = `${seq.sequenceName}.${activeSettings.outputFormat}`;

      // Check missing frames / gap audit
      let gapNotice = '';
      try {
        const gapReport = await window.electronAPI.compareFrames(seq);
        if (gapReport && gapReport.missingCount > 0) {
          await window.electronAPI.saveMissingReport(outDir, gapReport);
          gapNotice = ` ⚠️ ${gapReport.missingCount} missing frames detected (expected start ${gapReport.expectedStartFrame})! Report saved in folder.`;
        }
      } catch (e) {
        console.error('Gap audit error in single autoStart:', e);
      }

      // Automatically handle collision if file already exists
      try {
        const collision = await window.electronAPI.checkFileCollision(
          outDir,
          seq.sequenceName,
          activeSettings.outputFormat
        );
        if (collision?.collision && collision.suggestedNewPath) {
          outName = collision.suggestedNewPath.split(/[/\\]/).pop() || outName;
        }
      } catch (e) {
        console.error('Collision check error in autoStart:', e);
      }

      await executeConversion(outName, activeSettings.conversionMode, seq, outDir, activeSettings);

      // Trigger native desktop notification for background completion
      try {
        const count = activeSettings.conversionMode === 'individual' || activeSettings.outputFormat === 'jpg' ? seq.frameCount : 1;
        const msg = activeSettings.outputFormat === 'mov'
          ? `Merged ${seq.frameCount} frames into 1 MOV video (40 Mbps CBR) in ${outDir.split(/[/\\]/).pop()}`
          : activeSettings.outputFormat === 'jpg'
          ? `Converted ${count} frame${count > 1 ? 's' : ''} to JPEG (Quality ${activeSettings.jpegQuality || 8}) in ${outDir.split(/[/\\]/).pop()}`
          : `Converted sequence (${seq.frameCount} frames) to MP4 in ${outDir.split(/[/\\]/).pop()}`;
        window.electronAPI.notifyCompletion('EXR Conversion Complete', `${msg}.${gapNotice}`);
      } catch (e) {}
    }
  };

  // Directory & Files Scanner Handler
  const handleScanFolder = async (
    folderPath: string | string[],
    singleFileOnly: boolean = false,
    targetFormat?: 'mov' | 'jpg' | 'mp4'
  ) => {
    setIsScanning(true);
    try {
      const result = await window.electronAPI.scanFolder(folderPath, singleFileOnly);

      if (result.sequences.length > 0) {
        const rawFirst = Array.isArray(folderPath) ? folderPath[0] : folderPath;
        let defaultOutFolder = result.folderPath;
        if (!defaultOutFolder) {
          defaultOutFolder = rawFirst.toLowerCase().endsWith('.exr')
            ? rawFirst.replace(/[/\\][^/\\]+$/, '')
            : rawFirst;
        }

        setInputFolder(defaultOutFolder);
        setDetectedSequences(result.sequences);
        const firstSeq = result.sequences[0];
        setSelectedSequence(firstSeq);

        const isVideoInput =
          firstSeq.extension === '.mov' ||
          firstSeq.extension === '.mp4' ||
          firstSeq.extension === 'mov' ||
          firstSeq.extension === 'mp4';
        const activeFmt = targetFormat || (isVideoInput ? 'jpg' : (settings.outputFormat || 'mov'));
        const activeMode = isVideoInput ? 'individual' : (activeFmt === 'jpg' ? 'individual' : (settings.conversionMode || 'sequence'));

        const initialOutFolder = settings.createSubfolder !== false
          ? getSiblingOutputDir(defaultOutFolder, activeFmt)
          : defaultOutFolder;

        setOutputFolder(initialOutFolder);
        const fileName = `${firstSeq.sequenceName}.${activeFmt}`;
        setOutputFileName(fileName);

        const dims = updateResolution(firstSeq, settings.scalePercent);

        setSettings((prev) => ({
          ...prev,
          outputFormat: activeFmt,
          conversionMode: activeMode,
          outputFolder: initialOutFolder,
          outputFileName: fileName,
          targetWidth: dims.w,
          targetHeight: dims.h,
        }));

        setScreenState('ready');

        // Check file collisions & disk space
        checkCollisionAndDiskSpace(initialOutFolder, fileName, firstSeq, dims.w, dims.h);

        // Generate thumbnail in background
        setIsGeneratingThumbnail(true);
        window.electronAPI
          .generateThumbnail(firstSeq.firstFramePath)
          .then((thumb) => {
            if (thumb) {
              setSelectedSequence((prev) => (prev ? { ...prev, thumbnailDataUrl: thumb } : null));
              setDetectedSequences((prev) =>
                prev.map((s) => (s.id === firstSeq.id ? { ...s, thumbnailDataUrl: thumb } : s))
              );
            }
          })
          .finally(() => setIsGeneratingThumbnail(false));

        return {
          sequences: result.sequences,
          firstSeq,
          outFolder: initialOutFolder,
          fileName,
        };
      } else {
        alert('No image sequence or video detected in the chosen folder or files.');
        return null;
      }
    } catch (err: any) {
      alert(`Error scanning directory: ${err.message}`);
      return null;
    } finally {
      setIsScanning(false);
    }
  };

  const checkCollisionAndDiskSpace = async (
    outFolder: string,
    fileName: string,
    seq: ExrSequence,
    w: number,
    h: number
  ) => {
    if (!window.electronAPI || !outFolder) return;
    try {
      const collision = await window.electronAPI.checkFileCollision(
        outFolder,
        seq.sequenceName,
        settings.outputFormat
      );
      setCollisionInfo(collision);

      const disk = await window.electronAPI.checkDiskSpace(
        outFolder,
        seq.frameCount,
        settings.fps,
        w,
        h
      );
      setDiskSpaceInfo(disk);
    } catch (e) {
      console.error(e);
    }
  };

  // Folder Pickers
  const handleSelectInputFolder = async () => {
    const selected = await window.electronAPI.selectInputFolder();
    if (selected) {
      handleScanFolder(selected, false, settings.outputFormat);
    }
  };

  const handleSelectOutputFolder = async () => {
    const selected = await window.electronAPI.selectOutputFolder(outputFolder);
    if (selected) {
      setOutputFolder(selected);
      setSettings((prev) => ({ ...prev, outputFolder: selected }));
      if (selectedSequence) {
        checkCollisionAndDiskSpace(
          selected,
          outputFileName,
          selectedSequence,
          settings.targetWidth,
          settings.targetHeight
        );
      }
    }
  };


  // Conversion Execution Trigger
  const handleStartConversion = async (bypassMissingCheck = false) => {
    if (!selectedSequence) return;

    // Check missing frames
    if (selectedSequence.hasMissingFrames && !bypassMissingCheck) {
      setIsGapScannerOpen(true);
      return;
    }

    // Check file collision
    if (collisionInfo?.collision) {
      setIsCollisionOpen(true);
      return;
    }

    executeConversion(outputFileName);
  };

  const handleConvertAll = async () => {
    if (detectedSequences.length === 0) return;
    setScreenState('converting');
    try {
      let firstJob: ConversionJob | null = null;
      for (const seq of detectedSequences) {
        const dims = updateResolution(seq, settings.scalePercent);
        const fileName = `${seq.sequenceName}.${settings.outputFormat}`;
        const seqSettings: ConversionSettings = {
          ...settings,
          outputFolder,
          outputFileName: fileName,
          targetWidth: dims.w,
          targetHeight: dims.h,
        };
        const job = await window.electronAPI.startConversion(seq, seqSettings);
        if (!firstJob) {
          firstJob = job;
          setCurrentJob(job);
        }
      }
    } catch (err: any) {
      console.error(err);
      setScreenState('failed');
    }
  };

  const executeConversion = async (
    finalFileName: string,
    modeOverride?: 'sequence' | 'individual' | 'both',
    seqOverride?: ExrSequence,
    outFolderOverride?: string,
    settingsOverride?: ConversionSettings
  ) => {
    const seq = seqOverride || selectedSequence;
    if (!seq) {
      console.error('executeConversion called without active sequence');
      return;
    }

    const currentCfg = settingsOverride || settings;
    let baseOutFolder = outFolderOverride || outputFolder || currentCfg.outputFolder || seq.folderPath;
    
    // Normalize format-specific folder tags to prevent cross-contamination
    if (currentCfg.outputFormat === 'jpg' || (currentCfg.outputFormat as string) === 'jpeg') {
      baseOutFolder = baseOutFolder.replace(/_MOV$/i, '_JPEG').replace(/[/\\]MOV$/i, '/JPEG');
    } else if (currentCfg.outputFormat === 'mov') {
      baseOutFolder = baseOutFolder.replace(/_JPEG$/i, '_MOV').replace(/[/\\]JPEG$/i, '/MOV');
    }

    // Ensure output folder is outside the sequence folder so original EXR folder is never polluted
    const cleanSeqDir = seq.folderPath.replace(/[/\\]+$/, '');
    const cleanBaseOut = baseOutFolder.replace(/[/\\]+$/, '');
    if (!cleanBaseOut || cleanBaseOut === cleanSeqDir || cleanBaseOut.startsWith(cleanSeqDir + '/') || cleanBaseOut.startsWith(cleanSeqDir + '\\')) {
      baseOutFolder = getSiblingOutputDir(cleanSeqDir, currentCfg.outputFormat);
    }
    const effectiveOutFolder = baseOutFolder;
    setComparisonSourceDir(seq.folderPath);
    setComparisonTargetDir(effectiveOutFolder);
    setScreenState('converting');

    const finalizeAndCompare = async () => {
      try {
        const comp = await window.electronAPI.compareFolders(seq.folderPath, effectiveOutFolder, 1001);
        if (comp) {
          await window.electronAPI.saveFolderComparisonReport(effectiveOutFolder, comp);
        }
      } catch (compErr) {
        console.error('Auto folder comparison error:', compErr);
      }
    };

    try {
      // 1. QuickTime MOV: ALWAYS merge all frames into 1 single video file (per user request)
      if (currentCfg.outputFormat === 'mov') {
        const cleanName = finalFileName.endsWith('.mov') ? finalFileName : `${finalFileName.replace(/\.[^/.]+$/, '')}.mov`;
        const movSettings: ConversionSettings = {
          ...currentCfg,
          outputFolder: effectiveOutFolder,
          outputFileName: cleanName,
          outputFormat: 'mov',
          codec: 'h264',
          bitrateMbps: currentCfg.bitrateMbps || 40,
          bitrateMode: 'cbr',
          conversionMode: 'sequence',
        };

        const job = await window.electronAPI.startConversion(seq, movSettings);
        setCurrentJob(job);
        await window.electronAPI.waitForJob(job.id);
        await finalizeAndCompare();
        return;
      }

      // 2. JPEG: Convert EXR sequence into matching JPEG sequence (via master pipeline for 100% color/frame parity)
      if (currentCfg.outputFormat === 'jpg' || (currentCfg.outputFormat as string) === 'jpeg') {
        const cleanPattern = seq.pattern.replace(/\.[^/.]+$/, '.jpg');
        const jpegSettings: ConversionSettings = {
          ...currentCfg,
          outputFolder: effectiveOutFolder,
          outputFileName: cleanPattern,
          outputFormat: 'jpg',
          conversionMode: 'sequence',
          jpegQuality: currentCfg.jpegQuality || 8,
          jpegFormatOption: currentCfg.jpegFormatOption || 'baseline',
        };

        const job = await window.electronAPI.startConversion(seq, jpegSettings);
        setCurrentJob(job);
        await window.electronAPI.waitForJob(job.id);
        await finalizeAndCompare();
        return;
      }

      // 3. MP4 (or other video format): Support individual or sequence mode
      const targetMode = modeOverride || currentCfg.conversionMode || 'individual';
      if (targetMode === 'individual' || targetMode === 'both') {
        let firstJob: ConversionJob | null = null;

        if (targetMode === 'both') {
          // First create combined sequence video
          const seqSettings: ConversionSettings = {
            ...currentCfg,
            outputFolder: effectiveOutFolder,
            outputFileName: finalFileName,
          };
          firstJob = await window.electronAPI.startConversion(seq, seqSettings);
          setCurrentJob(firstJob);
        }

        const launchedJobIds: string[] = [];
        if (firstJob) launchedJobIds.push(firstJob.id);

        // Then create individual frame videos
        for (let i = 0; i < seq.frames.length; i++) {
          const framePath = seq.frames[i];
          const fileNameWithoutExt = framePath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') || `frame_${i + 1}`;
          const outName = `${fileNameWithoutExt}.${currentCfg.outputFormat}`;

          const singleSeq: ExrSequence = {
            ...seq,
            id: `single_${fileNameWithoutExt}_${Date.now()}_${i}`,
            sequenceName: fileNameWithoutExt,
            firstFramePath: framePath,
            frameCount: 1,
            firstFrame: 1,
            lastFrame: 1,
            pattern: framePath.split(/[/\\]/).pop() || '',
            frames: [framePath],
          };

          const singleSettings: ConversionSettings = {
            ...currentCfg,
            outputFolder: effectiveOutFolder,
            outputFileName: outName,
            conversionMode: 'individual',
          };

          const job = await window.electronAPI.startConversion(singleSeq, singleSettings);
          launchedJobIds.push(job.id);
          if (!firstJob) {
            firstJob = job;
            setCurrentJob(job);
          }
        }

        // Await all frame conversion jobs to complete
        for (const jid of launchedJobIds) {
          await window.electronAPI.waitForJob(jid);
        }
        await finalizeAndCompare();
        return;
      }

      const currentSettings: ConversionSettings = {
        ...currentCfg,
        outputFolder: effectiveOutFolder,
        outputFileName: finalFileName,
      };

      const job = await window.electronAPI.startConversion(seq, currentSettings);
      setCurrentJob(job);
      await window.electronAPI.waitForJob(job.id);
      await finalizeAndCompare();
    } catch (err: any) {
      console.error(err);
      setScreenState('failed');
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text flex flex-col font-sans">
      {/* Header */}
      <Header
        hardwareInfo={hardwareInfo}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLogs={() => setIsLogsOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        queueCount={jobsQueue.length}
        onToggleQueue={() => setIsQueueOpen(!isQueueOpen)}
        isQueueOpen={isQueueOpen}
        onOpenFolderComparison={() => {
          setComparisonSourceDir(selectedSequence?.folderPath || inputFolder || '');
          setComparisonTargetDir(outputFolder || '');
          setIsFolderComparisonOpen(true);
        }}
      />

      {/* Main Workspace Stage */}
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col justify-center">
        {screenState === 'empty' && (
          <DropZone
            onSelectFolder={handleSelectInputFolder}
            onDropPath={(p) => handleScanFolder(p, false, settings.outputFormat)}
            isScanning={isScanning}
          />
        )}

        {screenState === 'ready' && selectedSequence && (
          <div className="space-y-4 animate-fadeIn">
            {/* Input Sequence Card */}
            <SequenceCard
              sequence={selectedSequence}
              allSequences={detectedSequences}
              onSelectSequence={(seq) => {
                setSelectedSequence(seq);
                const fileName = `${seq.sequenceName}.${settings.outputFormat}`;
                setOutputFileName(fileName);
                const dims = updateResolution(seq, settings.scalePercent);
                setSettings((p) => ({ ...p, targetWidth: dims.w, targetHeight: dims.h, outputFileName: fileName }));
                checkCollisionAndDiskSpace(outputFolder, fileName, seq, dims.w, dims.h);
              }}
              onSelectAnotherFolder={handleSelectInputFolder}
              onOpenMissingFramesModal={() => setIsGapScannerOpen(true)}
              isGeneratingThumbnail={isGeneratingThumbnail}
            />

            {/* Output Destination Picker */}
            <OutputFolderPicker
              outputFolder={outputFolder}
              outputFileName={outputFileName}
              onSelectOutputFolder={handleSelectOutputFolder}
              diskSpaceInfo={diskSpaceInfo}
              hasCollision={collisionInfo?.collision || false}
            />

            {/* Output Settings Card */}
            <SettingsCard
              settings={settings}
              sequence={selectedSequence}
              hardwareInfo={hardwareInfo}
              onUpdateSettings={handleUpdateSettings}
              onOpenGapScanner={() => setIsGapScannerOpen(true)}
            />

            {/* Minimal Action Toolbar */}
            <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
              <div className="flex items-center space-x-2 text-xs text-studio-textMuted font-mono">
                <span className="text-studio-accent font-semibold uppercase">
                  {settings.outputFormat === 'mov'
                    ? 'QuickTime MOV (40Mbps CBR • 1 Merged Video)'
                    : `JPEG Frames (Quality ${settings.jpegQuality || 8})`}
                </span>
                <span>•</span>
                <span>
                  {settings.targetWidth} × {settings.targetHeight} ({settings.scalePercent}%) @ {settings.fps} FPS
                </span>
              </div>

              <div className="flex items-center space-x-2.5 flex-wrap">
                {/* Format 1: QuickTime MOV (Always Merged into 1 single video) */}
                {settings.outputFormat === 'mov' && (
                  <>
                    <button
                      onClick={() => {
                        setSettings((p) => ({ ...p, conversionMode: 'sequence' }));
                        executeConversion(outputFileName, 'sequence');
                      }}
                      className="studio-button-primary px-6 py-2.5 text-xs font-semibold flex items-center space-x-2 shadow-glow-accent cursor-pointer rounded-xl"
                      title={`Merges all ${selectedSequence.frameCount} frames into 1 QuickTime MOV file at 40 Mbps CBR`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Convert to MOV (Single Video • 40 Mbps)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setComparisonSourceDir(selectedSequence.folderPath);
                        setComparisonTargetDir(outputFolder);
                        setIsFolderComparisonOpen(true);
                      }}
                      className="studio-button-secondary px-3.5 py-2.5 text-xs font-semibold flex items-center space-x-1.5 border-studio-border text-studio-textSecondary hover:text-studio-text cursor-pointer font-mono rounded-xl"
                      title="Compare source EXR folder with converted MOV folder"
                    >
                      <FolderCheck className="w-3.5 h-3.5 text-studio-accent" />
                      <span>Compare Folders</span>
                    </button>
                  </>
                )}

                {/* Format 2: JPEG Frames Export */}
                {settings.outputFormat === 'jpg' && (
                  <>
                    <button
                      onClick={() => {
                        setSettings((p) => ({ ...p, conversionMode: 'individual' }));
                        executeConversion(outputFileName, 'individual');
                      }}
                      className="studio-button-primary px-6 py-2.5 text-xs font-semibold flex items-center space-x-2 shadow-glow-accent cursor-pointer rounded-xl"
                      title={`Converts all ${selectedSequence.frameCount} EXR frames into JPEG files (Quality ${settings.jpegQuality || 8})`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Convert All Frames to JPEG</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setComparisonSourceDir(selectedSequence.folderPath);
                        setComparisonTargetDir(outputFolder);
                        setIsFolderComparisonOpen(true);
                      }}
                      className="studio-button-secondary px-3.5 py-2.5 text-xs font-semibold flex items-center space-x-1.5 border-studio-border text-studio-textSecondary hover:text-studio-text cursor-pointer font-mono rounded-xl"
                      title="Compare source EXR folder with converted JPEG folder"
                    >
                      <FolderCheck className="w-3.5 h-3.5 text-studio-accent" />
                      <span>Compare Folders</span>
                    </button>
                  </>
                )}

                {/* Multi-shot batch conversion button */}
                {detectedSequences.length > 1 && (
                  <button
                    onClick={handleConvertAll}
                    className="studio-button-secondary px-3.5 py-2.5 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer text-studio-textSecondary hover:text-studio-text rounded-xl"
                    title="Queue and convert all detected shots"
                  >
                    <Layers className="w-3.5 h-3.5 text-studio-accent" />
                    <span>All {detectedSequences.length} Shots</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {screenState === 'converting' && currentJob && (
          <div className="py-8 animate-fadeIn">
            <ProgressCard
              job={currentJob}
              onPause={() => window.electronAPI.pauseConversion(currentJob.id)}
              onResume={() => window.electronAPI.resumeConversion(currentJob.id)}
              onCancel={() => setIsCancelModalOpen(true)}
            />
          </div>
        )}

        {screenState === 'completed' && currentJob && (
          <div className="py-8 animate-fadeIn">
            <CompletionCard
              job={currentJob}
              onOpenVideo={() => window.electronAPI.openVideo(currentJob.outputPath)}
              onOpenFolder={() => window.electronAPI.revealInFolder(currentJob.outputPath)}
              onOpenSourceFolder={() => window.electronAPI.revealInFolder(currentJob.inputFolder)}
              onCompareFolders={() => {
                setComparisonSourceDir(currentJob.inputFolder);
                const targetDir = currentJob.outputFolder || currentJob.outputPath.replace(/[/\\][^/\\]+$/, '');
                setComparisonTargetDir(targetDir);
                setIsFolderComparisonOpen(true);
              }}
              onConvertAnother={() => {
                setScreenState('ready');
                setCurrentJob(null);
              }}
            />
          </div>
        )}

        {screenState === 'failed' && currentJob && (
          <div className="py-8 animate-fadeIn">
            <ErrorCard
              errorMessage={currentJob.error}
              onRetry={() => handleStartConversion(true)}
              onOpenLogs={() => setIsLogsOpen(true)}
              onDismiss={() => setScreenState('ready')}
            />
          </div>
        )}
      </main>

      {/* Modals & Drawers */}
      <MissingFramesModal
        sequenceName={selectedSequence?.sequenceName || ''}
        missingFrames={selectedSequence?.missingFrames || []}
        firstFrame={selectedSequence?.firstFrame || 0}
        lastFrame={selectedSequence?.lastFrame || 0}
        isOpen={isMissingFramesOpen}
        onClose={() => setIsMissingFramesOpen(false)}
        onProceedAnyway={() => {
          setIsMissingFramesOpen(false);
          handleStartConversion(true);
        }}
      />

      <MissingFrameScannerModal
        sequence={selectedSequence}
        isOpen={isGapScannerOpen}
        onClose={() => setIsGapScannerOpen(false)}
        onProceedAnyway={() => {
          setIsGapScannerOpen(false);
          handleStartConversion(true);
        }}
      />

      <CollisionModal
        fileName={outputFileName}
        suggestedNewName={
          collisionInfo?.suggestedNewPath
            ? collisionInfo.suggestedNewPath.split(/[/\\]/).pop() || ''
            : ''
        }
        isOpen={isCollisionOpen}
        onClose={() => setIsCollisionOpen(false)}
        onReplace={() => {
          setIsCollisionOpen(false);
          executeConversion(outputFileName);
        }}
        onCreateNew={() => {
          setIsCollisionOpen(false);
          if (collisionInfo?.suggestedNewPath) {
            const newName = collisionInfo.suggestedNewPath.split(/[/\\]/).pop() || outputFileName;
            setOutputFileName(newName);
            executeConversion(newName);
          }
        }}
      />

      <CancelModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirmCancel={() => {
          setIsCancelModalOpen(false);
          if (currentJob) {
            window.electronAPI.cancelConversion(currentJob.id, true);
          }
        }}
      />

      <LogViewerModal
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
        logs={logs}
        onOpenLogFolder={() => window.electronAPI.openLogFolder()}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        hardwareInfo={hardwareInfo}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        jobs={jobsQueue}
        onCancelJob={(jobId) => window.electronAPI.cancelConversion(jobId, true)}
        onClearHistory={() => {
          window.electronAPI.clearHistory().then(() => setJobsQueue([])).catch(console.error);
        }}
        onSelectJob={(job) => {
          setCurrentJob(job);
          if (job.status === 'converting') setScreenState('converting');
          else if (job.status === 'completed') setScreenState('completed');
          else if (job.status === 'failed') setScreenState('failed');
          setIsQueueOpen(false);
        }}
      />

      <FolderComparisonModal
        isOpen={isFolderComparisonOpen}
        onClose={() => setIsFolderComparisonOpen(false)}
        defaultSourceDir={comparisonSourceDir || selectedSequence?.folderPath || inputFolder || ''}
        defaultTargetDir={comparisonTargetDir || outputFolder || ''}
        defaultExpectedStart={settings.expectedStartFrame || 1001}
      />
    </div>
  );
}

export { App };

