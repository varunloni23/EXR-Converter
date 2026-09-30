import React from 'react';
import { Film, Terminal, Settings, HelpCircle, Cpu, Layers, FolderCheck } from 'lucide-react';
import { HardwareInfo } from '../../shared/types';

interface HeaderProps {
  hardwareInfo: HardwareInfo | null;
  onOpenSettings: () => void;
  onOpenLogs: () => void;
  onOpenHelp: () => void;
  queueCount: number;
  onToggleQueue: () => void;
  isQueueOpen: boolean;
  onOpenFolderComparison?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  hardwareInfo,
  onOpenSettings,
  onOpenLogs,
  onOpenHelp,
  queueCount,
  onToggleQueue,
  isQueueOpen,
  onOpenFolderComparison,
}) => {
  return (
    <header className="h-14 px-6 border-b border-studio-border/70 bg-studio-bg/90 backdrop-blur-md flex items-center justify-between select-none z-20">
      {/* Left: Minimal Branding */}
      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-studio-accent to-[#5c3cd6] flex items-center justify-center shadow-glow-accent">
          <Film className="w-4 h-4 text-white" />
        </div>
        <div className="flex items-center space-x-2">
          <h1 className="font-semibold text-sm tracking-tight text-studio-text">EXR Converter</h1>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-studio-card border border-studio-border text-studio-textMuted">
            MOV & JPEG
          </span>
        </div>
      </div>

      {/* Right: Minimal Navigation & Tools */}
      <div className="flex items-center space-x-2">
        {/* Compare 2 Folders CTA Button */}
        {onOpenFolderComparison && (
          <button
            onClick={onOpenFolderComparison}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-studio-border/80 bg-studio-card/80 text-studio-text hover:text-white hover:border-studio-accent transition-all cursor-pointer shadow-sm"
            title="Compare 2 Folders (Source EXR vs Converted JPEG/MOV)"
          >
            <FolderCheck className="w-3.5 h-3.5 text-studio-accent" />
            <span>Compare 2 Folders</span>
          </button>
        )}

        {/* Queue Button */}
        <button
          onClick={onToggleQueue}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            isQueueOpen
              ? 'bg-studio-accent/20 border-studio-accent text-studio-accent'
              : 'bg-studio-card/60 border-studio-border/60 text-studio-textSecondary hover:text-studio-text hover:border-studio-border'
          }`}
          title="Conversion Queue & History"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Queue</span>
        </button>

        {/* Technical Log */}
        <button
          onClick={onOpenLogs}
          className="p-1.5 rounded-lg bg-studio-card/60 border border-studio-border/60 text-studio-textSecondary hover:text-studio-text hover:border-studio-border transition-colors"
          title="View Technical Log"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg bg-studio-card/60 border border-studio-border/60 text-studio-textSecondary hover:text-studio-text hover:border-studio-border transition-colors"
          title="Hardware & Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
