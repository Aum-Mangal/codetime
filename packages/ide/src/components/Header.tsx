import React from 'react';
import { Play, Bug, SquareCode, Share2, ChevronDown, Loader2, Check } from 'lucide-react';

export interface HeaderProps {
  onRun: () => void;
  onDebug: () => void;
  isRecording: boolean;
  selectedExample: string;
  onSelectExample: (name: string) => void;
  examples: { name: string; label: string }[];
  onShare: () => void;
  /** True for a moment after the share link was copied. */
  shareCopied: boolean;
}

const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <kbd aria-hidden className={`hidden md:inline rounded px-1 py-px font-mono text-[10px] font-normal ${className}`}>{children}</kbd>
);

export const Header: React.FC<HeaderProps> = ({
  onRun,
  onDebug,
  isRecording,
  selectedExample,
  onSelectExample,
  examples,
  onShare,
  shareCopied,
}) => (
  <header className="h-12 shrink-0 bg-panel border-b border-line px-3 sm:px-4 flex items-center gap-3 sm:gap-4">
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-[26px] h-[26px] shrink-0 rounded-md bg-fwd/15 flex items-center justify-center text-fwd">
        <SquareCode className="w-4 h-4" aria-hidden />
      </div>
      <h1 className="sr-only sm:not-sr-only text-sm font-semibold">CodeTime</h1>
      <span className="hidden lg:inline text-xs text-fg-muted truncate">time-travel debugger</span>
    </div>

    <div className="flex-1" />

    <div className="flex items-center gap-2">
      <button
        onClick={onRun}
        disabled={isRecording}
        className="flex items-center gap-1.5 rounded-md bg-run pl-3 pr-2 py-1.5 text-xs font-semibold text-app hover:brightness-110 disabled:opacity-60 transition"
        title="Run to completion (Ctrl+Enter)"
      >
        <Play className="w-3.5 h-3.5 fill-current" aria-hidden />
        Run
        <Kbd className="bg-app/20">Ctrl ↵</Kbd>
      </button>
      <button
        onClick={onDebug}
        disabled={isRecording}
        className="flex items-center gap-1.5 rounded-md border border-fwd/45 bg-fwd/10 pl-3 pr-2 py-1.5 text-xs font-semibold text-fwd hover:bg-fwd/20 disabled:opacity-60 transition"
        title="Record the run and start at its first step (F5)"
      >
        {isRecording ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Bug className="w-3.5 h-3.5" aria-hidden />}
        Debug
        <Kbd className="bg-app/40 text-fg-muted">F5</Kbd>
      </button>
    </div>

    <div className="flex-1" />

    <div className="flex items-center gap-1 sm:gap-2 min-w-0">
      <label className="relative flex items-center min-w-0 rounded-md border border-line-strong bg-elevated text-xs hover:border-fg-muted transition">
        <span className="hidden xl:inline pl-2.5 text-fg-muted">Example:</span>
        <select
          value={selectedExample}
          onChange={(e) => onSelectExample(e.target.value)}
          aria-label="Example program"
          className="appearance-none bg-transparent font-medium text-fg pl-2.5 xl:pl-1.5 pr-7 py-1.5 min-w-0 max-w-[160px] sm:max-w-[240px] truncate cursor-pointer focus:outline-none"
        >
          {examples.map((ex) => (
            <option key={ex.name} value={ex.name} className="bg-elevated">
              {ex.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 w-3.5 h-3.5 text-fg-muted" aria-hidden />
      </label>
      <button
        onClick={onShare}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-fg-2 hover:bg-hover hover:text-fg transition"
        title="Copy a link that opens this program"
      >
        {shareCopied ? <Check className="w-3.5 h-3.5 text-run" aria-hidden /> : <Share2 className="w-3.5 h-3.5" aria-hidden />}
        <span className="hidden sm:inline">{shareCopied ? 'Link copied' : 'Share'}</span>
      </button>
    </div>
  </header>
);
