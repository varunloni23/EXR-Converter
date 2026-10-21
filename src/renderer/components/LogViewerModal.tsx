import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Check, FolderOpen, X, Search, Trash2 } from 'lucide-react';
import { LogEntry } from '../../shared/types';

interface LogViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  onOpenLogFolder: () => void;
}

export const LogViewerModal: React.FC<LogViewerModalProps> = ({
  isOpen,
  onClose,
  logs,
  onOpenLogFolder,
}) => {
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter(
    (l) =>
      l.message.toLowerCase().includes(search.toLowerCase()) ||
      (l.details && l.details.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCopy = () => {
    const text = logs
      .map(
        (l) =>
          `${l.timestamp} [${l.level.toUpperCase()}] ${l.message}${
            l.details ? ` - ${l.details}` : ''
          }`
      )
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="studio-card max-w-3xl w-full h-[620px] max-h-[90vh] flex flex-col p-6 shadow-2xl relative border-studio-borderLight">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-studio-border flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-studio-accent/20 border border-studio-accent/30 flex items-center justify-center text-studio-accent">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-studio-text">Technical Conversion Log</h3>
              <p className="text-xs text-studio-textMuted font-mono">Local real-time engine events</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="studio-button-secondary px-3 py-1.5 text-xs font-medium flex items-center space-x-1.5"
              title="Copy all logs to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-studio-success" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Log'}</span>
            </button>

            <button
              onClick={onOpenLogFolder}
              className="studio-button-secondary px-3 py-1.5 text-xs font-medium flex items-center space-x-1.5"
              title="Reveal log folder in Finder / Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-studio-accent" />
              <span>Open Log Folder</span>
            </button>

            <button
              onClick={onClose}
              className="text-studio-textMuted hover:text-studio-text p-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="py-3 flex items-center space-x-3 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-studio-textMuted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search log messages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-studio-bg border border-studio-border text-studio-text text-xs rounded-md pl-8 pr-3 py-1.5 focus:outline-none focus:border-studio-accent font-mono"
            />
          </div>
          <span className="text-xs font-mono text-studio-textMuted">{filteredLogs.length} entries</span>
        </div>

        {/* Log Viewer Console */}
        <div className="flex-1 bg-black/60 rounded-lg border border-studio-border p-4 font-mono text-xs overflow-y-auto space-y-1.5 select-text">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-studio-textMuted">
              No matching log entries.
            </div>
          ) : (
            filteredLogs.map((log) => {
              let levelColor = 'text-studio-textSecondary';
              let badgeBg = 'bg-studio-card text-studio-textSecondary';
              if (log.level === 'error') {
                levelColor = 'text-studio-error';
                badgeBg = 'bg-studio-error/20 text-studio-error border border-studio-error/30';
              } else if (log.level === 'warn') {
                levelColor = 'text-studio-warning';
                badgeBg = 'bg-studio-warning/20 text-studio-warning border border-studio-warning/30';
              } else if (log.level === 'success') {
                levelColor = 'text-studio-success';
                badgeBg = 'bg-studio-success/20 text-studio-success border border-studio-success/30';
              }

              return (
                <div key={log.id} className="flex items-start space-x-2 py-0.5 leading-relaxed">
                  <span className="text-studio-textMuted flex-shrink-0">{log.timestamp}</span>
                  <span className={`px-1 rounded text-[10px] uppercase font-bold flex-shrink-0 ${badgeBg}`}>
                    {log.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={levelColor}>{log.message}</span>
                    {log.details && (
                      <span className="text-studio-textMuted block text-[11px] mt-0.5 pl-2 border-l border-studio-border break-all">
                        {log.details}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
};
