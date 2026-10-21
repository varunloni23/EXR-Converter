import { app, BrowserWindow, ipcMain, protocol, net, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { logger } from './services/logger';
import { hardwareDetector } from './services/hardwareDetector';
import { sequenceDetector } from './services/sequenceDetector';
import { thumbnailService } from './services/thumbnailService';
import { ffmpegService } from './services/ffmpegService';
import { fileService } from './services/fileService';
import { conversionManager } from './services/conversionManager';
import { settingsService } from './services/settingsService';
import { historyService } from './services/historyService';
import { updateService } from './services/updateService';
import { trayService } from './services/trayService';
import { ConversionSettings, ExrSequence, FrameComparisonReport, FolderComparisonResult } from '../shared/types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.exrconverter.app');
}

export interface LaunchTarget {
  path: string;
  paths?: string[];
  autoStart: boolean;
  format?: 'mov' | 'jpg' | 'mp4';
  mode?: 'sequence' | 'individual';
  openComparison?: boolean;
}

function parseLaunchArgs(argv: string[]): LaunchTarget | null {
  const paths: string[] = [];
  let format: 'mov' | 'jpg' | 'mp4' | undefined;
  let mode: 'sequence' | 'individual' | undefined;
  const isCompare = argv.includes('--compare') || argv.includes('-c');

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--format' || arg === '-f') && i + 1 < argv.length) {
      const f = argv[i + 1].toLowerCase();
      if (f === 'mov' || f === 'jpg' || f === 'jpeg' || f === 'mp4') {
        format = (f === 'jpeg' ? 'jpg' : f) as 'mov' | 'jpg' | 'mp4';
      }
      i++;
      continue;
    }
    if (arg.startsWith('--format=')) {
      const f = arg.split('=')[1]?.toLowerCase();
      if (f === 'mov' || f === 'jpg' || f === 'jpeg' || f === 'mp4') {
        format = (f === 'jpeg' ? 'jpg' : f) as 'mov' | 'jpg' | 'mp4';
      }
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      const m = argv[i + 1].toLowerCase();
      if (m === 'sequence' || m === 'individual') {
        mode = m as any;
      }
      i++;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      const m = arg.split('=')[1]?.toLowerCase();
      if (m === 'sequence' || m === 'individual') {
        mode = m as any;
      }
      continue;
    }
    if (!arg || arg.startsWith('-')) continue;
    if (arg === '.' || arg === 'electron' || arg.endsWith('.js') || arg.endsWith('.ts') || arg.endsWith('EXR Converter') || arg.endsWith('EXR Converter.exe')) continue;
    try {
      if (fs.existsSync(arg)) {
        paths.push(path.resolve(arg));
      }
    } catch (e) {}
  }

  if (isCompare) {
    return {
      path: paths[0] || '',
      paths,
      autoStart: false,
      openComparison: true,
    };
  }

  if (paths.length === 0) return null;
  return {
    path: paths[0],
    paths,
    autoStart: true,
    format,
    mode,
  };
}

let initialTarget: LaunchTarget | null = null;
let isRendererReady = false;

const parsedTarget = parseLaunchArgs(process.argv);
const isCompareLaunch = process.argv.includes('--compare') || process.argv.includes('-c');
const isBackgroundLaunch = false; // Always show window so user sees conversion progress

if (parsedTarget) {
  initialTarget = parsedTarget;
}

function dispatchOpenPath(target: LaunchTarget) {
  initialTarget = target;
  if (mainWindow && !mainWindow.isDestroyed() && isRendererReady) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    logger.info(`Dispatching app:openPath to renderer: ${target.path} (format=${target.format || 'default'}, mode=${target.mode || 'default'}, compare=${Boolean(target.openComparison)})`);
    mainWindow.webContents.send('app:openPath', target);
    initialTarget = null;
  } else {
    logger.info(`Queued initialTarget for renderer initialization: ${target.path} (autoStart=${target.autoStart}, compare=${Boolean(target.openComparison)})`);
  }
}

