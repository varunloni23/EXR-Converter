import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ExrSequence, FrameComparisonReport, FolderComparisonResult, ScanResult } from '../../shared/types';
import { logger } from './logger';

const execAsync = promisify(exec);

export class SequenceDetector {
  /**
   * Reads the dimensions from an EXR file header directly (box2i dataWindow).
   * Fallback to ffprobe if needed.
   */
  public async getExrDimensions(filePath: string, ffprobePath: string = 'ffprobe'): Promise<{ width: number; height: number }> {
    try {
      // 1. Fast binary header parsing
      const fd = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(4096);
      await fd.read(buffer, 0, 4096, 0);
      await fd.close();

      // Check OpenEXR magic number: 0x76, 0x2f, 0x31, 0x01
      if (
        buffer[0] === 0x76 &&
        buffer[1] === 0x2f &&
        buffer[2] === 0x31 &&
        buffer[3] === 0x01
      ) {
        let offset = 8; // skip magic (4) + version (4)
        while (offset < buffer.length) {
          // Attribute name is null-terminated
          const nullNameIndex = buffer.indexOf(0x00, offset);
          if (nullNameIndex === -1 || nullNameIndex === offset) {
            // Empty string indicates end of header
            break;
          }
          const attrName = buffer.toString('utf8', offset, nullNameIndex);
          offset = nullNameIndex + 1;

          // Attribute type is null-terminated
          const nullTypeIndex = buffer.indexOf(0x00, offset);
          if (nullTypeIndex === -1) break;
          const attrType = buffer.toString('utf8', offset, nullTypeIndex);
          offset = nullTypeIndex + 1;

          // Attribute size (4 bytes uint32)
          if (offset + 4 > buffer.length) break;
          const attrSize = buffer.readUInt32LE(offset);
          offset += 4;

          if (attrName === 'dataWindow' && attrType === 'box2i' && attrSize === 16) {
            const xMin = buffer.readInt32LE(offset);
            const yMin = buffer.readInt32LE(offset + 4);
            const xMax = buffer.readInt32LE(offset + 8);
            const yMax = buffer.readInt32LE(offset + 12);
            const width = Math.abs(xMax - xMin + 1);
            const height = Math.abs(yMax - yMin + 1);
            if (width > 0 && height > 0) {
              return { width, height };
            }
          }

          offset += attrSize;
        }
      }
    } catch (e) {
      // Ignore and fallback to ffprobe
    }

    // 2. FFprobe fallback
    try {
      const { stdout } = await execAsync(
        `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${filePath}"`
      );
      const parts = stdout.trim().split('x');
      if (parts.length === 2) {
        const w = parseInt(parts[0], 10);
        const h = parseInt(parts[1], 10);
        if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
          return { width: w, height: h };
        }
      }
    } catch (err) {
      logger.warn('FFprobe failed to probe EXR dimensions', String(err));
    }

