import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execFileSync } from 'child_process';
import { ffmpegService } from '../src/main/services/ffmpegService';
import { watermarkService } from '../src/main/services/watermarkService';
import {
  calculateWatermarkPosition,
  detectWatermarkConfig,
  getEmbeddedAlphaMap,
  getVideoAlphaMap,
  resolveVideoWatermarkCandidates,
  scoreVideoWatermarkFrame,
} from '../src/main/services/watermark/gwrEngine.js';
import {
  mergeLaunchTargets,
  parseLaunchArgs,
  LaunchTarget,
} from '../src/main/services/launchArgsParser';
import { WatermarkOptions } from '../src/shared/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Generates a realistic dark/mid-tone studio test image (RGBA) with smooth gradients
 * and subtle multi-frequency texture so watermark correlation behaves realistically.
 */
function createSyntheticRgba(width: number, height: number, frameOffset = 0): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const wave = Math.sin((x + frameOffset * 6) * 0.04) * 10 + Math.cos((y + frameOffset * 4) * 0.05) * 8;
      const r = Math.max(18, Math.min(145, Math.round(32 + nx * 58 + ny * 24 + wave)));
      const g = Math.max(20, Math.min(155, Math.round(40 + ny * 62 + nx * 18 + wave * 0.8)));
      const b = Math.max(28, Math.min(170, Math.round(56 + (1 - nx) * 52 + ny * 30 - wave * 0.6)));
      const idx = (y * width + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

/**
 * Applies forward Gemini alpha blending:
 * watermarked = round(alpha * 255 + (1 - alpha) * original)
 */
function applyForwardWatermark(
  rgba: Uint8ClampedArray,
  imageWidth: number,
  alphaMap: Float32Array,
  pos: { x: number; y: number; width: number; height: number },
  gain = 1.0
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let row = 0; row < pos.height; row++) {
    for (let col = 0; col < pos.width; col++) {
      const alpha = alphaMap[row * pos.width + col] * gain;
      if (alpha <= 0.001) continue;
      const idx = ((pos.y + row) * imageWidth + (pos.x + col)) * 4;
      out[idx] = Math.min(255, Math.round(alpha * 255 + (1 - alpha) * out[idx]));
      out[idx + 1] = Math.min(255, Math.round(alpha * 255 + (1 - alpha) * out[idx + 1]));
      out[idx + 2] = Math.min(255, Math.round(alpha * 255 + (1 - alpha) * out[idx + 2]));
    }
  }
  return out;
}

function encodeRgbaToImage(
  ffmpegPath: string,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ext = path.extname(outputPath).toLowerCase();
    const codecArgs =
      ext === '.jpg' || ext === '.jpeg'
        ? ['-c:v', 'mjpeg', '-qmin', '1', '-q:v', '1', '-pix_fmt', 'yuvj444p']
        : ['-c:v', 'png'];

    const proc = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-s',
        `${width}x${height}`,
        '-i',
        'pipe:0',
        '-frames:v',
        '1',
        ...codecArgs,
        outputPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`encodeRgbaToImage failed (${code}): ${stderr}`));
      else resolve();
    });

    proc.stdin.end(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength));
  });
}

function decodeImageToRgba(
  ffmpegPath: string,
  inputPath: string,
  expectedByteLen: number
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`decodeImageToRgba failed (${code}): ${stderr}`));
      const buf = Buffer.concat(chunks);
      if (buf.length < expectedByteLen) {
        return reject(new Error(`Decoded byte length mismatch: ${buf.length} < ${expectedByteLen}`));
      }
      resolve(new Uint8ClampedArray(buf.buffer, buf.byteOffset, expectedByteLen));
    });
  });
}

