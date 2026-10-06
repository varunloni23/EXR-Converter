import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { sequenceDetector } from '../src/main/services/sequenceDetector';
import { ConversionManager } from '../src/main/services/conversionManager';
import { ffmpegService } from '../src/main/services/ffmpegService';

async function runVerification() {
  console.log('====================================================');
  console.log('🧪 VERIFYING USER CRITICAL FIXES');
  console.log('====================================================');

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'exr_verify_fixes_'));
  const shotFolder = path.join(tmpBase, 'SC_24_SH_0220');
  fs.mkdirSync(shotFolder, { recursive: true });

  console.log('\n1. Creating 3 sample EXR frames starting at frame 50 (NOT 1001)...');
  // Frames 0050, 0051, 0052 at 1920x1080
  for (const f of ['0050', '0051', '0052']) {
    const exrPath = path.join(shotFolder, `SC_24_SH_0220_${f}.exr`);
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=0.04:size=1920x1080:rate=24 -frames:v 1 "${exrPath}"`,
      { stdio: 'ignore' }
    );
  }

  // Scan folder
  console.log('2. Scanning sequence...');
  const scan = await sequenceDetector.scanDirectory(shotFolder);
  if (!scan.sequences.length) throw new Error('Failed to detect sequence');
  const seq = scan.sequences[0];
  console.log(`   ✓ Detected: ${seq.sequenceName}, firstFrame=${seq.firstFrame}, expectedStart=${seq.expectedStartFrame}`);
  if (seq.firstFrame !== 50) throw new Error(`Expected firstFrame=50, got ${seq.firstFrame}`);
  if (seq.expectedStartFrame !== 50) throw new Error(`Expected expectedStartFrame=50, got ${seq.expectedStartFrame}`);

  // Test MOV Output Placement (Must NOT make SC_24_SH_0220_MOV folder!)
  console.log('\n3. Testing MOV Output Placement...');
  const cm = new ConversionManager();
  const movJob = cm.createJob(seq, {
    outputFormat: 'mov',
    codec: 'h264',
    fps: 24,
    scalePercent: 50,
  });

  console.log(`   ✓ MOV outputPath: ${movJob.outputPath}`);
  console.log(`   ✓ MOV outputFolder: ${movJob.outputFolder}`);

  // Target folder must be tmpBase (the parent of SC_24_SH_0220), NOT SC_24_SH_0220_MOV!
  if (path.basename(movJob.outputFolder) === 'SC_24_SH_0220_MOV') {
    throw new Error('FAIL: MOV still creating SC_24_SH_0220_MOV folder!');
  }
  if (movJob.outputFolder !== tmpBase) {
    throw new Error(`FAIL: MOV outputFolder should be parent ${tmpBase}, got ${movJob.outputFolder}`);
  }

  await cm.startJob(movJob.id);
  if (!fs.existsSync(movJob.outputPath)) throw new Error('MOV output file was not created!');
  console.log('   ✓ MOV converted successfully directly in parent folder!');

  // Check no report file was created in movJob.outputFolder
  const movDirFiles = fs.readdirSync(movJob.outputFolder);
  const movReportFiles = movDirFiles.filter(f => f.includes('REPORT'));
  if (movReportFiles.length > 0) {
    throw new Error(`FAIL: Found report files in MOV output: ${movReportFiles.join(', ')}`);
  }
  console.log('   ✓ No report files generated in MOV folder!');

  // Test JPG Conversion (100% resolution, exact filenames, not dark)
  console.log('\n4. Testing JPG Conversion (100% resolution, sRGB color, exact filenames)...');
  const jpgJob = cm.createJob(seq, {
    outputFormat: 'jpg',
    scalePercent: 100,
    jpegQuality: 8,
  });

  console.log(`   ✓ JPG targetWidth: ${jpgJob.targetWidth}, targetHeight: ${jpgJob.targetHeight}`);
  if (jpgJob.targetWidth !== 1920 || jpgJob.targetHeight !== 1080) {
    throw new Error(`FAIL: JPG resolution changed! Expected 1920x1080, got ${jpgJob.targetWidth}x${jpgJob.targetHeight}`);
  }

  await cm.startJob(jpgJob.id);

  // Check generated JPG files
  const jpgFiles = fs.readdirSync(jpgJob.outputFolder).filter(f => f.endsWith('.jpg')).sort();
  console.log(`   ✓ Generated JPG files: ${jpgFiles.join(', ')}`);

  const expectedJpgs = [
    'SC_24_SH_0220_0050.jpg',
    'SC_24_SH_0220_0051.jpg',
    'SC_24_SH_0220_0052.jpg',
  ];

  for (const expected of expectedJpgs) {
    if (!jpgFiles.includes(expected)) {
      throw new Error(`FAIL: Missing expected JPG ${expected}. Found: ${jpgFiles.join(', ')}`);
    }
  }
  console.log('   ✓ Exact 1:1 filename parity confirmed (frames 50, 51, 52 preserved)!');

  // Check luminance of generated JPG (Must NOT be dark!)
  const sampleJpg = path.join(jpgJob.outputFolder, 'SC_24_SH_0220_0050.jpg');
  const yavg = execSync(
    `ffprobe -v error -show_entries frame=pkt_pts_time -f lavfi -i "movie=${sampleJpg},signalstats" -show_entries frame_tags=lavfi.signalstats.YAVG -of default=noprint_wrappers=1:nokey=1`
  ).toString().trim();
  console.log(`   ✓ Average Luminance YAVG: ${yavg}`);
  const numYavg = parseFloat(yavg);
  if (numYavg < 40) {
    throw new Error(`FAIL: JPG is too dark! YAVG = ${numYavg}`);
  }
  console.log('   ✓ JPG is bright and vibrant with proper sRGB gamma!');

  // Check no report files in JPG folder
  const jpgDirFiles = fs.readdirSync(jpgJob.outputFolder);
  const jpgReportFiles = jpgDirFiles.filter(f => f.includes('REPORT'));
  if (jpgReportFiles.length > 0) {
    throw new Error(`FAIL: Found report files in JPG folder: ${jpgReportFiles.join(', ')}`);
  }
  console.log('   ✓ No report files generated in JPG folder!');

  // Clean up
  fs.rmSync(tmpBase, { recursive: true, force: true });
  console.log('\n====================================================');
  console.log('🎉 ALL USER FIXES VERIFIED 100% SUCCEEDED!');
  console.log('====================================================');
}

runVerification().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
