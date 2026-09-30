import path from 'path';
import { sequenceDetector } from '../src/main/services/sequenceDetector';
import { ffmpegService } from '../src/main/services/ffmpegService';

async function runTest() {
  console.log('🧪 Testing Context Menu Target Handling Logic...');
  const sampleFolder = path.join(process.cwd(), 'sample-sequence', 'SHOT_010');
  const sampleFile = path.join(sampleFolder, 'SHOT_010_1001.exr');

  // 1. Test Right-Click on Folder (Converts all frames in sequence)
  console.log('\n1. Simulating right-click on folder...');
  const folderResult = await sequenceDetector.scanDirectory(
    sampleFolder,
    ffmpegService.getFfprobePath(),
    true,
    false
  );
  console.log(`   ✓ Found ${folderResult.sequences.length} sequence(s)`);
  console.log(`   ✓ Total frames detected: ${folderResult.sequences[0]?.frameCount}`);
  if (folderResult.sequences[0]?.frameCount < 2) {
    throw new Error('Expected full sequence with multiple frames for folder right-click');
  }

  // 2. Test Right-Click on Single EXR File (Scans folder and detects full sequence)
  console.log('\n2. Simulating right-click on single EXR file (singleFileOnly = false)...');
  const singleResult = await sequenceDetector.scanDirectory(
    sampleFile,
    ffmpegService.getFfprobePath(),
    true,
    false
  );
  console.log(`   ✓ Found ${singleResult.sequences.length} sequence(s)`);
  console.log(`   ✓ Total frames detected: ${singleResult.sequences[0]?.frameCount}`);
  console.log(`   ✓ First frame: ${singleResult.sequences[0]?.firstFramePath}`);
  if (singleResult.sequences[0]?.frameCount < 2) {
    throw new Error(`Expected full sequence with multiple frames for single file right-click, got ${singleResult.sequences[0]?.frameCount}`);
  }

  // 3. Test Right-Click on Single MOV File (Detects video sequence)
  console.log('\n3. Simulating right-click on single MOV file...');
  const sampleMov = '/tmp/test_sample.mov';
  const movResult = await sequenceDetector.scanDirectory(
    sampleMov,
    ffmpegService.getFfprobePath(),
    true,
    false
  );
  console.log(`   ✓ Found ${movResult.sequences.length} sequence(s)`);
  console.log(`   ✓ Sequence name: ${movResult.sequences[0]?.sequenceName}`);
  console.log(`   ✓ Extension: ${movResult.sequences[0]?.extension}`);
  console.log(`   ✓ Frame count: ${movResult.sequences[0]?.frameCount}`);
  console.log(`   ✓ Resolution: ${movResult.sequences[0]?.width}x${movResult.sequences[0]?.height}`);
  if (movResult.sequences.length === 0 || movResult.sequences[0]?.extension !== '.mov') {
    throw new Error('Expected video sequence to be detected for MOV file');
  }

  // 4. Test Right-Click on MOV Folder (e.g. folder containing .mov)
  console.log('\n4. Simulating right-click on folder containing MOV...');
  const movFolder = '/tmp/test_mov_dir';
  const fs = await import('fs');
  if (!fs.existsSync(movFolder)) fs.mkdirSync(movFolder, { recursive: true });
  fs.copyFileSync(sampleMov, path.join(movFolder, 'STRM_E1_0370.mov'));

  const movFolderResult = await sequenceDetector.scanDirectory(
    movFolder,
    ffmpegService.getFfprobePath(),
    true,
    false
  );
  console.log(`   ✓ Found ${movFolderResult.sequences.length} sequence(s)`);
  console.log(`   ✓ Sequence name: ${movFolderResult.sequences[0]?.sequenceName}`);
  console.log(`   ✓ Extension: ${movFolderResult.sequences[0]?.extension}`);
  if (movFolderResult.sequences.length === 0) {
    throw new Error('Expected video sequence to be detected for folder containing MOV');
  }

  console.log('\n🎉 ALL CONTEXT MENU LOGIC TESTS (EXR & MOV) PASSED!\n');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
