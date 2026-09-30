import fs from 'fs';
import path from 'path';
import os from 'os';
import electron from 'electron';
import { LogEntry } from '../../shared/types';

// In Electron main process, electron is an object with { app, ... }
// In pure Node.js (e.g. tests), electron is a string path to the binary
const electronApp = typeof electron === 'object' && electron !== null ? (electron as any).app : null;

class Logger {
  private logs: LogEntry[] = [];
  private logFilePath: string = '';
  private initialized: boolean = false;
  private subscribers: ((entry: LogEntry) => void)[] = [];

  constructor() {
    // Will be initialized when app is ready
  }

  public init() {
    if (this.initialized) return;
    try {
      const baseDir = electronApp?.getPath ? electronApp.getPath('userData') : path.join(os.homedir(), '.exr-converter');
      const logsDir = path.join(baseDir, 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFilePath = path.join(logsDir, `exr-converter-${timestamp}.log`);
      this.initialized = true;
      this.info('Logger initialized', `Log file: ${this.logFilePath}`);
    } catch (err) {
      console.error('Failed to initialize file logger:', err);
    }
  }

  public subscribe(callback: (entry: LogEntry) => void) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  private addEntry(level: LogEntry['level'], message: string, details?: string) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: timeStr,
      level,
      message,
      details,
    };

    this.logs.push(entry);
    if (this.logs.length > 2000) {
      this.logs.shift();
    }

    const logLine = `[${now.toISOString()}] [${level.toUpperCase()}] ${message}${
      details ? ` | ${details}` : ''
    }\n`;

    console.log(`[${timeStr}] [${level.toUpperCase()}] ${message}`);

    if (this.initialized && this.logFilePath) {
      fs.appendFile(this.logFilePath, logLine, () => {});
    }

    for (const sub of this.subscribers) {
      try {
        sub(entry);
      } catch (e) {
        // ignore subscriber errors
      }
    }
  }

  public info(message: string, details?: string) {
    this.addEntry('info', message, details);
  }

  public warn(message: string, details?: string) {
    this.addEntry('warn', message, details);
  }

  public error(message: string, details?: string) {
    this.addEntry('error', message, details);
  }

  public success(message: string, details?: string) {
    this.addEntry('success', message, details);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }

  public getLogFolderPath(): string {
    const baseDir = electronApp?.getPath ? electronApp.getPath('userData') : path.join(os.homedir(), '.exr-converter');
    return path.join(baseDir, 'logs');
  }

  public clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger();
