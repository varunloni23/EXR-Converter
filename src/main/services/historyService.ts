import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { ConversionJob } from '../../shared/types';
import { logger } from './logger';

const MAX_HISTORY_ITEMS = 200;

export class HistoryService {
  private historyFilePath: string | null = null;
  private cachedHistory: ConversionJob[] = [];

  private getFilePath(): string {
    if (!this.historyFilePath) {
      const userDataDir = app.getPath('userData');
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      this.historyFilePath = path.join(userDataDir, 'history.json');
    }
    return this.historyFilePath;
  }

  public getHistory(): ConversionJob[] {
    try {
      const filePath = this.getFilePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.cachedHistory = parsed;
        }
      }
    } catch (err) {
      logger.warn(`Could not read history from disk: ${err}`);
    }
    return [...this.cachedHistory];
  }

  public addJob(job: ConversionJob): void {
    try {
      // Remove any existing entry with same jobId
      this.cachedHistory = this.cachedHistory.filter((j) => j.id !== job.id);
      // Prepend recent job
      this.cachedHistory.unshift(job);
      if (this.cachedHistory.length > MAX_HISTORY_ITEMS) {
        this.cachedHistory = this.cachedHistory.slice(0, MAX_HISTORY_ITEMS);
      }
      const filePath = this.getFilePath();
      fs.writeFileSync(filePath, JSON.stringify(this.cachedHistory, null, 2), 'utf8');
    } catch (err) {
      logger.error(`Failed to save history entry: ${err}`);
    }
  }

  public clearHistory(): void {
    try {
      this.cachedHistory = [];
      const filePath = this.getFilePath();
      if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf8');
      }
      logger.info('Conversion history cleared.');
    } catch (err) {
      logger.error(`Failed to clear history: ${err}`);
    }
  }
}

export const historyService = new HistoryService();
