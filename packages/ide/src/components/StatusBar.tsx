import React from 'react';
import type { DebuggerState, RecordingStats } from '@codetime/compiler';

export interface StatusBarProps {
  state: DebuggerState | null;
  stats: RecordingStats | null;
  isRecording: boolean;
  errorCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export const StatusBar: React.FC<StatusBarProps> = ({ state, stats, isRecording, errorCount }) => {
  let dot = 'bg-fg-muted';
  let label = 'Ready';
  if (isRecording) {
    dot = 'bg-fwd animate-pulse';
    label = 'Recording…';
  } else if (state) {
    const { snapshot } = state;
    dot = state.hasError && state.isAtEnd ? 'bg-err' : 'bg-back';
    label = `${state.isAtEnd ? 'At the end, step' : 'Paused at step'} ${fmt(state.currentStep + 1)} · Ln ${snapshot.sourceLine}, Col ${snapshot.sourceColumn}`;
  } else if (errorCount > 0) {
    dot = 'bg-err';
    label = `${errorCount} ${errorCount === 1 ? 'problem' : 'problems'}`;
  }

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px]">
      <span className="flex min-w-0 items-center gap-1.5 text-fg-2" role="status">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      {stats && (
        <span
          className="ml-auto hidden truncate font-mono text-[10px] text-fg-muted sm:block"
          title={`A full VM checkpoint every ${fmt(stats.checkpointInterval)} steps; any other step is rebuilt by replaying from the nearest one.`}
        >
          {fmt(stats.totalSteps)} steps recorded in {fmt(stats.recordMs)} ms · {stats.checkpoints}{' '}
          {stats.checkpoints === 1 ? 'checkpoint' : 'checkpoints'} · {formatBytes(stats.traceBytes)} event log
        </span>
      )}
    </footer>
  );
};
