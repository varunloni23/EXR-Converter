import { dialog, shell, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DiskSpaceInfo, FileCollisionResult } from '../../shared/types';
import { logger } from './logger';

export class FileService {
  /**
   * Opens native folder or files selection dialog.
   */
  public async selectDirectory(
    window: BrowserWindow | null,
    title: string = 'Select EXR Folder or Frames',
    defaultPath?: string
  ): Promise<string | string[] | null> {
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      title,
      defaultPath,
      properties: ['openDirectory', 'openFile', 'multiSelections', 'createDirectory'],
      filters: [
        { name: 'EXR Sequences & Folders', extensions: ['exr', 'EXR'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths.length === 1 ? result.filePaths[0] : result.filePaths;
  }

  /**
   * Checks if an output file exists, and suggests an auto-incremented filename.
   */
  public checkFileCollision(
    outputFolder: string,
    fileNameWithoutExt: string,
    extension: string = 'mp4'
  ): FileCollisionResult {
    let targetDir = outputFolder || os.tmpdir();
    try {
      if (fs.existsSync(targetDir) && fs.statSync(targetDir).isFile()) {
        targetDir = path.dirname(targetDir);
      }
    } catch (e) {}

    const ext = extension.startsWith('.') ? extension.slice(1) : extension;
    const standardName = `${fileNameWithoutExt}.${ext}`;
    const standardPath = path.join(targetDir, standardName);

    if (!fs.existsSync(standardPath)) {
      return {
        collision: false,
        existingPath: standardPath,
        suggestedNewPath: standardPath,
      };
    }

    // Find next available number, e.g. SHOT_010_1.mp4
    let counter = 1;
    let candidatePath = '';
    while (true) {
      const candidateName = `${fileNameWithoutExt}_${counter}.${ext}`;
      candidatePath = path.join(targetDir, candidateName);
      if (!fs.existsSync(candidatePath)) {
        break;
      }
      counter++;
      if (counter > 999) break;
    }

    return {
      collision: true,
      existingPath: standardPath,
      suggestedNewPath: candidatePath,
    };
  }

  /**
   * Verifies free disk space on the target partition using native fs.statfs.
   */
  public async checkDiskSpace(
    outputFolder: string,
    frameCount: number,
    fps: number = 24,
    targetWidth: number = 1920,
    targetHeight: number = 1080
  ): Promise<DiskSpaceInfo> {
    let targetDir = outputFolder || os.tmpdir();
    try {
      if (fs.existsSync(targetDir) && fs.statSync(targetDir).isFile()) {
        targetDir = path.dirname(targetDir);
      }
    } catch (e) {}
    // Estimate bitrate: ~15 Mbps for 1080p, scaled by pixel count
    const pixelRatio = (targetWidth * targetHeight) / (1920 * 1080);
    const estimatedBitrateBytesPerSec = Math.max(500000, Math.round(1500000 * Math.max(0.5, pixelRatio)));
    const durationSeconds = Math.max(1, frameCount / fps);
    // Add 100% safety buffer
    const estimatedRequiredBytes = Math.round(durationSeconds * estimatedBitrateBytesPerSec * 2);

    let availableBytes = 50 * 1024 * 1024 * 1024; // Default fallback 50 GB

    try {
      const targetDir = fs.existsSync(outputFolder) ? outputFolder : path.dirname(outputFolder);
      if (fs.promises.statfs) {
        const stats = await fs.promises.statfs(targetDir);
        availableBytes = stats.bavail * stats.bsize;
      }
    } catch (e) {
      logger.warn(`Could not stat filesystem for disk space check: ${e}`);
    }

    const isSufficient = availableBytes > estimatedRequiredBytes;

    const formatBytes = (bytes: number) => {
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    return {
      availableBytes,
      estimatedRequiredBytes,
      isSufficient,
      availableFormatted: formatBytes(availableBytes),
      requiredFormatted: formatBytes(estimatedRequiredBytes),
    };
  }

  /**
   * Opens the converted video file with default system player (QuickTime, VLC, etc.).
   */
  public async openVideo(filePath: string): Promise<boolean> {
    if (!fs.existsSync(filePath)) {
      logger.error(`Cannot open video, file does not exist: ${filePath}`);
      return false;
    }
    const err = await shell.openPath(filePath);
    if (err) {
      logger.error(`Failed to open video file: ${err}`);
      return false;
    }
    return true;
  }

  /**
   * Reveals the output file or directory in Finder or File Explorer.
   */
  public revealInFolder(filePath: string) {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      const parentDir = path.dirname(filePath);
      if (fs.existsSync(parentDir)) {
        shell.openPath(parentDir);
      }
    }
  }

  public openDirectory(dirPath: string) {
    if (fs.existsSync(dirPath)) {
      shell.openPath(dirPath);
    }
  }
}

export const fileService = new FileService();
