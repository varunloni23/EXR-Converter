import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { updateService } from './updateService';

export class TrayService {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isQuitting: boolean = false;
  private hasShownTrayBalloon: boolean = false;

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public init() {
    if (this.tray) return;

    try {
      const icon = this.resolveIcon();
      this.tray = new Tray(icon);
      this.tray.setToolTip('EXR Converter - Running in background');

      this.updateContextMenu();

      // Click to toggle or show window
      this.tray.on('click', () => {
        this.toggleWindow();
      });

      this.tray.on('double-click', () => {
        this.showWindow();
      });

      logger.info('System tray initialized successfully.');
    } catch (err: any) {
      logger.error(`Failed to initialize system tray: ${err.message}`);
    }
  }

  private resolveIcon(): Electron.NativeImage {
    const candidates = [
      path.join(app.getAppPath(), 'build/tray-icon.png'),
      path.join(app.getAppPath(), 'build/icon.png'),
      path.join(__dirname, '../../build/tray-icon.png'),
      path.join(__dirname, '../build/tray-icon.png'),
      path.join(process.resourcesPath || '', 'build/tray-icon.png'),
      path.join(process.resourcesPath || '', 'tray-icon.png'),
      path.join(process.resourcesPath || '', 'icon.ico'),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return nativeImage.createFromPath(c).resize({ width: 16, height: 16 });
      }
    }

    // Default 16x16 icon created via nativeImage empty
    return nativeImage.createEmpty();
  }

  public updateContextMenu() {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open EXR Converter',
        type: 'normal',
        click: () => this.showWindow(),
      },
      { type: 'separator' },
      {
        label: 'Check for Updates...',
        type: 'normal',
        click: () => {
          this.showWindow();
          updateService.checkForUpdates(true).catch(() => {});
        },
      },
      { type: 'separator' },
      {
        label: 'Quit EXR Converter',
        type: 'normal',
        click: () => {
          this.isQuitting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  public showWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  public toggleWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isVisible()) {
        this.mainWindow.hide();
      } else {
        this.showWindow();
      }
    }
  }

  public showBalloonOnce() {
    if (!this.hasShownTrayBalloon && this.tray && process.platform === 'win32') {
      this.hasShownTrayBalloon = true;
      try {
        this.tray.displayBalloon({
          title: 'EXR Converter',
          content: 'Running in the background. Right-click any folder or sequence to convert.',
          iconType: 'info',
        });
      } catch (e) {}
    }
  }

  public getIsQuitting(): boolean {
    return this.isQuitting;
  }

  public setIsQuitting(val: boolean) {
    this.isQuitting = val;
  }

  public destroy() {
    if (this.tray) {
      try {
        this.tray.destroy();
      } catch (e) {}
      this.tray = null;
    }
  }
}

export const trayService = new TrayService();
