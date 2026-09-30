import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const winDir = path.join(rootDir, 'bin', 'win');
const macDir = path.join(rootDir, 'bin', 'mac');

fs.mkdirSync(winDir, { recursive: true });
fs.mkdirSync(macDir, { recursive: true });

console.log('📦 EXR Converter — Binary Bundler Setup');
console.log('Target directories:');
console.log(`  Windows: ${winDir}`);
console.log(`  macOS:   ${macDir}\n`);

// 1. Prepare macOS local binary if available
const localMacFfmpeg = '/opt/homebrew/bin/ffmpeg';
const localMacFfprobe = '/opt/homebrew/bin/ffprobe';
const destMacFfmpeg = path.join(macDir, 'ffmpeg');
const destMacFfprobe = path.join(macDir, 'ffprobe');

if (fs.existsSync(localMacFfmpeg) && !fs.existsSync(destMacFfmpeg)) {
  console.log('🍏 Copying local macOS FFmpeg binary to bin/mac/ ...');
  try {
    fs.copyFileSync(localMacFfmpeg, destMacFfmpeg);
    fs.chmodSync(destMacFfmpeg, 0o755);
  } catch (e) {
    console.log(`Note: ${e.message}`);
  }
}
if (fs.existsSync(localMacFfprobe) && !fs.existsSync(destMacFfprobe)) {
  console.log('🍏 Copying local macOS FFprobe binary to bin/mac/ ...');
  try {
    fs.copyFileSync(localMacFfprobe, destMacFfprobe);
    fs.chmodSync(destMacFfprobe, 0o755);
  } catch (e) {
    console.log(`Note: ${e.message}`);
  }
}

// 2. Check if Windows binaries exist
const winFfmpeg = path.join(winDir, 'ffmpeg.exe');
const winFfprobe = path.join(winDir, 'ffprobe.exe');

if (fs.existsSync(winFfmpeg)) {
  console.log('✓ Windows ffmpeg.exe already present in bin/win/');
} else {
  console.log('⬇️  Windows ffmpeg.exe not found in bin/win/.');
  console.log('   Downloading official Windows x64 static FFmpeg build from BtbN / Gyan.dev ...');
  try {
    const tempZip = path.join(rootDir, 'bin', 'ffmpeg-win64.zip');
    const tempExtract = path.join(rootDir, 'bin', 'win-temp');

    console.log('   Fetching ffmpeg-master-latest-win64-gpl.zip (approx ~40-60 MB)...');
    execSync(
      `curl -L --progress-bar "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" -o "${tempZip}"`,
      { stdio: 'inherit' }
    );

    console.log('   Extracting ffmpeg.exe and ffprobe.exe ...');
    fs.mkdirSync(tempExtract, { recursive: true });
    if (process.platform === 'win32') {
      execSync(`tar -xf "${tempZip}" -C "${tempExtract}"`);
    } else {
      execSync(`unzip -q -o "${tempZip}" -d "${tempExtract}"`);
    }

    // Find extracted ffmpeg.exe
    const findBinary = (dir, name) => {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
          const res = findBinary(full, name);
          if (res) return res;
        } else if (f.toLowerCase() === name.toLowerCase()) {
          return full;
        }
      }
      return null;
    };

    const foundFfmpeg = findBinary(tempExtract, 'ffmpeg.exe');
    const foundFfprobe = findBinary(tempExtract, 'ffprobe.exe');

    if (foundFfmpeg) {
      fs.copyFileSync(foundFfmpeg, winFfmpeg);
      console.log(`   ✓ Installed ${winFfmpeg}`);
    }
    if (foundFfprobe) {
      fs.copyFileSync(foundFfprobe, winFfprobe);
      console.log(`   ✓ Installed ${winFfprobe}`);
    }

    // Clean up temporary files
    try {
      fs.unlinkSync(tempZip);
      fs.rmSync(tempExtract, { recursive: true, force: true });
    } catch (e) {}

    console.log('✨ Windows FFmpeg bundling preparation complete!\n');
  } catch (err) {
    console.error('⚠️ Could not automatically download Windows FFmpeg:', err.message);
    console.log('💡 Manual option: You can place ffmpeg.exe and ffprobe.exe directly inside bin/win/ at any time.');
  }
}
