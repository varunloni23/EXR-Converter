import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { sequenceDetector } from '../src/main/services/sequenceDetector';
import { thumbnailService } from '../src/main/services/thumbnailService';
import { ffmpegService } from '../src/main/services/ffmpegService';
import { ConversionJob, ConversionSettings, ExrSequence } from '../src/shared/types';

async function runE2eTests() {
  console.log('\n=============================================');
  console.log('🎬 RUNNING EXR CONVERTER END-TO-END TESTS');
  console.log('=============================================\n');

  const testDir = path.join(os.tmpdir(), `exr_test_suite_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // 1. Generate 24 real EXR frames using FFmpeg
    console.log('1. Generating 24 real EXR frames at 1920x1080 (frames 1001-1024)...');
    const pattern = path.join(testDir, 'SHOT_010_%04d.exr');
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=1:size=1920x1080:rate=24 -start_number 1001 -vframes 24 "${pattern}"`,
      { stdio: 'ignore' }
    );

    const files = fs.readdirSync(testDir).filter((f) => f.endsWith('.exr'));
    console.log(`   ✓ Created ${files.length} EXR frames in ${testDir}`);
    if (files.length !== 24) throw new Error(`Expected 24 files, got ${files.length}`);

    // 2. Test Sequence Detection
    console.log('\n2. Testing Sequence Detector...');
    const scanResult = await sequenceDetector.scanDirectory(testDir, 'ffprobe');
    console.log(`   ✓ Found ${scanResult.sequences.length} sequence(s)`);
    if (scanResult.sequences.length !== 1) throw new Error('Expected 1 sequence');

    const seq = scanResult.sequences[0];
    console.log(`   ✓ Sequence name: ${seq.sequenceName}`);
    console.log(`   ✓ Frame range: ${seq.firstFrame} → ${seq.lastFrame} (${seq.frameCount} frames)`);
    console.log(`   ✓ Resolution: ${seq.width} × ${seq.height}`);
    console.log(`   ✓ Has missing frames: ${seq.hasMissingFrames}`);

    if (seq.sequenceName !== 'SHOT_010') throw new Error(`Wrong name: ${seq.sequenceName}`);
    if (seq.firstFrame !== 1001) throw new Error(`Wrong firstFrame: ${seq.firstFrame}`);
    if (seq.lastFrame !== 1024) throw new Error(`Wrong lastFrame: ${seq.lastFrame}`);
    if (seq.frameCount !== 24) throw new Error(`Wrong count: ${seq.frameCount}`);
    if (seq.width !== 1920 || seq.height !== 1080) throw new Error(`Wrong resolution: ${seq.width}x${seq.height}`);
    if (seq.hasMissingFrames) throw new Error('Should not have missing frames');

    // 3. Test Missing Frame Detection
    console.log('\n3. Testing Missing Frame Detection...');
    const frameToDelete = path.join(testDir, 'SHOT_010_1012.exr');
    fs.unlinkSync(frameToDelete);
    const scanMissing = await sequenceDetector.scanDirectory(testDir, 'ffprobe');
    const seqMissing = scanMissing.sequences[0];
    console.log(`   ✓ Missing frames detected: ${seqMissing.missingFrames.join(', ')}`);
    if (!seqMissing.hasMissingFrames || !seqMissing.missingFrames.includes(1012)) {
      throw new Error('Failed to detect missing frame 1012');
    }

    // Restore frame
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=0.1:size=1920x1080:rate=24 -vframes 1 "${frameToDelete}"`,
      { stdio: 'ignore' }
    );
    console.log('   ✓ Restored missing frame.');

    // 4. Test Thumbnail Generation
    console.log('\n4. Testing Local Thumbnail Generation...');
    const thumbUrl = await thumbnailService.generateThumbnail(seq.firstFramePath, 'ffmpeg', 480);
    if (!thumbUrl || !thumbUrl.startsWith('data:image/jpeg;base64,')) {
      throw new Error('Thumbnail generation failed or returned invalid data URL');
    }
    console.log(`   ✓ Thumbnail generated successfully (${thumbUrl.length} chars base64)`);

    // 5. Test Resolution Scaling Calculator
    console.log('\n5. Testing Resolution Scale Calculator (50% default)...');
    const scale50 = ffmpegService.calculateDimensions(1920, 1080, 50);
    console.log(`   ✓ 1920x1080 at 50% = ${scale50.targetWidth}x${scale50.targetHeight}`);
    if (scale50.targetWidth !== 960 || scale50.targetHeight !== 540) throw new Error('Scaling calculation incorrect');

    const scale4k = ffmpegService.calculateDimensions(3840, 2160, 50);
    console.log(`   ✓ 3840x2160 at 50% = ${scale4k.targetWidth}x${scale4k.targetHeight}`);
    if (scale4k.targetWidth !== 1920 || scale4k.targetHeight !== 1080) throw new Error('4K scaling incorrect');

    console.log('\n5b. Testing MOV 1920x1080 Fit (No Crop)...');
    const mov169 = ffmpegService.calculateMovDimensions(3840, 2160);
    console.log(`   ✓ 4K 16:9 (3840x2160) -> ${mov169.targetWidth}x${mov169.targetHeight}`);
    if (mov169.targetWidth !== 1920 || mov169.targetHeight !== 1080) throw new Error('MOV 16:9 fit incorrect');

    const movScope = ffmpegService.calculateMovDimensions(3840, 1606);
    console.log(`   ✓ Scope 2.39:1 (3840x1606) -> ${movScope.targetWidth}x${movScope.targetHeight} (Fit to Width, No Crop)`);
    if (movScope.targetWidth !== 1920 || movScope.targetHeight > 1080) throw new Error('MOV Scope fit incorrect');

    const mov43 = ffmpegService.calculateMovDimensions(2048, 1536);
    console.log(`   ✓ 4:3 Academy (2048x1536) -> ${mov43.targetWidth}x${mov43.targetHeight} (Fit to Height, No Crop)`);
    if (mov43.targetHeight !== 1080 || mov43.targetWidth > 1920) throw new Error('MOV 4:3 fit incorrect');

    // 6. Test Real FFmpeg Conversion to 50% scale H.264 MP4
    console.log('\n6. Executing Real Conversion to H.264 MP4 (50% scale)...');
    const outputVideoPath = path.join(testDir, 'SHOT_010.mp4');

    const jobSettings: ConversionSettings = {
      outputFolder: testDir,
      outputFileName: 'SHOT_010.mp4',
      outputFormat: 'mp4',
      codec: 'h264',
      fps: 24,
      scalePercent: 50,
      targetWidth: 960,
      targetHeight: 540,
      quality: 'high',
      crf: 18,
      ffmpegPreset: 'medium',
      encoderEngine: 'libx264',
      presetId: 'editorial',
    };

    const conversionJob: ConversionJob = {
      id: 'test_job_1',
      sequenceName: 'SHOT_010',
      inputFolder: testDir,
      outputFolder: testDir,
      outputPath: outputVideoPath,
      firstFrame: 1001,
      lastFrame: 1024,
      frameCount: 24,
      width: 1920,
      height: 1080,
      targetWidth: 960,
      targetHeight: 540,
      fps: 24,
      outputFormat: 'mp4',
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
      settings: jobSettings,
    };

    let progressCalls = 0;
    await ffmpegService.convertSequence(conversionJob, (prog) => {
      progressCalls++;
      process.stdout.write(`   [FFmpeg Progress] Frame: ${prog.frame}/${prog.totalFrames} (${prog.percentage}%) @ ${prog.fps} fps\r`);
    });
    console.log('\n   ✓ FFmpeg conversion process completed successfully.');

    // 7. Verify Output Video with ffprobe
    console.log('\n7. Verifying Output MP4 Video with FFprobe...');
    if (!fs.existsSync(outputVideoPath)) {
      throw new Error(`Output video not found at: ${outputVideoPath}`);
    }

    const probeOutput = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,duration -of json "${outputVideoPath}"`,
      { encoding: 'utf8' }
    );
    const probeData = JSON.parse(probeOutput);
    const videoStream = probeData.streams[0];

    console.log(`   ✓ Codec: ${videoStream.codec_name}`);
    console.log(`   ✓ Resolution: ${videoStream.width} × ${videoStream.height}`);
    console.log(`   ✓ Frame Rate: ${videoStream.r_frame_rate}`);
    console.log(`   ✓ Output File Size: ${(fs.statSync(outputVideoPath).size / 1024).toFixed(1)} KB`);

    if (videoStream.codec_name !== 'h264') throw new Error(`Expected h264, got ${videoStream.codec_name}`);
    if (videoStream.width !== 960 || videoStream.height !== 540) {
      throw new Error(`Expected 960x540, got ${videoStream.width}x${videoStream.height}`);
    }
    if (videoStream.r_frame_rate !== '24/1') throw new Error(`Expected 24 fps, got ${videoStream.r_frame_rate}`);

    console.log('\n=============================================');
    console.log('🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================\n');
  } finally {
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
      console.log(`Cleaned up test directory: ${testDir}`);
    } catch (e) {}
  }
}

runE2eTests().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