const gotTheLock = app.requestSingleInstanceLock({ argv: process.argv });
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_, commandLine, __, additionalData: any) => {
    const rawArgs = (additionalData && Array.isArray(additionalData.argv)) ? additionalData.argv : commandLine;
    const isCompare = rawArgs.includes('--compare') || rawArgs.includes('-c');
    const parsed = parseLaunchArgs(rawArgs);
    if (parsed) {
      if (isCompare) {
        parsed.openComparison = true;
        parsed.autoStart = false;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      logger.info(`Received context-menu launch from second instance: ${parsed.path} (format=${parsed.format || 'default'}, mode=${parsed.mode || 'default'}, compare=${Boolean(parsed.openComparison)})`);
      dispatchOpenPath(parsed);
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  logger.info(`Received open-file event: ${filePath}`);
  dispatchOpenPath({ path: filePath, autoStart: true });
});

let mainWindow: BrowserWindow | null = null;

function createWindow(forceShow: boolean = false) {
  const shouldShow = forceShow || !isBackgroundLaunch;
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0B0D10',
    title: 'EXR Converter',
    show: shouldShow,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  conversionManager.setMainWindow(mainWindow);
  updateService.setWindow(mainWindow);
  trayService.setMainWindow(mainWindow);

  // Close to tray on Windows and Mac unless explicitly quitting
  mainWindow.on('close', (event) => {
    if (!trayService.getIsQuitting()) {
      event.preventDefault();
      mainWindow?.hide();
      trayService.showBalloonOnce();
    }
  });

  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error(`[PRELOAD ERROR] at ${preloadPath}:`, error);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE] ${message}`);
  });

  // Stream logs to renderer in real-time
  logger.subscribe((entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log:entry', entry);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    isRendererReady = true;
    if (app.isPackaged) {
      setTimeout(() => {
        updateService.checkForUpdates(false).catch((err) => logger.warn(`Background update check error: ${err}`));
      }, 4000);
    }
  });

  // Load URL
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    isRendererReady = false;
    conversionManager.setMainWindow(null);
  });
}

app.whenReady().then(() => {
  logger.init();

  protocol.handle('media', (request) => {
    try {
      let filePath = decodeURIComponent(request.url.slice('media://'.length));
      if (process.platform === 'win32') {
        filePath = filePath.replace(/^\//, '').replace(/\\/g, '/');
        const fileUrl = filePath.startsWith('file:///') ? filePath : `file:///${filePath}`;
        return net.fetch(fileUrl);
      } else {
        if (!filePath.startsWith('/')) filePath = '/' + filePath;
        return net.fetch(`file://${filePath}`);
      }
    } catch (err) {
      logger.error(`Media protocol error: ${err}`);
      return new Response('File not found', { status: 404 });
    }
  });

  registerIpcHandlers();
  createWindow();
  trayService.init();
  if (mainWindow) {
    trayService.setMainWindow(mainWindow);
  }

  // Periodic 15-minute background update check
  setInterval(() => {
    if (app.isPackaged) {
      logger.info('[AutoUpdater] 15-minute periodic check running...');
      updateService.checkForUpdates(false).catch((err) => logger.warn(`15min periodic update check error: ${err}`));
    }
  }, 15 * 60 * 1000);

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow(true);
    }
  });
});

app.on('before-quit', () => {
  trayService.setIsQuitting(true);
});

app.on('window-all-closed', () => {
  if (trayService.getIsQuitting()) {
    app.quit();
  }
});

