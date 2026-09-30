# 🤖 EXR to Video Converter – Quick Requirements

## 🏗️ Tech Stack

**Recommended MVP stack:**

* **Desktop:** Electron + React + TypeScript
* **UI:** Tailwind CSS + shadcn/ui
* **Conversion Engine:** FFmpeg
* **EXR Processing:** OpenEXR/FFmpeg EXR decoder
* **Video:** H.264 (`libx264`)
* **Output:** MP4 initially; MOV can use the same H.264 encoding pipeline
* **File Selection:** Electron native folder/file dialogs
* **Processing:** Local machine — **no cloud upload**
* **Build:** Electron Builder

**Why local processing?**
EXR files can be extremely large and contain sensitive film/VFX material. Uploading them to a server would be slower, expensive, and a security concern. The app should process everything directly on the editor's workstation.

---

## 🔑 Environment Variables

```env
# No API key required for the MVP

APP_NAME=EXR Video Converter
FFMPEG_PATH=
```

Ideally, bundle FFmpeg with the desktop application so the user doesn't have to install anything separately.

---

## 📁 File Structure

```text
exr-video-converter/
│
├── src/
│   ├── main/
│   │   ├── main.ts
│   │   ├── ffmpeg.ts
│   │   ├── converter.ts
│   │   └── file-system.ts
│   │
│   ├── renderer/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── FolderSelector.tsx
│   │   │   ├── ConversionSettings.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── JobResult.tsx
│   │   ├── pages/
│   │   │   └── Converter.tsx
│   │   └── styles/
│   │       └── globals.css
│   │
│   └── shared/
│       └── types.ts
│
├── resources/
│   └── ffmpeg/
│
├── package.json
├── electron-builder.yml
└── README.md
```

---

## 🎯 Core Features

### 1. 📂 Select EXR Folder

User clicks:

**Select EXR Folder**

The app scans the folder and identifies EXR image sequences.

Example:

```text
SHOT_010/
├── render.0001.exr
├── render.0002.exr
├── render.0003.exr
├── ...
└── render.0240.exr
```

The app should automatically recognize the sequence.

---

### 2. 🎬 Automatic Sequence Detection

Detect:

* Sequence name
* First frame
* Last frame
* Number of frames
* Resolution
* Frame numbering
* FPS

Example:

```text
Sequence: SHOT_010
Frames: 1001–1240
Resolution: 3840 × 2160
Frame Count: 240
```

For the MVP, default FPS should be:

**24 FPS**

---

### 3. ⚙️ Automatic Half-Resolution Conversion

If the EXR is:

```text
3840 × 2160
```

output becomes:

```text
1920 × 1080
```

If:

```text
2048 × 1152
```

output becomes:

```text
1024 × 576
```

Keep the original aspect ratio.

---

### 4. 🎥 H.264 Video Export

Default output:

```text
MP4
H.264
24 FPS
50% resolution
```

Suggested FFmpeg settings:

```text
Codec: libx264
Pixel Format: yuv420p
Frame Rate: 24
CRF: 18–23
Preset: medium
```

For an editing/VFX preview tool, I'd start around **CRF 18–20** and make quality configurable later.

---

### 5. 📊 Conversion Progress

While converting, show:

```text
SHOT_010

████████████████░░░░ 78%

187 / 240 frames

1920 × 1080
24 FPS
H.264 MP4

Estimated time: 00:32
```

Also show:

* Current frame
* Percentage
* Processing speed
* Estimated remaining time
* Output filename

---

### 6. 📁 Output Folder

User selects:

**Output Folder**

The application creates:

```text
Output/
└── SHOT_010.mp4
```

After completion:

**✓ Conversion Complete**

Buttons:

`Open Video`
`Open Output Folder`

---

## 🔌 APIs & Tools

The MVP doesn't really need external APIs.

| Function               | Tool             |
| ---------------------- | ---------------- |
| EXR decoding           | FFmpeg / OpenEXR |
| Image sequence → video | FFmpeg           |
| H.264 encoding         | FFmpeg `libx264` |
| Folder selection       | Electron         |
| File system            | Node.js          |
| UI                     | React + Tailwind |
| Desktop packaging      | Electron Builder |

**External API cost: $0**

---

## 🧠 Key States

Useful React states:

```text
selectedInputFolder
selectedOutputFolder
detectedSequences
selectedSequence
frameCount
resolution
fps
outputFormat
isConverting
progress
currentFrame
processingSpeed
estimatedTime
conversionComplete
errorMessage
```

---

## 🚀 User Flow

```text
OPEN APP
   ↓
Select EXR Folder
   ↓
App scans folder
   ↓
Detect EXR sequence
   ↓
Show sequence information
   ↓
Select Output Folder
   ↓
Settings
   ├── Resolution: 50%
   ├── FPS: 24
   ├── Format: MP4
   └── Codec: H.264
   ↓
[ CONVERT ]
   ↓
FFmpeg processes EXR sequence
   ↓
Progress bar
   ↓
✓ Conversion Complete
   ↓
[ Open Video ] [ Open Folder ]
```

---

## ✅ Must-Have Features

* [x] Select/upload EXR folder
* [x] Automatically detect EXR sequences
* [x] Display frame count and resolution
* [x] Automatic 50% resolution
* [x] 24 FPS default
* [x] H.264 encoding
* [x] MP4 output
* [x] Output folder selection
* [x] Conversion progress
* [x] Processing speed / ETA
* [x] Error handling
* [x] Open converted video
* [x] Local processing without uploading EXR files

---

## 📝 Result Summary

**A fast local desktop application that automatically converts EXR image sequences into half-resolution 24fps H.264 MP4 videos with a simple Select → Convert → Done workflow.**

### One recommendation for the next version

Because you're building this specifically for a **film/VFX company**, I'd eventually add **batch conversion**:

```text
PROJECT/
├── SHOT_001/
├── SHOT_002/
├── SHOT_003/
├── SHOT_004/
└── SHOT_005/
```

Then the user clicks **Convert All** and gets:

```text
SHOT_001.mp4 ✓
SHOT_002.mp4 ✓
SHOT_003.mp4 ✓
SHOT_004.mp4 ✓
SHOT_005.mp4 ✓
```

That feature would probably provide much more real-world value than adding lots of UI settings.
