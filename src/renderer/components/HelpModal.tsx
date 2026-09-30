import React from 'react';
import { HelpCircle, X, Film, CheckCircle2, Zap, ShieldCheck } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="studio-card max-w-lg w-full p-6 shadow-2xl relative border-studio-borderLight">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-studio-textMuted hover:text-studio-text p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-3 mb-5 pb-3 border-b border-studio-border">
          <div className="w-8 h-8 rounded-lg bg-studio-accent/20 border border-studio-accent/30 flex items-center justify-center text-studio-accent">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-studio-text">EXR Converter Guide</h3>
            <p className="text-xs text-studio-textMuted font-mono">Film & VFX Editorial Workflow</p>
          </div>
        </div>

        <div className="space-y-4 text-xs text-studio-textSecondary">
          <div>
            <h4 className="font-semibold text-studio-text mb-1 flex items-center space-x-1.5 font-mono">
              <Film className="w-3.5 h-3.5 text-studio-accent" />
              <span>Supported Sequence Naming</span>
            </h4>
            <p className="mb-2">
              The converter automatically scans and detects all standard VFX frame numbering conventions:
            </p>
            <ul className="list-disc list-inside space-y-1 font-mono text-[11px] bg-studio-bg p-2.5 rounded border border-studio-border">
              <li><span className="text-studio-accent">render.0001.exr</span> — Dot delimiter</li>
              <li><span className="text-studio-accent">SHOT_010_1001.exr</span> — Underscore delimiter</li>
              <li><span className="text-studio-accent">plate_01_000100.exr</span> — 6-digit VFX padding</li>
              <li><span className="text-studio-accent">1001.exr</span> — Standalone frame digits</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-studio-text mb-1 flex items-center space-x-1.5 font-mono">
              <Zap className="w-3.5 h-3.5 text-studio-warning" />
              <span>Default 50% Scaling</span>
            </h4>
            <p>
              In accordance with editorial best practices, the application defaults to 50% scale (e.g. 3840×2160 → 1920×1080), preserving the exact original aspect ratio and ensuring even pixel dimensions for H.264 macroblock alignment.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-studio-text mb-1 flex items-center space-x-1.5 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-studio-success" />
              <span>100% Offline & Air-Gapped Safe</span>
            </h4>
            <p>
              All image decoding and video rendering are handled locally by your machine's FFmpeg processor. The application operates seamlessly on offline and air-gapped studio networks without internet access.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-studio-border flex justify-end">
          <button
            onClick={onClose}
            className="studio-button-primary px-5 py-2 text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
