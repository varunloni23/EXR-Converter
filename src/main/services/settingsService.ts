import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { ConversionSettings } from '../../shared/types';
import { logger } from './logger';

export const DEFAULT_SETTINGS: ConversionSettings = {
  outputFolder: '',
  outputFileName: '',
  outputFormat: 'mov', // Default MOV container
  codec: 'h264',
  fps: 24,
  scalePercent: 50,
  targetWidth: 2048,
  targetHeight: 1152,
  quality: 'high',
  crf: 18,
  ffmpegPreset: 'medium',
  encoderEngine: 'auto',
  presetId: 'editorial',
  conversionMode: 'sequence', // MOV merges all frames into 1 single video!
  reviewDurationSeconds: 0,
  bitrateMbps: 40, // 40 Mbps Target Bitrate
  bitrateMode: 'cbr', // CBR Bitrate Encoding
  jpegQuality: 8, // Quality: 8 Maximum (Photoshop 1-12 scale)
  jpegFormatOption: 'baseline',
  jpegScans: 3,
  expectedStartFrame: 1, // Follow actual frame sequence directly
  createSubfolder: true, // Automatically create dedicated folder for sequences
};

export class SettingsService {
  private settingsFilePath: string | null = null;
  private currentSettings: ConversionSettings = { ...DEFAULT_SETTINGS };

  private getFilePath(): string {
    if (!this.settingsFilePath) {
      const userDataDir = app.getPath('userData');
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      this.settingsFilePath = path.join(userDataDir, 'settings.json');
    }
    return this.settingsFilePath;
  }

  public getSettings(): ConversionSettings {
    try {
      const filePath = this.getFilePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
      }
    } catch (err) {
      logger.warn(`Could not read settings from disk: ${err}`);
    }
    return { ...this.currentSettings };
  }

  public saveSettings(partial: Partial<ConversionSettings>): ConversionSettings {
    try {
      this.currentSettings = {
        ...this.currentSettings,
        ...partial,
      };
      const filePath = this.getFilePath();
      fs.writeFileSync(filePath, JSON.stringify(this.currentSettings, null, 2), 'utf8');
      logger.info(`Saved updated settings to ${filePath}`);
    } catch (err) {
      logger.error(`Failed to save settings: ${err}`);
    }
    return { ...this.currentSettings };
  }
}

export const settingsService = new SettingsService();