function computeRegionMae(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  imageWidth: number,
  region: { x: number; y: number; width: number; height: number }
): number {
  let sum = 0;
  let count = 0;
  for (let row = 0; row < region.height; row++) {
    for (let col = 0; col < region.width; col++) {
      const idx = ((region.y + row) * imageWidth + (region.x + col)) * 4;
      sum +=
        Math.abs(a[idx] - b[idx]) +
        Math.abs(a[idx + 1] - b[idx + 1]) +
        Math.abs(a[idx + 2] - b[idx + 2]);
      count += 3;
    }
  }
  return count > 0 ? sum / count : 0;
}

async function createWatermarkedImageAsset(
  ffmpegPath: string,
  outputPath: string,
  width: number,
  height: number,
  addWatermark = true
) {
  const groundTruth = createSyntheticRgba(width, height);
  const config = detectWatermarkConfig(width, height);
  const pos = calculateWatermarkPosition(width, height, config);
  const alphaMap = getEmbeddedAlphaMap(config.logoSize);
  const pixels = addWatermark
    ? applyForwardWatermark(groundTruth, width, alphaMap, pos)
    : groundTruth;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await encodeRgbaToImage(ffmpegPath, pixels, width, height, outputPath);
  return { groundTruth, watermarked: pixels, config, pos, alphaMap };
}

