import React from 'react';
import { AlertCircle, FileCode, X } from 'lucide-react';

interface CollisionModalProps {
  fileName: string;
  suggestedNewName: string;
  isOpen: boolean;
  onClose: () => void;
  onReplace: () => void;
  onCreateNew: () => void;
}

export const CollisionModal: React.FC<CollisionModalProps> = ({
  fileName,
  suggestedNewName,
  isOpen,
  onClose,
  onReplace,
  onCreateNew,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="studio-card max-w-md w-full p-6 shadow-2xl relative border-studio-warning/40">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-studio-textMuted hover:text-studio-text p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-studio-warningMuted border border-studio-warning/30 flex items-center justify-center text-studio-warning flex-shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-studio-text">File Already Exists</h3>
            <p className="text-xs text-studio-textSecondary font-mono">{fileName}</p>
          </div>
        </div>

        <p className="text-xs text-studio-textSecondary mb-5">
          An output video file named <strong className="text-studio-text font-mono">{fileName}</strong> already exists in the destination folder. How would you like to proceed?
        </p>

        <div className="space-y-2.5">
          <button
            onClick={onReplace}
            className="w-full studio-button-primary py-2.5 px-4 text-xs font-medium flex items-center justify-center space-x-2"
          >
            <span>Replace Existing File</span>
          </button>

          <button
            onClick={onCreateNew}
            className="w-full studio-button-secondary py-2.5 px-4 text-xs font-medium flex items-center justify-center space-x-2 text-studio-accent hover:text-white"
          >
            <FileCode className="w-4 h-4" />
            <span>Create New ({suggestedNewName})</span>
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 text-xs text-studio-textMuted hover:text-studio-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
