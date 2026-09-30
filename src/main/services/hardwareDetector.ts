import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { HardwareInfo } from '../../shared/types';
import { logger } from './logger';

const execAsync = promisify(exec);

export class HardwareDetector {
  private cachedInfo: HardwareInfo | null = null;

  public async detectHardware(ffmpegPath: string = 'ffmpeg'): Promise<HardwareInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
    const cpuCores = cpus.length || 4;
    const platform = os.platform();
    const arch = os.arch();

    let encodersOutput = '';
    try {
      const { stdout } = await execAsync(`"${ffmpegPath}" -encoders`);
      encodersOutput = stdout;
    } catch (err) {
      logger.warn('Failed to query ffmpeg -encoders for hardware acceleration', String(err));
    }

    const hasVideotoolbox = encodersOutput.includes('h264_videotoolbox');
    const hasNvenc = encodersOutput.includes('h264_nvenc');
    const hasQsv = encodersOutput.includes('h264_qsv');
    const hasAmf = encodersOutput.includes('h264_amf');
    const hasLibx264 = encodersOutput.includes('libx264') || true;

    const availableEncoders: HardwareInfo['availableEncoders'] = [
      {
        id: 'auto',
        name: 'Auto',
        description: 'Automatically chooses fastest reliable encoder',
        isAvailable: true,
      },
      {
        id: 'libx264',
        name: 'CPU — libx264',
        description: 'Industry-standard high-fidelity CPU software encoder',
        isAvailable: hasLibx264,
      },
      {
        id: 'videotoolbox',
        name: 'Apple VideoToolbox',
        description: 'Hardware accelerated encoding for Apple Silicon & Mac',
        isAvailable: hasVideotoolbox,
      },
      {
        id: 'nvenc',
        name: 'NVIDIA NVENC',
        description: 'Dedicated GPU hardware acceleration for NVIDIA GPUs',
        isAvailable: hasNvenc,
      },
      {
        id: 'qsv',
        name: 'Intel Quick Sync',
        description: 'Hardware encoding for Intel GPUs and processors',
        isAvailable: hasQsv,
      },
      {
        id: 'amf',
        name: 'AMD AMF',
        description: 'Advanced Media Framework for AMD Radeon GPUs',
        isAvailable: hasAmf,
      },
    ];

    let recommendedEncoder = 'libx264';
    let gpuName = undefined;

    if (platform === 'darwin' && hasVideotoolbox) {
      recommendedEncoder = 'videotoolbox';
      gpuName = cpuModel.includes('Apple') ? cpuModel : 'Apple VideoToolbox GPU';
    } else if (hasNvenc) {
      recommendedEncoder = 'nvenc';
      gpuName = 'NVIDIA GPU (NVENC)';
    } else if (hasQsv) {
      recommendedEncoder = 'qsv';
      gpuName = 'Intel Quick Sync';
    } else if (hasAmf) {
      recommendedEncoder = 'amf';
      gpuName = 'AMD Radeon GPU';
    }

    const hasGpuAcceleration = recommendedEncoder !== 'libx264';

    this.cachedInfo = {
      cpuModel,
      cpuCores,
      platform,
      arch,
      gpuName,
      hasGpuAcceleration,
      availableEncoders,
      activeEncoder: recommendedEncoder,
    };

    logger.info(
      'Hardware detected',
      `${cpuModel} (${cpuCores} cores) | Platform: ${platform} ${arch} | Recommended: ${recommendedEncoder}`
    );

    return this.cachedInfo;
  }

  public getRecommendedEncoder(): string {
    if (this.cachedInfo?.activeEncoder) {
      return this.cachedInfo.activeEncoder;
    }
    return os.platform() === 'darwin' ? 'videotoolbox' : 'libx264';
  }
}

export const hardwareDetector = new HardwareDetector();