async function createWatermarkedVideoAsset(
  ffmpegPath: string,
  outputPath: string,
  width = 1280,
  height = 720,
  frameCount = 15,
  fps = 15
) {
  const candidates = resolveVideoWatermarkCandidates(width, height);
  assert(candidates.length > 0, 'Expected Veo watermark candidates for 1280x720');
  const chosen = candidates[0];
  const alphaMap = getVideoAlphaMap(chosen.size);
  const pos = { x: chosen.x, y: chosen.y, width: chosen.size, height: chosen.size, size: chosen.size };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-s',
        `${width}x${height}`,
        '-r',
        String(fps),
        '-i',
        'pipe:0',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:duration=${(frameCount / fps).toFixed(2)}`,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'libx264',
        '-crf',
        '12',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        outputPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`Video synthesis failed (${code}): ${stderr}`));
      else resolve();
    });

    for (let f = 0; f < frameCount; f++) {
      const base = createSyntheticRgba(width, height, f);
      const wm = applyForwardWatermark(base, width, alphaMap, pos, 0.60);
      proc.stdin.write(Buffer.from(wm.buffer, wm.byteOffset, wm.byteLength));
    }
    proc.stdin.end();
  });

  return { chosen, alphaMap, pos };
}

async function runWatermarkTests() {
  console.log('\n=======================================================');
  console.log('✨ RUNNING GEMINI WATERMARK REMOVER END-TO-END TESTS');
  console.log('=======================================================\n');

  const ffmpegPath = ffmpegService.getFfmpegPath();
  const ffprobePath = ffmpegService.getFfprobePath();
  assert(Boolean(ffmpegPath), 'FFmpeg path unavailable');
  console.log(`✓ FFmpeg ready: ${ffmpegPath}`);

  const testRoot = path.join(os.tmpdir(), `gwr_studio_e2e_${Date.now()}`);
  fs.mkdirSync(testRoot, { recursive: true });

  const defaultOpts: WatermarkOptions = {
    outputMode: 'auto',
    copySkippedInFolderMode: true,
  };

  const deps = { ffmpegPath, ffprobePath };

  try {
    // -------------------------------------------------------------------------
    // 1. SINGLE FILE SCENARIO (1024x1024 -> 96x96 Gemini Watermark)
    // -------------------------------------------------------------------------
    console.log('\n1. Testing SINGLE FILE scenario (1024x1024 PNG with 96x96 watermark)...');
    const singleDir = path.join(testRoot, '01_single');
    const singleFile = path.join(singleDir, 'gemini_portrait.png');
    const singleAsset = await createWatermarkedImageAsset(deps.ffmpegPath, singleFile, 1024, 1024, true);

    const beforeMae = computeRegionMae(
      singleAsset.groundTruth,
      singleAsset.watermarked,
      1024,
      singleAsset.pos
    );

    const scan1 = await watermarkService.scanPaths([singleFile]);
    assert(scan1.items.length === 1, `Expected 1 item, got ${scan1.items.length}`);
    assert(scan1.imageCount === 1, 'Expected imageCount === 1');

    const res1 = await watermarkService.processBatch(scan1.items, defaultOpts);
    assert(res1.cleanedCount === 1, `Expected cleanedCount=1, got ${res1.cleanedCount}`);
    assert(res1.failedCount === 0, `Expected failedCount=0, got ${res1.failedCount}`);

    const expectedSingleOut = path.join(singleDir, 'gemini_portrait_clean.png');
    assert(fs.existsSync(expectedSingleOut), `Expected output at ${expectedSingleOut}`);

    const cleanedRgba = await decodeImageToRgba(deps.ffmpegPath, expectedSingleOut, 1024 * 1024 * 4);
    const afterMae = computeRegionMae(singleAsset.groundTruth, cleanedRgba, 1024, singleAsset.pos);
    const untouchedTopLeftMae = computeRegionMae(singleAsset.groundTruth, cleanedRgba, 1024, {
      x: 20,
      y: 20,
      width: 120,
      height: 120,
    });

    console.log(
      `   ✓ Single file cleaned -> ${path.basename(expectedSingleOut)} | Corner MAE: ${beforeMae.toFixed(2)} -> ${afterMae.toFixed(2)} | Top-Left MAE: ${untouchedTopLeftMae.toFixed(4)}`
    );
    assert(beforeMae > 8, `Expected noticeable initial watermark MAE, got ${beforeMae}`);
    assert(afterMae < 1.5, `Expected restored corner MAE < 1.5, got ${afterMae}`);
    assert(untouchedTopLeftMae === 0, `Expected 0 untouched pixel change, got ${untouchedTopLeftMae}`);

    // -------------------------------------------------------------------------
    // 2. MULTIPLE FILES SCENARIO (Mixed PNG + JPG, 48x48 & 96x96 watermarks)
    // -------------------------------------------------------------------------
    console.log('\n2. Testing MULTIPLE FILES scenario (PNG + High-Quality JPG)...');
    const multiDir = path.join(testRoot, '02_multi_files');
    const multiPng = path.join(multiDir, 'shot_alpha.png');
    const multiJpg = path.join(multiDir, 'shot_beta.jpg');
    const assetA = await createWatermarkedImageAsset(deps.ffmpegPath, multiPng, 800, 600, true);
    const assetB = await createWatermarkedImageAsset(deps.ffmpegPath, multiJpg, 1280, 960, true);

    const scan2 = await watermarkService.scanPaths([multiPng, multiJpg]);
    assert(scan2.items.length === 2, `Expected 2 items, got ${scan2.items.length}`);

    const res2 = await watermarkService.processBatch(scan2.items, defaultOpts);
    assert(res2.cleanedCount === 2, `Expected cleanedCount=2, got ${res2.cleanedCount}`);
    assert(res2.failedCount === 0, `Expected failedCount=0, got ${res2.failedCount}`);

    const outMultiPng = path.join(multiDir, 'Gemini_Cleaned', 'shot_alpha.png');
    const outMultiJpg = path.join(multiDir, 'Gemini_Cleaned', 'shot_beta.jpg');
    assert(fs.existsSync(outMultiPng), 'Expected Gemini_Cleaned/shot_alpha.png');
    assert(fs.existsSync(outMultiJpg), 'Expected Gemini_Cleaned/shot_beta.jpg');

    const beforeMaePng = computeRegionMae(assetA.groundTruth, assetA.watermarked, 800, assetA.pos);
    const beforeMaeJpg = computeRegionMae(assetB.groundTruth, assetB.watermarked, 1280, assetB.pos);
    const decodedMultiPng = await decodeImageToRgba(deps.ffmpegPath, outMultiPng, 800 * 600 * 4);
    const decodedMultiJpg = await decodeImageToRgba(deps.ffmpegPath, outMultiJpg, 1280 * 960 * 4);
    const maePng = computeRegionMae(assetA.groundTruth, decodedMultiPng, 800, assetA.pos);
    const maeJpg = computeRegionMae(assetB.groundTruth, decodedMultiJpg, 1280, assetB.pos);
    console.log(
      `   ✓ Multiple files cleaned into Gemini_Cleaned/ | 48px PNG MAE: ${beforeMaePng.toFixed(2)} -> ${maePng.toFixed(2)} | 96px JPG MAE: ${beforeMaeJpg.toFixed(2)} -> ${maeJpg.toFixed(2)}`
    );
    assert(maePng < beforeMaePng * 0.25 && maePng < 6.0, `Expected strong PNG MAE drop, got ${beforeMaePng} -> ${maePng}`);
    assert(maeJpg < beforeMaeJpg * 0.25 && maeJpg < 3.5, `Expected strong JPG MAE drop, got ${beforeMaeJpg} -> ${maeJpg}`);

    // -------------------------------------------------------------------------
    // 3. SINGLE FOLDER SCENARIO (Recursive Subfolders + Unwatermarked Skip/Copy)
    // -------------------------------------------------------------------------
    console.log('\n3. Testing SINGLE FOLDER scenario (recursive subfolders + unwatermarked skip)...');
    const folderParent = path.join(testRoot, '03_single_folder');
    const clientFolder = path.join(folderParent, 'ClientShoot');
    await createWatermarkedImageAsset(
      deps.ffmpegPath,
      path.join(clientFolder, 'cover_1024.png'),
      1024,
      1024,
      true
    );
    await createWatermarkedImageAsset(
      deps.ffmpegPath,
      path.join(clientFolder, 'day2', 'reels', 'frame_800.png'),
      800,
      600,
      true
    );
    await createWatermarkedImageAsset(
      deps.ffmpegPath,
      path.join(clientFolder, 'reference_clean.png'),
      800,
      600,
      false // No watermark! Should be auto-detected as clean & skipped+copied
    );

    const scan3 = await watermarkService.scanPaths([clientFolder]);
    assert(scan3.items.length === 3, `Expected 3 items in folder, got ${scan3.items.length}`);
    assert(scan3.folderCount === 1, `Expected folderCount=1, got ${scan3.folderCount}`);

    const res3 = await watermarkService.processBatch(scan3.items, defaultOpts);
    assert(res3.cleanedCount === 2, `Expected cleanedCount=2, got ${res3.cleanedCount}`);
    assert(res3.skippedCount === 1, `Expected skippedCount=1, got ${res3.skippedCount}`);
    assert(res3.failedCount === 0, `Expected failedCount=0, got ${res3.failedCount}`);

    const cleanedFolderOut = path.join(folderParent, 'ClientShoot_Cleaned');
    assert(fs.existsSync(path.join(cleanedFolderOut, 'cover_1024.png')), 'Missing cover_1024.png');
    assert(
      fs.existsSync(path.join(cleanedFolderOut, 'day2', 'reels', 'frame_800.png')),
      'Missing nested day2/reels/frame_800.png'
    );
    assert(
      fs.existsSync(path.join(cleanedFolderOut, 'reference_clean.png')),
      'Missing copied unwatermarked reference_clean.png'
    );

    // Ensure re-scanning parent skips *_Cleaned output folder automatically
    const rescanParent = await watermarkService.scanPaths([folderParent]);
    assert(
      rescanParent.items.length === 3,
      `Expected *_Cleaned folder to be ignored during scan, got ${rescanParent.items.length} items`
    );
    console.log(
      `   ✓ Single folder processed -> ClientShoot_Cleaned/ (2 cleaned, 1 unwatermarked skipped & copied, *_Cleaned auto-ignored)`
    );

    // -------------------------------------------------------------------------
    // 4. MULTIPLE FOLDERS SCENARIO
    // -------------------------------------------------------------------------
    console.log('\n4. Testing MULTIPLE FOLDERS scenario ([Batch_One, Batch_Two])...');
    const multiFoldersRoot = path.join(testRoot, '04_multi_folders');
    const batchOne = path.join(multiFoldersRoot, 'Batch_One');
    const batchTwo = path.join(multiFoldersRoot, 'Batch_Two');

    await createWatermarkedImageAsset(deps.ffmpegPath, path.join(batchOne, 'img1.png'), 800, 600, true);
    await createWatermarkedImageAsset(
      deps.ffmpegPath,
      path.join(batchOne, 'sub', 'img2.png'),
      1024,
      1024,
      true
    );
    await createWatermarkedImageAsset(deps.ffmpegPath, path.join(batchTwo, 'poster.png'), 1200, 1200, true);

    const scan4 = await watermarkService.scanPaths([batchOne, batchTwo]);
    assert(scan4.folderCount === 2, `Expected folderCount=2, got ${scan4.folderCount}`);
    assert(scan4.items.length === 3, `Expected 3 items across 2 folders, got ${scan4.items.length}`);

    const res4 = await watermarkService.processBatch(scan4.items, defaultOpts);
    assert(res4.cleanedCount === 3, `Expected cleanedCount=3, got ${res4.cleanedCount}`);
    assert(res4.failedCount === 0, `Expected failedCount=0, got ${res4.failedCount}`);
    assert(
      fs.existsSync(path.join(multiFoldersRoot, 'Batch_One_Cleaned', 'img1.png')) &&
        fs.existsSync(path.join(multiFoldersRoot, 'Batch_One_Cleaned', 'sub', 'img2.png')) &&
        fs.existsSync(path.join(multiFoldersRoot, 'Batch_Two_Cleaned', 'poster.png')),
      'Expected Batch_One_Cleaned and Batch_Two_Cleaned hierarchy outputs'
    );
    console.log('   ✓ Multiple folders cleaned into Batch_One_Cleaned/ and Batch_Two_Cleaned/');

    // -------------------------------------------------------------------------
    // 5. VIDEO WATERMARK REMOVAL SCENARIO (1280x720 MP4 + Audio Preservation)
    // -------------------------------------------------------------------------
    console.log('\n5. Testing VIDEO watermark removal (1280x720 Veo MP4 + audio stream)...');
    const videoDir = path.join(testRoot, '05_video');
    const inputVideo = path.join(videoDir, 'veo_clip_720p.mp4');
    const videoSpec = await createWatermarkedVideoAsset(deps.ffmpegPath, inputVideo, 1280, 720, 15, 15);

    const beforeVideoFrame = await decodeImageToRgba(deps.ffmpegPath, inputVideo, 1280 * 720 * 4);
    const beforeScore = scoreVideoWatermarkFrame(
      { width: 1280, height: 720, data: beforeVideoFrame },
      videoSpec.pos,
      videoSpec.alphaMap
    );

    const scan5 = await watermarkService.scanPaths([inputVideo]);
    assert(scan5.videoCount === 1, 'Expected videoCount === 1');

    const res5 = await watermarkService.processBatch(scan5.items, defaultOpts);
    assert(res5.cleanedCount === 1, `Expected video cleanedCount=1, got ${res5.cleanedCount} (items: ${JSON.stringify(res5.items)})`);
    assert(res5.failedCount === 0, `Expected video failedCount=0, got ${res5.failedCount}`);

    const outVideo = path.join(videoDir, 'veo_clip_720p_clean.mp4');
    assert(fs.existsSync(outVideo), `Expected cleaned video at ${outVideo}`);

    // Probe streams to confirm 1280x720 video + preserved AAC audio track
    const probeJson = JSON.parse(
      execFileSync(
        deps.ffprobePath,
        ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', outVideo],
        { encoding: 'utf8' }
      )
    );
    const streams: Array<{ codec_type: string; width?: number; height?: number }> =
      probeJson.streams || [];
    const vStream = streams.find((s) => s.codec_type === 'video');
    const aStream = streams.find((s) => s.codec_type === 'audio');
    assert(vStream && vStream.width === 1280 && vStream.height === 720, 'Video stream dimensions mismatch');
    assert(Boolean(aStream), 'Expected audio stream to be preserved in cleaned MP4');

    const afterVideoFrame = await decodeImageToRgba(deps.ffmpegPath, outVideo, 1280 * 720 * 4);
    const afterScore = scoreVideoWatermarkFrame(
      { width: 1280, height: 720, data: afterVideoFrame },
      videoSpec.pos,
      videoSpec.alphaMap
    );
    console.log(
      `   ✓ Video cleaned (${res5.items[0].watermarkInfo}) | Audio preserved | Watermark confidence: ${beforeScore.confidence.toFixed(3)} -> ${afterScore.confidence.toFixed(3)}`
    );
    assert(
      afterScore.confidence < beforeScore.confidence * 0.45,
      `Expected video watermark confidence to drop sharply (${beforeScore.confidence} -> ${afterScore.confidence})`
    );

    // -------------------------------------------------------------------------
    // 6. RIGHT-CLICK CLI PARSING & MULTI-INSTANCE COALESCING
    // -------------------------------------------------------------------------
    console.log('\n6. Testing Right-Click CLI launch parsing & Windows multi-instance coalescing...');
    const macQuickAction = parseLaunchArgs([
      '/Applications/EXR Converter.app/Contents/MacOS/EXR Converter',
      '--watermark',
      singleFile,
      multiPng,
      multiJpg,
    ]);
    assert(macQuickAction !== null, 'Expected macQuickAction target');
    assert(
      macQuickAction.openWatermarkRemover === true,
      `Expected openWatermarkRemover=true, got ${macQuickAction.openWatermarkRemover}`
    );
    assert(macQuickAction.autoStart === true, 'Expected autoStart=true when paths are passed');
    assert(macQuickAction.paths?.length === 3, `Expected 3 paths, got ${macQuickAction.paths?.length}`);

    // Simulate Windows Explorer invoking multiple instances when user right-clicks 2 folders + 1 file
    const winInst1 = parseLaunchArgs(['C:\\Program Files\\EXR Converter\\EXR Converter.exe', '--watermark', batchOne]);
    const winInst2 = parseLaunchArgs(['C:\\Program Files\\EXR Converter\\EXR Converter.exe', '--watermark', batchTwo]);
    const winInst3 = parseLaunchArgs(['C:\\Program Files\\EXR Converter\\EXR Converter.exe', '--watermark', singleFile]);
    const winInstDup = parseLaunchArgs(['C:\\Program Files\\EXR Converter\\EXR Converter.exe', '--watermark', batchOne]);

    let coalesced: LaunchTarget | null = null;
    for (const inst of [winInst1, winInst2, winInst3, winInstDup]) {
      assert(inst !== null, 'Expected parsed Windows instance');
      coalesced = mergeLaunchTargets(coalesced, inst);
    }
    assert(
      coalesced !== null && coalesced.openWatermarkRemover === true,
      'Expected coalesced openWatermarkRemover=true'
    );
    assert(
      coalesced.paths?.length === 3,
      `Expected 3 deduplicated coalesced paths, got ${coalesced.paths?.length}`
    );

    // Ensure regular EXR right-click remains EXR mode (openWatermarkRemover falsy)
    const exrLaunch = parseLaunchArgs(['/Applications/EXR Converter', clientFolder]);
    assert(
      exrLaunch !== null && !exrLaunch.openWatermarkRemover,
      'Expected default folder launch to stay in EXR mode'
    );
    console.log('   ✓ Right-click CLI parser & multi-selection coalescing verified (macOS + Windows + EXR fallback)');

    console.log('\n=======================================================');
    console.log('✅ ALL 6 GEMINI WATERMARK REMOVER E2E TESTS PASSED!');
    console.log('=======================================================\n');
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

runWatermarkTests().catch((err) => {
  console.error('\n❌ WATERMARK REMOVER TEST SUITE FAILED:', err);
  process.exit(1);
});
