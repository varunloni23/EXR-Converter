# EXR Converter 🎬

> **Convert EXR image sequences into editorial-ready video.**  
> *Fast • 100% Local • Studio Confidentiality Safe*

EXR Converter is a high-performance desktop application built for film, visual effects (VFX), and post-production editorial teams. It automates the conversion of multi-frame OpenEXR image sequences into lightweight, frame-accurate H.264 MP4/MOV preview videos for editing, dailies, and review without requiring cloud uploads or complex encoding tools.

---

## 🚀 Key Features

* **Instant EXR Sequence Detection**:
  * Automatically parses frame numbers, sequence names, padding, and contiguous ranges.
  * Supports dot (`render.0001.exr`), underscore (`SHOT_010_1001.exr`), and plain frame numbering.
  * Multi-shot folder detection for batch project structures.
* **Missing Frame Detection & Diagnostics**:
  * Detects missing frame gaps (e.g. frames 1047, 1092, 1134 missing) before conversion starts.
  * Provides an inspector modal with continuous fallback options.
* **Editorial Default Standard**:
  * Defaults to **50% original resolution** (e.g., 3840×2160 → 1920×1080) preserving aspect ratio.
  * Ensures even macroblock dimensions (`yuv420p` alignment).
  * 24 FPS standard editorial default.
* **Local First-Frame Thumbnail Generator**:
  * Real-time JPEG preview generated locally directly from the first EXR frame.
* **High-Precision Progress System**:
  * Real-time progress bar with current frame number, processed count, speed (FPS & multiplier), and estimated time remaining (ETA).
  * Safe pause/resume (`SIGSTOP`/`SIGCONT`) and cancel controls with partial file cleanup.
* **Dark Cinematic Studio UI**:
  * Tailored dark palette (`#0B0D10` background, `#12161B` cards, `#7C5CFF` electric purple accents, `#35C98A` success mint).
  * Designed for long-term daily professional use on VFX workstations.
* **Hardware & Acceleration Detection**:
  * Detects CPU model, core count, and hardware-accelerated encoders (Apple VideoToolbox, NVIDIA NVENC, Intel QuickSync, AMD AMF).
* **Technical Log Console**:
  * Real-time engine event logger with search, clipboard copy, and log folder reveal.
* **Safe Local Execution**:
  * 100% offline and air-gapped network compatible.
  * Electron `contextIsolation: true` and `nodeIntegration: false`.

---

## 🛠️ Tech Stack

* **Desktop Runtime**: Electron 34
* **Frontend**: React 18, TypeScript, Tailwind CSS
* **Icons**: Lucide Icons
* **Conversion Engine**: FFmpeg (with native OpenEXR decoding & `libx264`/`h264_videotoolbox`)
* **Build System**: Vite 6, Electron Builder

---

## 🏁 Quick Start

### Prerequisites
* [Node.js](https://nodejs.org/) v18+ (Tested on v22)
* [FFmpeg](https://ffmpeg.org/) (macOS: `brew install ffmpeg`)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
```bash
npm run dev
```

### 3. Run Automated End-to-End Test Suite
Tests real EXR generation, sequence detection, missing frames, thumbnail extraction, 50% scale calculation, and real FFmpeg H.264 MP4 conversion:
```bash
npm run test:e2e
```

### 4. Build Production Desktop App
```bash
npm run build
```

---

## 🎬 Testing with Included Sample VFX Shot

A ready-to-test 48-frame sample sequence is pre-generated in:
```text
sample-sequence/SHOT_010/
├── SHOT_010_1001.exr
├── SHOT_010_1002.exr
└── ...
└── SHOT_010_1048.exr
```
Simply drag and drop this folder into the application, or click **"Load Sample VFX Shot"** on the empty state screen.

---

## 📁 Project Architecture

```text
converter/
├── src/
│   ├── main/
│   │   ├── main.ts                    # Electron app lifecycle & secure IPC handlers
│   │   └── services/
│   │       ├── sequenceDetector.ts    # EXR sequence scanner & header parser
│   │       ├── ffmpegService.ts       # Dynamic FFmpeg command builder & progress engine
│   │       ├── conversionManager.ts   # Queue manager & job state machine
│   │       ├── fileService.ts         # Folder dialogs, collisions, and disk space
│   │       ├── hardwareDetector.ts    # CPU & GPU encoder hardware detection
│   │       ├── thumbnailService.ts    # First-frame EXR preview generator
│   │       └── logger.ts              # Structured session logging
│   ├── preload/
│   │   └── preload.ts                 # Context bridge exposing safe IPC API
│   ├── renderer/
│   │   ├── App.tsx                    # Main state machine & UI workflow
│   │   ├── components/                # Modular studio UI components
│   │   │   ├── Header.tsx             # Studio header, hardware badge & shortcuts
│   │   │   ├── DropZone.tsx           # Drag & drop empty state
│   │   │   ├── SequenceCard.tsx       # Sequence metadata & first frame thumbnail
│   │   │   ├── SettingsCard.tsx       # Resolution, FPS, preset & codec options
│   │   │   ├── OutputFolderPicker.tsx # Destination directory & collision checker
│   │   │   ├── ProgressCard.tsx       # Real-time progress, speed, ETA, pause/cancel
│   │   │   ├── CompletionCard.tsx     # Conversion complete summary & video open
│   │   │   ├── ErrorCard.tsx          # Actionable error diagnostics
│   │   │   ├── MissingFramesModal.tsx # Missing frames inspector & confirmation
│   │   │   ├── LogViewerModal.tsx     # Real-time technical log modal
│   │   │   ├── SettingsModal.tsx      # Hardware detection & engine selector
│   │   │   ├── CollisionModal.tsx     # Output file replacement / auto-rename
│   │   │   ├── CancelModal.tsx        # Cancellation confirmation
│   │   │   ├── HelpModal.tsx          # VFX editorial tips and shortcuts
│   │   │   └── QueueDrawer.tsx        # Batch queue list
│   │   ├── index.css                  # Studio dark palette & animations
│   │   └── main.tsx                   # React root entry
│   └── shared/
│       └── types.ts                   # Unified TypeScript types
├── sample-sequence/                   # Sample VFX shot for immediate testing
├── test/
│   └── e2e-conversion.test.ts         # Comprehensive automated e2e test suite
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── electron-builder.yml
```

---

## 🔒 Security & Privacy

Because this application processes confidential film and VFX intellectual property:
* **No cloud uploads**: All operations occur strictly on the local machine.
* **No analytics or tracking**: Zero telemetry or network requests.
* **Air-gapped compatible**: Works 100% offline without an active internet connection.
* **Secure Electron IPC**: Sandboxed renderer with `contextIsolation: true` and `nodeIntegration: false`.

---

## ⚖️ License
MIT License
