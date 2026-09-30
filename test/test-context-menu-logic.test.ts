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

  // 2. Test Right-Click on Single EXR File (Converts ONLY that 1 file)
  console.log('\n2. Simulating right-click on single EXR file with singleFileOnly = true...');
  const singleResult = await sequenceDetector.scanDirectory(
    sampleFile,
    ffmpegService.getFfprobePath(),
    true,
    true
  );
  console.log(`   ✓ Found ${singleResult.sequences.length} sequence(s)`);
  console.log(`   ✓ Total frames detected: ${singleResult.sequences[0]?.frameCount}`);
  console.log(`   ✓ Target file: ${singleResult.sequences[0]?.firstFramePath}`);
  if (singleResult.sequences[0]?.frameCount !== 1) {
    throw new Error(`Expected exactly 1 frame for single file right-click, got ${singleResult.sequences[0]?.frameCount}`);
  }
  if (singleResult.sequences[0]?.firstFramePath !== sampleFile) {
    throw new Error(`Target path mismatch: expected ${sampleFile}, got ${singleResult.sequences[0]?.firstFramePath}`);
  }

  console.log('\n🎉 ALL CONTEXT MENU LOGIC TESTS PASSED!\n');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
