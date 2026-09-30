import React from 'react';
import { AlertOctagon, X } from 'lucide-react';

interface CancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancel: () => void;
}

export const CancelModal: React.FC<CancelModalProps> = ({
  isOpen,
  onClose,
  onConfirmCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="studio-card max-w-sm w-full p-6 shadow-2xl relative border-studio-error/40">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-studio-textMuted hover:text-studio-text p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-studio-errorMuted border border-studio-error/30 flex items-center justify-center text-studio-error flex-shrink-0">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-studio-text">Cancel conversion?</h3>
            <p className="text-xs text-studio-textSecondary">Active FFmpeg process</p>
          </div>
        </div>

        <p className="text-xs text-studio-textSecondary mb-6">
          The ongoing encoding will be stopped and the partially created video file will be cleaned up.
        </p>

        <div className="flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="studio-button-secondary px-4 py-2 text-xs font-medium"
          >
            Continue
          </button>

          <button
            onClick={onConfirmCancel}
            className="px-4 py-2 text-xs font-medium rounded-md bg-studio-error hover:bg-red-600 text-white font-semibold transition-colors"
          >
            Cancel Conversion
          </button>
        </div>
      </div>
    </div>
  );
};
