import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow, app } from 'electron';
import { logger } from './logger';
import { UpdateStatus } from '../../shared/types';

export class UpdateService {
  private window: BrowserWindow | null = null;
  private currentStatus: UpdateStatus = { state: 'idle' };

  constructor() {
    this.setupAutoUpdater();
  }

  public setWindow(win: BrowserWindow) {
    this.window = win;
  }

  private isManualCheck: boolean = false;

  private setupAutoUpdater() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    // Direct logs to application logger
    autoUpdater.logger = {
      info: (msg: any) => logger.info(`[AutoUpdater] ${msg}`),
      warn: (msg: any) => logger.warn(`[AutoUpdater] ${msg}`),
      error: (msg: any) => logger.error(`[AutoUpdater] ${msg}`),
    };

    // Configure update feed for repository updates (public releases require no token)
    const feedConfig: any = {
      provider: 'github',
      owner: 'varunloni23',
      repo: 'EXR-Converter',
    };
    if (process.env.GH_TOKEN) {
      feedConfig.token = process.env.GH_TOKEN;
      feedConfig.private = true;
    }
    autoUpdater.setFeedURL(feedConfig);

    autoUpdater.on('checking-for-update', () => {
      if (this.isManualCheck) {
        this.sendStatus({ state: 'checking' });
      }
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      logger.info(`Update available: version ${info.version}`);
      this.sendStatus({
        state: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      logger.info(`App is up to date: version ${info.version}`);
      if (this.isManualCheck) {
        this.sendStatus({
          state: 'not-available',
          version: info.version,
        });
      }
    });

    autoUpdater.on('error', (err: Error) => {
      logger.warn(`Auto-updater background check info: ${err.message}`);
      if (this.isManualCheck) {
        this.sendStatus({
          state: 'error',
          error: err.message,
        });
      } else {
        this.sendStatus({ state: 'idle' });
      }
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.sendStatus({
        state: 'downloading',
        progressPercent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferredBytes: progress.transferred,
        totalBytes: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      logger.info(`Update downloaded and ready to install: version ${info.version}`);
      this.sendStatus({
        state: 'downloaded',
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    });
  }

  private sendStatus(status: UpdateStatus) {
    this.currentStatus = status;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('updater:status', status);
    }
  }

  public getStatus(): UpdateStatus {
    return this.currentStatus;
  }

  public async checkForUpdates(isManual: boolean = false): Promise<UpdateStatus> {
    this.isManualCheck = isManual;

    if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
      logger.info('AutoUpdater skipped in development environment.');
      const devStatus: UpdateStatus = {
        state: 'not-available',
        version: app.getVersion(),
        error: 'Development mode: Updates are checked in packaged builds.',
      };
      if (isManual) {
        this.sendStatus(devStatus);
      }
      return devStatus;
    }

    try {
      if (isManual) {
        this.sendStatus({ state: 'checking' });
      }
      await autoUpdater.checkForUpdates();
      return this.currentStatus;
    } catch (err: any) {
      logger.warn(`Update check: ${err.message}`);
      if (isManual) {
        const errStatus: UpdateStatus = { state: 'error', error: err.message };
        this.sendStatus(errStatus);
        return errStatus;
      }
      return { state: 'idle' };
    }
  }

  public quitAndInstall() {
    logger.info('Triggering quit and install of downloaded update...');
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.destroy();
      } catch (e) {}
    }
    // Launch installer silently and restart application cleanly
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true);
    }, 300);
  }
}

export const updateService = new UpdateService();