    // Default standard resolution fallback if completely unreadable
    return { width: 1920, height: 1080 };
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Scans a directory or specific files for EXR sequences.
   */
  public async scanDirectory(
    input: string | string[],
    ffprobePath: string = 'ffprobe',
    recursive: boolean = true,
    singleFileOnly: boolean = false
  ): Promise<ScanResult> {
    const inputs = Array.isArray(input) ? input : [input];
    if (inputs.length === 0) {
      return { sequences: [], totalExrFiles: 0, folderPath: '' };
    }

    // Determine primary folder path for reporting
    let primaryFolderPath = inputs[0];
    try {
      if (fs.existsSync(primaryFolderPath)) {
        const stats = await fs.promises.stat(primaryFolderPath);
        if (stats.isFile()) {
          primaryFolderPath = path.dirname(primaryFolderPath);
        }
      }
    } catch (e) {}

    logger.info(`Scanning input for sequences: ${inputs.length > 1 ? `${inputs.length} paths` : primaryFolderPath}`);

    const exrFiles: { fullPath: string; dir: string; fileName: string }[] = [];
    const videoFiles: { fullPath: string; dir: string; fileName: string; ext: string }[] = [];
    const visitedFiles = new Set<string>();

    const walk = async (currentDir: string, depth: number = 0) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch (err) {
        logger.error(`Cannot read directory: ${currentDir}`, String(err));
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory() && recursive && depth < 5) {
          if (
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' &&
            entry.name !== '$RECYCLE.BIN'
          ) {
            await walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.exr') {
            if (!visitedFiles.has(fullPath)) {
              visitedFiles.add(fullPath);
              exrFiles.push({
                fullPath,
                dir: currentDir,
                fileName: entry.name,
              });
            }
          } else if (ext === '.mov' || ext === '.mp4') {
            if (!visitedFiles.has(fullPath)) {
              visitedFiles.add(fullPath);
              videoFiles.push({
                fullPath,
                dir: currentDir,
                fileName: entry.name,
                ext,
              });
            }
          }
        }
      }
    };

    for (const itemPath of inputs) {
      if (!fs.existsSync(itemPath)) continue;
      try {
        const stats = await fs.promises.stat(itemPath);
        if (stats.isDirectory()) {
          await walk(itemPath, 0);
        } else if (stats.isFile()) {
          const ext = path.extname(itemPath).toLowerCase();
          if (ext === '.exr') {
            // If singleFileOnly is set or multiple specific files were provided:
            if (singleFileOnly || inputs.length > 1) {
              if (!visitedFiles.has(itemPath)) {
                visitedFiles.add(itemPath);
                exrFiles.push({
                  fullPath: itemPath,
                  dir: path.dirname(itemPath),
                  fileName: path.basename(itemPath),
                });
              }
            } else {
              // Single file dropped/selected: scan its containing folder to find complete sequence
              const parentDir = path.dirname(itemPath);
              logger.info(`Single EXR file specified (${path.basename(itemPath)}). Scanning full directory: ${parentDir}`);
              await walk(parentDir, 0);
            }
          } else if (ext === '.mov' || ext === '.mp4') {
            if (!visitedFiles.has(itemPath)) {
              visitedFiles.add(itemPath);
              videoFiles.push({
                fullPath: itemPath,
                dir: path.dirname(itemPath),
                fileName: path.basename(itemPath),
                ext,
              });
            }
          }
        }
      } catch (err) {
        logger.warn(`Could not inspect path: ${itemPath}`, String(err));
      }
    }

    if (exrFiles.length === 0) {
      if (videoFiles.length > 0) {
        logger.info(`Found ${videoFiles.length} video files (.mov/.mp4) in ${primaryFolderPath}. Creating video sequence definitions...`);
        const sequences: ExrSequence[] = [];

        for (const video of videoFiles) {
          let width = 1920;
          let height = 1080;
          let frameCount = 1;
          let fps = 24;

          try {
            const { stdout } = await execAsync(
              `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height,nb_frames,r_frame_rate,duration -show_entries format=duration -of json "${video.fullPath}"`
            );
            const data = JSON.parse(stdout);
            const stream = data.streams?.[0];
            if (stream) {
              width = stream.width || width;
              height = stream.height || height;
              if (stream.r_frame_rate) {
                const parts = stream.r_frame_rate.split('/');
                const num = parseFloat(parts[0]);
                const den = parseFloat(parts[1] || '1');
                if (num && den) fps = Math.round((num / den) * 100) / 100;
              }
              if (stream.nb_frames) {
                frameCount = parseInt(stream.nb_frames, 10);
              } else if (stream.duration || data.format?.duration) {
                const dur = parseFloat(stream.duration || data.format.duration);
                if (!isNaN(dur)) frameCount = Math.max(1, Math.round(dur * (fps || 24)));
              }
            }
          } catch (err) {
            logger.warn(`Could not probe video ${video.fullPath}:`, String(err));
          }

          // Check if there is a sibling EXR folder to match the original sequence's starting frame
          const baseName = path.parse(video.fileName).name; // e.g. "STRM_E1_0370"
          let firstFrame = 1;
          const candidates = [
            path.join(path.dirname(video.dir), path.basename(video.dir).replace(/_(MOV|JPEG|MP4)$/i, '')),
            path.dirname(video.dir),
          ];
          for (const cand of candidates) {
            if (fs.existsSync(cand) && cand !== video.dir) {
              try {
                const files = await fs.promises.readdir(cand);
                const exr = files.find((f) => f.toLowerCase().endsWith('.exr') && f.startsWith(baseName));
                if (exr) {
                  const m = exr.match(/(\d+)\.[eE][xX][rR]$/);
                  if (m) {
                    firstFrame = parseInt(m[1], 10);
                    break;
                  }
                }
              } catch (e) {}
            }
          }

          const lastFrame = firstFrame + frameCount - 1;
          const seqId = `${baseName}_video_${firstFrame}_${lastFrame}_${Date.now().toString(36)}`;
          const pattern = `${baseName}.%04d.jpg`;
          const globPattern = `${baseName}.*.jpg`;

          // Generate frame detail stubs for UI listing
          const frameDetails = [];
          for (let f = firstFrame; f <= lastFrame; f++) {
            const padded = String(f).padStart(4, '0');
            frameDetails.push({
              frameNumber: f,
              fileName: `${baseName}.${padded}.jpg`,
              filePath: video.fullPath,
              fileSizeBytes: 0,
              formattedSize: 'Video frame',
            });
          }

          const videoSeq: ExrSequence = {
            id: seqId,
            folderPath: video.dir,
            sequenceName: baseName,
            pattern,
            globPattern,
            firstFrame,
            lastFrame,
            frameCount,
            padding: 4,
            delimiter: '.',
            prefix: `${baseName}.`,
            extension: video.ext,
            width,
            height,
            hasMissingFrames: false,
            missingFrames: [],
            firstFramePath: video.fullPath,
            frames: [video.fullPath],
            frameDetails,
            expectedStartFrame: firstFrame,
            expectedEndFrame: lastFrame,
            expectedCount: frameCount,
          };

          sequences.push(videoSeq);
          logger.info(
            `Video sequence detected: ${baseName} (${video.ext.toUpperCase()}) | Frames: ${firstFrame} → ${lastFrame} (${frameCount} frames) | Resolution: ${width}x${height}`
          );
        }

        return {
          sequences,
          totalExrFiles: videoFiles.length,
          folderPath: primaryFolderPath,
        };
      }

      logger.warn(`No EXR or video files found in ${primaryFolderPath}`);
      return {
        sequences: [],
        totalExrFiles: 0,
        folderPath: primaryFolderPath,
      };
    }

    logger.info(`Found ${exrFiles.length} EXR files in ${primaryFolderPath}. Grouping sequences...`);

    // Filename pattern regexes:
    // 1. Standard trailing digits:
    //    SHOT_010_1001.exr -> prefix: "SHOT_010", delimiter: "_", frame: "1001"
    //    render.0001.exr -> prefix: "render", delimiter: ".", frame: "0001"
    //    1001.exr -> prefix: "", delimiter: "", frame: "1001"
    const trailingDigitsRegex = /^(.*?)(\.|_|-)?(\d+)\.([eE][xX][rR])$/;

    interface FileItem {
      fullPath: string;
      fileName: string;
      prefix: string;
      delimiter: string;
      frameNumber: number;
      frameStr: string;
      padding: number;
      dir: string;
    }

    const groupedMap = new Map<string, FileItem[]>();

    for (const file of exrFiles) {
      let prefix = '';
      let delimiter = '';
      let frameStr = '1';
      let padding = 1;
      let frameNumber = 1;

      const match = file.fileName.match(trailingDigitsRegex);
      if (match) {
        prefix = match[1] ?? '';
        delimiter = match[2] ?? '';
        frameStr = match[3];
        padding = frameStr.length;
        frameNumber = parseInt(frameStr, 10);
      } else {
        // Fallback for standalone EXR without frame numbers (e.g. still.exr, beauty.exr)
        const nameWithoutExt = path.parse(file.fileName).name;
        prefix = nameWithoutExt;
        delimiter = '';
        frameStr = '1';
        padding = 1;
        frameNumber = 1;
      }

      // Group key: Directory + Prefix + Delimiter (independent of padding)
      const groupKey = `${file.dir}:::${prefix}:::${delimiter}`;

      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, []);
      }
      groupedMap.get(groupKey)!.push({
        fullPath: file.fullPath,
        fileName: file.fileName,
        prefix,
        delimiter,
        frameNumber,
        frameStr,
        padding,
        dir: file.dir,
      });
    }

    const sequences: ExrSequence[] = [];

    for (const [key, items] of groupedMap.entries()) {
      // Sort by frame number ascending
      items.sort((a, b) => a.frameNumber - b.frameNumber);

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const firstFrame = firstItem.frameNumber;
      const lastFrame = lastItem.frameNumber;
      const padding = firstItem.padding;
      const delimiter = firstItem.delimiter as '.' | '_' | '';
      const prefix = firstItem.prefix;
      const dir = firstItem.dir;

      // Extract sequence clean name
      let sequenceName = prefix;
      if (!sequenceName) {
        // If no prefix (e.g. 0001.exr), use parent folder name
        sequenceName = path.basename(dir);
      } else {
        // Strip trailing dots or underscores for the display name
        sequenceName = sequenceName.replace(/[._-]+$/, '');
      }

      // Generate FFmpeg format pattern, e.g.:
      // SHOT_010_%04d.exr or render.%04d.exr or unpadded frame.%d.exr
      const allPaddings = new Set(items.map((i) => i.padding));
      const isFixedPadding = allPaddings.size === 1 && padding > 1;
      const patternName = isFixedPadding
        ? `${prefix}${delimiter}%0${padding}d.exr`
        : `${prefix}${delimiter}%d.exr`;

      // Sequence start frame follows the actual EXR files directly (do not look for 1001)
      const expectedStartFrame = firstFrame;
      const expectedEndFrame = lastFrame;
      const expectedCount = Math.max(0, expectedEndFrame - expectedStartFrame + 1);

      // Collect detailed info for each frame (size, index, name)
      const frameDetails = items.map((item) => {
        let size = 0;
        try {
          size = fs.statSync(item.fullPath).size;
        } catch (e) {}
        return {
          frameNumber: item.frameNumber,
          fileName: item.fileName,
          filePath: item.fullPath,
          fileSizeBytes: size,
          formattedSize: this.formatBytes(size),
        };
      });

      // Probe resolution from first frame
      const { width, height } = await this.getExrDimensions(firstItem.fullPath, ffprobePath);

      const seqId = `${sequenceName}_${firstFrame}_${lastFrame}_${Date.now().toString(36)}`;

      const tempSeq: ExrSequence = {
        id: seqId,
        folderPath: dir,
        sequenceName,
        pattern: patternName,
        globPattern: `${prefix}${delimiter}*${padding > 0 ? '' : ''}.exr`,
        firstFrame,
        lastFrame,
        frameCount: items.length,
        padding,
        delimiter,
        prefix,
        extension: '.exr',
        width,
        height,
        hasMissingFrames: false,
        missingFrames: [],
        firstFramePath: firstItem.fullPath,
        frames: items.map((i) => i.fullPath),
        frameDetails,
        expectedStartFrame,
        expectedEndFrame,
        expectedCount,
      };

      const comparison = this.compareExpectedFrames(tempSeq, expectedStartFrame, expectedEndFrame);

      const sequence: ExrSequence = {
        ...tempSeq,
        hasMissingFrames: comparison.allMissingFrames.length > 0,
        missingFrames: comparison.allMissingFrames,
        missingHeadFrames: comparison.missingHeadFrames,
        missingMiddleFrames: comparison.missingMiddleFrames,
        missingTailFrames: comparison.missingTailFrames,
        allMissingFrames: comparison.allMissingFrames,
        missingFileNames: comparison.missingFileNames,
      };

      sequences.push(sequence);

      logger.info(
        `Sequence detected: ${sequenceName}`,
        `Frames: ${firstFrame} → ${lastFrame} (Expected: ${expectedStartFrame} → ${expectedEndFrame}, ${items.length}/${expectedCount} frames) | Resolution: ${width}x${height} | Missing: ${
          comparison.allMissingFrames.length > 0
            ? `${comparison.allMissingFrames.length} frames (${comparison.allMissingFrames.slice(0, 5).join(', ')}${comparison.allMissingFrames.length > 5 ? '...' : ''})`
            : 'None'
        }`
      );
    }

    return {
      sequences,
      totalExrFiles: exrFiles.length,
      folderPath: primaryFolderPath,
    };
  }

  /**
   * Compares a sequence against expected start and end frame numbers to identify
   * missing head frames (e.g. 1001-1004), missing middle frames (gaps), and missing tail frames.
   */
  public compareExpectedFrames(
    sequence: ExrSequence,
    customStart?: number,
    customEnd?: number
  ): FrameComparisonReport {
    const start = customStart !== undefined ? customStart : (sequence.expectedStartFrame ?? sequence.firstFrame);
    const end = customEnd !== undefined ? customEnd : (sequence.expectedEndFrame ?? sequence.lastFrame);

    const presentFrames = new Set<number>();
    if (sequence.frameDetails && sequence.frameDetails.length > 0) {
      for (const d of sequence.frameDetails) presentFrames.add(d.frameNumber);
    } else if (sequence.frames && sequence.frames.length > 0) {
      for (const f of sequence.frames) {
        const m = path.basename(f).match(/(\d+)\.[eE][xX][rR]$/);
        if (m) presentFrames.add(parseInt(m[1], 10));
      }
    }

    const missingHeadFrames: number[] = [];
    const missingMiddleFrames: number[] = [];
    const missingTailFrames: number[] = [];
    const allMissingFrames: number[] = [];
    const missingFileNames: string[] = [];

    const pad = sequence.padding > 0 ? sequence.padding : 4;
    const prefix = sequence.prefix || '';
    const delimiter = sequence.delimiter || '';

    for (let f = start; f <= end; f++) {
      if (!presentFrames.has(f)) {
        allMissingFrames.push(f);
        if (f < sequence.firstFrame) {
          missingHeadFrames.push(f);
        } else if (f > sequence.lastFrame) {
          missingTailFrames.push(f);
        } else {
          missingMiddleFrames.push(f);
        }

        const paddedNum = String(f).padStart(pad, '0');
        const fileName = `${prefix}${delimiter}${paddedNum}.exr`;
        missingFileNames.push(fileName);
      }
    }

    const expectedCount = Math.max(0, end - start + 1);
    const foundCount = Math.max(0, expectedCount - allMissingFrames.length);

    return {
      sequenceName: sequence.sequenceName,
      folderPath: sequence.folderPath,
      expectedStartFrame: start,
      expectedEndFrame: end,
      expectedCount,
      foundCount,
      missingCount: allMissingFrames.length,
      missingHeadFrames,
      missingMiddleFrames,
      missingTailFrames,
      allMissingFrames,
      missingFileNames,
      isComplete: allMissingFrames.length === 0,
    };
  }

  /**
   * Compares a source folder (e.g. EXR) and a target folder (e.g. converted JPEG or MOV)
   * to determine which frames exist in source, which exist in target, and which are missing.
   */
  public async compareTwoFolders(
    sourceDir: string,
    targetDir: string,
    customStart?: number,
    customEnd?: number
  ): Promise<FolderComparisonResult> {
    let effectiveSource = sourceDir;
    let effectiveTarget = targetDir;

    try {
      if (fs.existsSync(effectiveSource) && fs.statSync(effectiveSource).isFile()) {
        effectiveSource = path.dirname(effectiveSource);
      }
      if (fs.existsSync(effectiveTarget) && fs.statSync(effectiveTarget).isFile()) {
        effectiveTarget = path.dirname(effectiveTarget);
      }
    } catch (e) {}

    // If source folder is named e.g. test1_MOV, resolve original EXR folder test1
    const cleanSrcBase = path.basename(effectiveSource);
    if (/_(MOV|JPEG|MP4)$/i.test(cleanSrcBase)) {
      const candidateExr = path.join(path.dirname(effectiveSource), cleanSrcBase.replace(/_(MOV|JPEG|MP4)$/i, ''));
      if (fs.existsSync(candidateExr)) {
        if (!effectiveTarget || effectiveTarget === candidateExr) {
          effectiveTarget = effectiveSource;
          effectiveSource = candidateExr;
        }
      }
    }

    const sourceScan = await this.scanDirectory(effectiveSource, 'ffprobe', false);
    const seq = sourceScan.sequences[0];

    const sourceFrames = new Set<number>();
    const targetFrames = new Set<number>();

    if (seq) {
      if (seq.frameDetails && seq.frameDetails.length > 0) {
        for (const d of seq.frameDetails) sourceFrames.add(d.frameNumber);
      } else if (seq.frames) {
        for (const f of seq.frames) {
          const m = path.basename(f).match(/(\d+)\.[eE][xX][rR]$/);
          if (m) sourceFrames.add(parseInt(m[1], 10));
        }
      }
    }

    if (sourceFrames.size === 0) {
      try {
        if (fs.existsSync(effectiveSource)) {
          const directFiles = await fs.promises.readdir(effectiveSource);
          for (const f of directFiles) {
            if (f.toLowerCase().endsWith('.exr')) {
              const m = f.match(/(\d+)\.[eE][xX][rR]$/);
              if (m) sourceFrames.add(parseInt(m[1], 10));
            }
          }
        }
      } catch (e) {}
    }

    // Read target directory files
    let targetEntries: string[] = [];
    try {
      if (fs.existsSync(effectiveTarget)) {
        const stats = await fs.promises.stat(effectiveTarget);
        if (stats.isFile()) {
          targetEntries = [path.basename(effectiveTarget)];
        } else {
          targetEntries = await fs.promises.readdir(effectiveTarget);
        }
      }
    } catch (e) {}

    let targetFormat = 'JPEG';
    let hasMov = false;
    for (const f of targetEntries) {
      const ext = path.extname(f).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg') {
        const m = f.match(/(\d+)\.(jpg|jpeg)$/i);
        if (m) targetFrames.add(parseInt(m[1], 10));
      } else if (ext === '.mov') {
        hasMov = true;
      }
    }
    if (hasMov && targetFrames.size === 0) {
      targetFormat = 'MOV';
    }

    // Expected range
    const sortedSource = Array.from(sourceFrames).sort((a, b) => a - b);
    let start = customStart ?? (seq?.expectedStartFrame ?? (sortedSource[0] ?? 1));
    let end = customEnd ?? (seq?.expectedEndFrame ?? (sortedSource[sortedSource.length - 1] ?? (start + Math.max(1, sourceFrames.size) - 1)));

    const missingInTarget: number[] = [];
    const missingFromStart: number[] = [];
    const missingFileNames: string[] = [];

    const pad = seq?.padding || 4;
    const prefix = seq?.prefix || (seq?.sequenceName || path.basename(sourceDir));
    const delimiter = seq?.delimiter || '.';

    // Check frames from start to end
    for (let f = start; f <= end; f++) {
      if (!sourceFrames.has(f)) {
        missingFromStart.push(f);
      }
      if (targetFormat === 'JPEG' && sourceFrames.has(f) && !targetFrames.has(f)) {
        missingInTarget.push(f);
        const padded = String(f).padStart(pad, '0');
        missingFileNames.push(`${prefix}${delimiter}${padded}.jpg`);
      }
    }

    const isConversionComplete = targetFormat === 'MOV' ? hasMov : (sourceFrames.size > 0 && missingInTarget.length === 0);
    const isSequenceComplete = missingFromStart.length === 0;

    return {
      sourceDir,
      targetDir,
      sequenceName: seq?.sequenceName || path.basename(sourceDir),
      sourceFormat: 'EXR',
      targetFormat,
      sourceFilesCount: sourceFrames.size,
      targetFilesCount: targetFormat === 'MOV' ? (hasMov ? 1 : 0) : targetFrames.size,
      sourceFrames: sortedSource,
      targetFrames: Array.from(targetFrames).sort((a, b) => a - b),
      missingInTarget,
      missingFromStart,
      isPerfectMatch: isConversionComplete && isSequenceComplete,
      expectedStartFrame: start,
      expectedEndFrame: end,
      missingFileNames,
    };
  }
}

export const sequenceDetector = new SequenceDetector();
