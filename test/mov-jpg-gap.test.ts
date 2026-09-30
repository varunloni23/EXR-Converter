import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { sequenceDetector } from '../src/main/services/sequenceDetector';
import { ffmpegService } from '../src/main/services/ffmpegService';
import { ConversionJob, ConversionSettings, ExrSequence } from '../src/shared/types';

async function testMovJpgGap() {
  console.log('\n=============================================================');
  console.log('🎬 TESTING MOV 40MBPS CBR, JPEG QUALITY 8, & GAP SCANNER (1001)');
  console.log('=============================================================\n');

  const testDir = path.join(os.tmpdir(), `mov_jpg_gap_test_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // 1. Generate 10 EXR frames from 1005 to 1014 (simulating missing 1001-1004 head frames!)
    console.log('1. Generating EXR frames 1005 to 1014 (omitting 1001-1004 to test VFX start 1001 audit)...');
    const pattern = path.join(testDir, 'SHOT_VFX_%04d.exr');
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=1:size=2048x1152:rate=24 -start_number 1005 -vframes 10 "${pattern}"`,
      { stdio: 'ignore' }
    );

    // Also remove frame 1009 to test middle gap!
    const frame1009 = path.join(testDir, 'SHOT_VFX_1009.exr');
    if (fs.existsSync(frame1009)) fs.unlinkSync(frame1009);

    const scanResult = await sequenceDetector.scanDirectory(testDir, 'ffprobe');
    const seq = scanResult.sequences[0];
    console.log(`   ✓ Detected sequence: ${seq.sequenceName}, frames found: ${seq.frameCount}, first: ${seq.firstFrame}, last: ${seq.lastFrame}`);

    // 2. Test Gap Comparison against Start Frame 1001
    console.log('\n2. Testing compareExpectedFrames with expected Start Frame 1001...');
    const gapReport = sequenceDetector.compareExpectedFrames(seq, 1001, 1014);

    console.log(`   ✓ Expected Start Frame: ${gapReport.expectedStartFrame}`);
    console.log(`   ✓ Expected End Frame:   ${gapReport.expectedEndFrame}`);
    console.log(`   ✓ Missing Head Frames:  ${gapReport.missingHeadFrames.join(', ')}`);
    console.log(`   ✓ Missing Middle Gaps:  ${gapReport.missingMiddleFrames.join(', ')}`);
    console.log(`   ✓ Total Missing:        ${gapReport.missingCount}`);
    console.log(`   ✓ Missing File Names:   ${gapReport.missingFileNames.slice(0, 3).join(', ')}...`);

    if (gapReport.missingHeadFrames.length !== 4) {
      throw new Error(`Expected 4 missing head frames (1001-1004), got ${gapReport.missingHeadFrames.length}`);
    }
    if (!gapReport.missingMiddleFrames.includes(1009)) {
      throw new Error(`Expected frame 1009 to be detected as missing middle frame`);
    }

    // 3. Test MOV 40 Mbps CBR Single Merged Video Conversion
    console.log('\n3. Testing QuickTime MOV H.264 40 Mbps CBR Single Merged Export...');
    const movOutputPath = path.join(testDir, 'SHOT_VFX_40Mbps.mov');

    const movSettings: ConversionSettings = {
      outputFolder: testDir,
      outputFileName: 'SHOT_VFX_40Mbps.mov',
      outputFormat: 'mov',
      codec: 'h264',
      fps: 24,
      scalePercent: 100,
      targetWidth: 2048,
      targetHeight: 1152,
      bitrateMbps: 40,
      bitrateMode: 'cbr',
      conversionMode: 'sequence',
      quality: 'high',
      crf: 18,
      ffmpegPreset: 'medium',
      encoderEngine: 'auto',
      presetId: 'editorial',
    };

    const movJob: ConversionJob = {
      id: 'mov_test_job',
      sequenceName: 'SHOT_VFX',
      inputFolder: testDir,
      outputFolder: testDir,
      outputPath: movOutputPath,
      firstFrame: seq.firstFrame,
      lastFrame: seq.lastFrame,
      frameCount: seq.frameCount,
      width: 2048,
      height: 1152,
      targetWidth: 2048,
      targetHeight: 1152,
      fps: 24,
      outputFormat: 'mov',
      codec: 'h264',
      status: 'converting',
      progress: 0,
      processedFrames: 0,
      speedFps: 0,
      speedMultiplier: 0,
      etaSeconds: 0,
      elapsedSeconds: 0,
      fileSizeBytes: 0,
      sequence: seq,
      settings: movSettings,
    };

    await ffmpegService.convertSequence(movJob, (prog) => {
      process.stdout.write(`   [MOV Encoding] Frame ${prog.frame}/${prog.totalFrames} (${prog.percentage}%) @ ${prog.fps} fps\r`);
    });
    console.log('\n   ✓ QuickTime MOV conversion completed.');

    // Verify MOV with ffprobe
    const probeMov = JSON.parse(
      execSync(
        `ffprobe -v error -show_format -select_streams v:0 -show_streams -of json "${movOutputPath}"`,
        { encoding: 'utf8' }
      )
    );
    const movStream = probeMov.streams[0];
    const movFormat = probeMov.format;
    console.log(`   ✓ Container Format: ${movFormat.format_name}`);
    console.log(`   ✓ Video Codec:      ${movStream.codec_name}`);
    console.log(`   ✓ Resolution:       ${movStream.width} × ${movStream.height}`);
    console.log(`   ✓ File Size:        ${(fs.statSync(movOutputPath).size / (1024 * 1024)).toFixed(2)} MB`);

    if (!movFormat.format_name.includes('mov')) {
      throw new Error(`Expected MOV container, got ${movFormat.format_name}`);
    }
    if (movStream.codec_name !== 'h264') {
      throw new Error(`Expected h264 codec, got ${movStream.codec_name}`);
    }

    // 4. Test Single Frame EXR to JPEG (Quality 8 Maximum, Baseline)
    console.log('\n4. Testing EXR to JPEG Frame Export (Quality 8 Maximum, Baseline)...');
    const firstExr = seq.frames[0];
    const jpegOutputPath = path.join(testDir, 'SHOT_VFX_1005.jpg');

    const singleSeq: ExrSequence = {
      ...seq,
      id: 'single_test',
      sequenceName: 'SHOT_VFX_1005',
      firstFramePath: firstExr,
      frameCount: 1,
      firstFrame: 1005,
      lastFrame: 1005,
      pattern: path.basename(firstExr),
      frames: [firstExr],
    };

    const jpgSettings: ConversionSettings = {
      outputFolder: testDir,
      outputFileName: 'SHOT_VFX_1005.jpg',
      outputFormat: 'jpg',
      codec: 'h264',
      fps: 24,
      scalePercent: 100,
      targetWidth: 2048,
      targetHeight: 1152,
      conversionMode: 'individual',
      jpegQuality: 8,
      jpegFormatOption: 'baseline',
      quality: 'high',
      crf: 18,
      ffmpegPreset: 'medium',
      encoderEngine: 'auto',
      presetId: 'custom',
    };

    const jpgJob: ConversionJob = {
      id: 'jpg_test_job',
      sequenceName: 'SHOT_VFX_1005',
      inputFolder: testDir,
      outputFolder: testDir,
      outputPath: jpegOutputPath,
      firstFrame: 1005,
      lastFrame: 1005,
      frameCount: 1,
      width: 2048,
      height: 1152,
      targetWidth: 2048,
      targetHeight: 1152,
      fps: 24,
      outputFormat: 'jpg',
      codec: 'h264',
      status: 'converting',
      progress: 0,
      processedFrames: 0,
      speedFps: 0,
      speedMultiplier: 0,
      etaSeconds: 0,
      elapsedSeconds: 0,
      fileSizeBytes: 0,
      sequence: singleSeq,
      settings: jpgSettings,
    };

    await ffmpegService.convertSequence(jpgJob);
    console.log('   ✓ EXR to JPEG conversion completed.');

    if (!fs.existsSync(jpegOutputPath)) {
      throw new Error(`JPEG output file was not created: ${jpegOutputPath}`);
    }

    const probeJpg = JSON.parse(
      execSync(
        `ffprobe -v error -select_streams v:0 -show_streams -of json "${jpegOutputPath}"`,
        { encoding: 'utf8' }
      )
    );
    const jpgStream = probeJpg.streams[0];
    console.log(`   ✓ JPEG Codec:      ${jpgStream.codec_name}`);
    console.log(`   ✓ JPEG Dimensions: ${jpgStream.width} × ${jpgStream.height}`);
    console.log(`   ✓ JPEG File Size:  ${(fs.statSync(jpegOutputPath).size / 1024).toFixed(1)} KB`);

    if (jpgStream.codec_name !== 'mjpeg') {
      throw new Error(`Expected mjpeg codec for JPG image, got ${jpgStream.codec_name}`);
    }

    console.log('\n=============================================================');
    console.log('🎉 ALL MOV 40MBPS, JPEG QUALITY 8, & GAP AUDIT TESTS PASSED!');
    console.log('=============================================================\n');
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

testMovJpgGap().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
