import fs from 'fs';
import path from 'path';

export interface LaunchTarget {
  path: string;
  paths?: string[];
  autoStart: boolean;
  format?: 'mov' | 'jpg' | 'mp4';
  mode?: 'sequence' | 'individual';
  openComparison?: boolean;
  openWatermarkRemover?: boolean;
  isBackground?: boolean;
}

export function isAppOrSystemArg(arg: string): boolean {
  if (!arg || arg.startsWith('-')) return true;
  const base = path.basename(arg).toLowerCase();
  const lower = arg.toLowerCase().replace(/\\/g, '/');

  // Electron / App executable names
  if (base === 'electron' || base === 'electron.exe') return true;
  if (
    base === 'exr converter' ||
    base === 'exr converter.exe' ||
    base === 'exr-converter' ||
    base === 'exr-converter.exe'
  ) {
    return true;
  }
  if (
    lower.includes('node_modules/electron') ||
    lower.endsWith('/electron') ||
    lower.endsWith('/electron.exe')
  ) {
    return true;
  }
  if (
    lower.includes('.app/contents/macos/electron') ||
    lower.includes('.app/contents/macos/exr converter')
  ) {
    return true;
  }

  // Working directory, source scripts, or config files
  if (arg === '.' || path.resolve(arg) === path.resolve(process.cwd())) return true;
  if (
    base.endsWith('.js') ||
    base.endsWith('.ts') ||
    base.endsWith('.mjs') ||
    base.endsWith('.cjs') ||
    base.endsWith('.json') ||
    base.endsWith('.html') ||
    base.endsWith('.css') ||
    base.endsWith('.map') ||
    base.endsWith('.lock')
  ) {
    return true;
  }

  // URLs or devtools
  if (arg.startsWith('chrome-extension://') || arg.startsWith('devtools://')) return true;

  return false;
}

export function parseLaunchArgs(argv: string[]): LaunchTarget | null {
  const paths: string[] = [];
  let format: 'mov' | 'jpg' | 'mp4' | undefined;
  let mode: 'sequence' | 'individual' | undefined;
  const isBackground = argv.includes('--background') || argv.includes('-b');
  const isCompare = argv.includes('--compare') || argv.includes('-c');
  const isWatermark =
    argv.includes('--watermark') ||
    argv.includes('--remove-watermark') ||
    argv.includes('-w');

  // Skip argv[0] which is always the executable binary itself
  const candidateArgs = argv.slice(1);

  for (let i = 0; i < candidateArgs.length; i++) {
    const arg = candidateArgs[i];
    if ((arg === '--format' || arg === '-f') && i + 1 < candidateArgs.length) {
      const f = candidateArgs[i + 1].toLowerCase();
      if (f === 'mov' || f === 'jpg' || f === 'jpeg' || f === 'mp4') {
        format = (f === 'jpeg' ? 'jpg' : f) as 'mov' | 'jpg' | 'mp4';
      }
      i++;
      continue;
    }
    if (arg.startsWith('--format=')) {
      const f = arg.split('=')[1]?.toLowerCase();
      if (f === 'mov' || f === 'jpg' || f === 'jpeg' || f === 'mp4') {
        format = (f === 'jpeg' ? 'jpg' : f) as 'mov' | 'jpg' | 'mp4';
      }
      continue;
    }
    if (arg === '--mode' && i + 1 < candidateArgs.length) {
      const m = candidateArgs[i + 1].toLowerCase();
      if (m === 'sequence' || m === 'individual') {
        mode = m as 'sequence' | 'individual';
      }
      i++;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      const m = arg.split('=')[1]?.toLowerCase();
      if (m === 'sequence' || m === 'individual') {
        mode = m as 'sequence' | 'individual';
      }
      continue;
    }

    if (isAppOrSystemArg(arg)) continue;

    try {
      if (fs.existsSync(arg)) {
        const stat = fs.statSync(arg);
        if (stat.isDirectory()) {
          paths.push(path.resolve(arg));
        } else if (stat.isFile()) {
          const ext = path.extname(arg).toLowerCase();
          const validExts = [
            '.exr',
            '.mov',
            '.mp4',
            '.mkv',
            '.avi',
            '.m4v',
            '.webm',
            '.jpg',
            '.jpeg',
            '.png',
            '.webp',
            '.bmp',
            '.tif',
            '.tiff',
          ];
          if (validExts.includes(ext)) {
            paths.push(path.resolve(arg));
          }
        }
      }
    } catch {
      // Ignore unreadable path
    }
  }

  if (isWatermark) {
    return {
      path: paths[0] || '',
      paths,
      autoStart: paths.length > 0,
      openWatermarkRemover: true,
      isBackground: paths.length > 0 ? true : isBackground,
    };
  }

  if (isCompare) {
    return {
      path: paths[0] || '',
      paths,
      autoStart: false,
      openComparison: true,
      isBackground: false,
    };
  }

  if (paths.length === 0) return null;
  return {
    path: paths[0],
    paths,
    autoStart: true,
    format,
    mode,
    isBackground: Boolean(format || mode || isBackground),
  };
}

export function mergeLaunchTargets(
  existing: LaunchTarget | null,
  incoming: LaunchTarget
): LaunchTarget {
  if (!existing) {
    const incomingPaths =
      incoming.paths && incoming.paths.length > 0
        ? [...incoming.paths]
        : incoming.path
        ? [incoming.path]
        : [];
    return {
      ...incoming,
      path: incomingPaths[0] || incoming.path,
      paths: incomingPaths,
    };
  }

  const sameAction =
    Boolean(existing.openWatermarkRemover) === Boolean(incoming.openWatermarkRemover) &&
    Boolean(existing.openComparison) === Boolean(incoming.openComparison) &&
    existing.format === incoming.format &&
    existing.mode === incoming.mode;

  if (!sameAction) {
    return incoming;
  }

  const combined = new Set<string>([
    ...(existing.paths && existing.paths.length > 0
      ? existing.paths
      : existing.path
      ? [existing.path]
      : []),
    ...(incoming.paths && incoming.paths.length > 0
      ? incoming.paths
      : incoming.path
      ? [incoming.path]
      : []),
  ]);
  const mergedPaths = [...combined].filter(Boolean);

  return {
    ...existing,
    ...incoming,
    path: mergedPaths[0] || incoming.path || existing.path,
    paths: mergedPaths,
    autoStart: existing.autoStart || incoming.autoStart,
    isBackground: Boolean(existing.isBackground || incoming.isBackground),
  };
}