function registerIpcHandlers() {
  // App Version
  ipcMain.handle('app:getVersion', () => app.getVersion());

  // 0. Initial Launch Target (from right-click context menu or file open)
  ipcMain.handle('app:getInitialPath', async () => {
    isRendererReady = true;
    const t = initialTarget;
    initialTarget = null;
    logger.info(`Renderer requested initialPath: ${t ? t.path : 'none'}`);
    return t;
  });

  // 1. Folder Selection Dialogs
  ipcMain.handle('dialog:selectInputFolder', async () => {
    return fileService.selectDirectory(mainWindow, 'Select EXR Sequence Folder');
  });

  ipcMain.handle('dialog:selectOutputFolder', async (_, defaultPath) => {
    return fileService.selectDirectory(mainWindow, 'Choose Video Output Folder', defaultPath);
  });

  // 2. Sequence Detection & Frame Gap Analysis
  ipcMain.handle('sequence:scan', async (_, input: string | string[], singleFileOnly?: boolean) => {
    return sequenceDetector.scanDirectory(input, ffmpegService.getFfprobePath(), true, singleFileOnly);
  });

  ipcMain.handle(
    'sequence:compareFrames',
    async (_, sequence: ExrSequence, customStart?: number, customEnd?: number) => {
      return sequenceDetector.compareExpectedFrames(sequence, customStart, customEnd);
    }
  );

  ipcMain.handle(
    'sequence:saveMissingReport',
    async (_, folderPath: string, report: FrameComparisonReport) => {
      try {
        const reportPath = path.join(folderPath, '_MISSING_FRAMES_REPORT.txt');
        const content = [
          `==================================================`,
          `🎬 EXR CONVERTER - MISSING FRAMES AUDIT REPORT`,
          `==================================================`,
          `Sequence Name: ${report.sequenceName}`,
          `Folder Path:   ${report.folderPath}`,
          `Date/Time:     ${new Date().toLocaleString()}`,
          ``,
          `Expected Range: Frame ${report.expectedStartFrame} → Frame ${report.expectedEndFrame}`,
          `Total Expected: ${report.expectedCount} frames`,
          `Total Found:    ${report.foundCount} frames`,
          `Total Missing:  ${report.missingCount} frames`,
          `Status:         ${report.isComplete ? 'COMPLETE (No missing frames)' : 'INCOMPLETE (Action Required)'}`,
          ``,
          ...(report.missingHeadFrames.length > 0
            ? [`Missing Head Frames (${report.missingHeadFrames.length}):`, `  Frames: ${report.missingHeadFrames.join(', ')}`, ``]
            : []),
          ...(report.missingMiddleFrames.length > 0
            ? [`Missing Middle Frames (${report.missingMiddleFrames.length}):`, `  Frames: ${report.missingMiddleFrames.join(', ')}`, ``]
            : []),
          ...(report.missingTailFrames.length > 0
            ? [`Missing Tail Frames (${report.missingTailFrames.length}):`, `  Frames: ${report.missingTailFrames.join(', ')}`, ``]
            : []),
          `List of Missing File Names:`,
          ...report.missingFileNames.map((fn) => `  • ${fn}`),
          ``,
          `Render Queue Resubmit Frame Numbers:`,
          `  ${report.allMissingFrames.join(',')}`,
          `==================================================`,
        ].join('\n');

        await fs.promises.writeFile(reportPath, content, 'utf8');
        logger.info(`Missing frames report written to: ${reportPath}`);
        return reportPath;
      } catch (e: any) {
        logger.error(`Failed to write missing report: ${e.message}`);
        return null;
      }
    }
  );

  ipcMain.handle(
    'sequence:compareFolders',
    async (_, sourceDir: string, targetDir: string, customStart?: number, customEnd?: number) => {
      return sequenceDetector.compareTwoFolders(sourceDir, targetDir, customStart, customEnd);
    }
  );

  ipcMain.handle(
    'sequence:saveFolderComparisonReport',
    async (_, targetDir: string, report: FolderComparisonResult) => {
      try {
        const reportPath = path.join(targetDir, '_FOLDER_COMPARISON_REPORT.txt');
        const content = [
          `==================================================`,
          `📁 EXR CONVERTER - 2-FOLDER COMPARISON REPORT`,
          `==================================================`,
          `Sequence Name:   ${report.sequenceName}`,
          `Date/Time:       ${new Date().toLocaleString()}`,
          ``,
          `[Folder 1 - Source EXR]`,
          `Path:            ${report.sourceDir}`,
          `Files Count:     ${report.sourceFilesCount} frames`,
          `Frame Range:     ${report.sourceFrames[0] ?? 'N/A'} → ${report.sourceFrames[report.sourceFrames.length - 1] ?? 'N/A'}`,
          ``,
          `[Folder 2 - Converted ${report.targetFormat}]`,
          `Path:            ${report.targetDir}`,
          `Files Count:     ${report.targetFilesCount} ${report.targetFormat === 'MOV' ? 'video file' : 'frames'}`,
          `Frame Range:     ${report.targetFrames[0] ?? 'N/A'} → ${report.targetFrames[report.targetFrames.length - 1] ?? 'N/A'}`,
          ``,
          `[Comparison Results]`,
          `Status:          ${report.isPerfectMatch ? 'PERFECT MATCH (All frames match 100%)' : 'MISMATCH / MISSING FRAMES DETECTED'}`,
          `Missing in ${report.targetFormat}:   ${report.missingInTarget.length} frames`,
          ...(report.missingInTarget.length > 0
            ? [`  Missing Numbers: ${report.missingInTarget.join(', ')}`, `  Missing Files:`, ...report.missingFileNames.map((f) => `    • ${f}`)]
            : []),
          ...(report.missingFromStart.length > 0
            ? [`Sequence Gaps (from Start Frame ${report.expectedStartFrame}): ${report.missingFromStart.length} frames`, `  Missing Frame Numbers: ${report.missingFromStart.join(', ')}`]
            : []),
          `==================================================`,
        ].join('\n');

        await fs.promises.writeFile(reportPath, content, 'utf8');
        logger.info(`Folder comparison report written to: ${reportPath}`);
        return reportPath;
      } catch (e: any) {
        logger.error(`Failed to write folder comparison report: ${e.message}`);
        return null;
      }
    }
  );

  // 3. Thumbnail Generation
  ipcMain.handle('thumbnail:generate', async (_, filePath: string) => {
    return thumbnailService.generateThumbnail(filePath, ffmpegService.getFfmpegPath());
  });

  // 4. File Collision Check
  ipcMain.handle('file:collision', async (_, folder: string, fileName: string, ext: string) => {
    return fileService.checkFileCollision(folder, fileName, ext);
  });

  // 5. Disk Space Verification
  ipcMain.handle(
    'file:diskSpace',
    async (_, folder: string, frames: number, fps: number, w: number, h: number) => {
      return fileService.checkDiskSpace(folder, frames, fps, w, h);
    }
  );

  // 6. Hardware Info
  ipcMain.handle('hardware:getInfo', async () => {
    return hardwareDetector.detectHardware(ffmpegService.getFfmpegPath());
  });

  // 7. Conversion Operations
  ipcMain.handle(
    'conversion:start',
    async (_, sequence: ExrSequence, settings: ConversionSettings) => {
      const job = conversionManager.createJob(sequence, settings);
      // Run conversion asynchronously in background
      conversionManager.startJob(job.id).catch((err) => {
        logger.error(`Job execution error: ${err.message}`);
      });
      return job;
    }
  );

  ipcMain.handle('conversion:pause', async (_, jobId: string) => {
    return conversionManager.pauseJob(jobId);
  });

  ipcMain.handle('conversion:resume', async (_, jobId: string) => {
    return conversionManager.resumeJob(jobId);
  });

  ipcMain.handle('conversion:cancel', async (_, jobId: string, cleanupFile: boolean = true) => {
    return conversionManager.cancelJob(jobId, cleanupFile);
  });

  ipcMain.handle('conversion:waitForJob', async (_, jobId: string) => {
    return conversionManager.waitForJob(jobId);
  });

  // 8. File Opening and Shell integration
  ipcMain.handle('file:openVideo', async (_, filePath: string) => {
    return fileService.openVideo(filePath);
  });

  ipcMain.handle('file:reveal', async (_, filePath: string) => {
    fileService.revealInFolder(filePath);
  });

  ipcMain.handle('file:openDirectory', async (_, dirPath: string) => {
    fileService.openDirectory(dirPath);
  });

  // 9. Technical Logs
  ipcMain.handle('logs:get', async () => {
    return logger.getLogs();
  });

  ipcMain.handle('logs:openFolder', async () => {
    fileService.openDirectory(logger.getLogFolderPath());
  });

  // 10. Sample Sequence Generator for testing
  ipcMain.handle('sequence:generateSample', async (_, targetDir?: string) => {
    // Check if workspace sample directory exists
    const workspaceSample = path.join(process.cwd(), 'sample-sequence', 'SHOT_010');
    if (!targetDir && fs.existsSync(workspaceSample)) {
      const files = fs.readdirSync(workspaceSample).filter((f) => f.endsWith('.exr'));
      if (files.length > 0) {
        logger.info(`Using existing workspace sample sequence: ${workspaceSample}`);
        return sequenceDetector.scanDirectory(workspaceSample, ffmpegService.getFfprobePath());
      }
    }

    const dir = targetDir || path.join(app.getPath('documents'), 'EXR_Converter_Samples', 'SHOT_010');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    logger.info(`Generating sample EXR sequence at: ${dir}`);

    return new Promise((resolve, reject) => {
      const ffmpegBin = ffmpegService.getFfmpegPath();
      const patternPath = path.join(dir, 'SHOT_010_%04d.exr');

      // Generate 48 frames (2 seconds at 24 fps) of color test pattern in EXR format
      const args = [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'smptebars=duration=2:size=1920x1080:rate=24',
        '-start_number',
        '1001',
        '-vframes',
        '48',
        patternPath,
      ];

      const child = spawn(ffmpegBin, args);
      child.on('close', async (code) => {
        if (code === 0) {
          logger.success('Sample EXR sequence generated successfully.');
          const scanResult = await sequenceDetector.scanDirectory(dir, ffmpegService.getFfprobePath());
          resolve(scanResult);
        } else {
          logger.error(`Failed to generate sample sequence (exit code ${code})`);
          reject(new Error(`Sample generation failed with code ${code}`));
        }
      });
    });
  });

  // 10. Settings Persistence
  ipcMain.handle('settings:get', async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle('settings:save', async (_, newSettings) => {
    return settingsService.saveSettings(newSettings);
  });

  // 11. History Persistence
  ipcMain.handle('history:get', async () => {
    return historyService.getHistory();
  });

  ipcMain.handle('history:clear', async () => {
    historyService.clearHistory();
    conversionManager.clearCompletedJobs();
    return true;
  });

  // 12. Native System Notifications
  ipcMain.handle('notify:completion', async (_, { title, body }) => {
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: title || 'EXR Converter',
          body: body || 'Conversion completed successfully.',
          silent: false,
        });
        notif.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        });
        notif.show();
      }
    } catch (e) {
      logger.warn(`Could not show notification: ${e}`);
    }
    return true;
  });

  // 13. In-App Auto Updater
  ipcMain.handle('updater:check', async () => {
    return updateService.checkForUpdates(true);
  });

  ipcMain.handle('updater:getStatus', async () => {
    return updateService.getStatus();
  });

  ipcMain.handle('updater:quitAndInstall', async () => {
    updateService.quitAndInstall();
    return true;
  });
}
