import React, { useRef, useEffect } from 'react';
import type { RecordingStats } from '@codetime/compiler';
import { History, AlertTriangle } from 'lucide-react';
import type { TimelineWindow } from '../worker/protocol';

export interface TimelinePanelProps {
  /** The events around the current step (the worker never sends the whole run). */
  timeline: TimelineWindow;
  stats: RecordingStats | null;
  currentStep: number;
  onGotoStep: (step: number) => void;
}

const getEventBadge = (type: string) => {
  switch (type) {
    case 'assign': return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    case 'call':   return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'return': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'print':  return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'loop':   return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    case 'branch': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'error':  return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    case 'halt':   return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    default:       return 'bg-slate-800 text-slate-400 border-slate-700';
  }
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({ timeline, stats, currentStep, onGotoStep }) => {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentStep, timeline]);

  return (
    <div className="h-full flex flex-col bg-slate-900 border-t border-slate-800 select-none overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-xs text-slate-300">
          <History className="w-3.5 h-3.5 text-sky-400" />
          Execution Timeline
        </div>
        {stats && (
          <span
            className="text-[10px] font-mono text-slate-400 truncate"
            title={`Event log: ${formatBytes(stats.traceBytes)}. A full VM checkpoint every ${stats.checkpointInterval.toLocaleString('en-US')} steps; any other step is rebuilt by replaying from the nearest checkpoint. Recorded in ${stats.recordMs} ms.`}
          >
            {stats.totalSteps.toLocaleString('en-US')} steps · {stats.checkpoints} checkpoints · {formatBytes(stats.traceBytes)}
          </span>
        )}
      </div>

      {stats?.truncated && (
        <div className="px-3 py-1 text-[10px] bg-amber-500/10 text-amber-300 flex items-center gap-1.5 border-b border-amber-500/20">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          {stats.truncatedReason}
        </div>
      )}

      <div className="flex-1 p-2 overflow-x-auto overflow-y-hidden">
        <div className="flex items-center space-x-1.5 h-full">
          {timeline.events.map((event, i) => {
            const step = timeline.start + i;
            const isActive = step === currentStep;
            return (
              <button
                key={step}
                ref={isActive ? activeRef : undefined}
                onClick={() => onGotoStep(step)}
                className={`group relative flex-shrink-0 px-2.5 py-1.5 rounded-lg border text-left transition ${
                  isActive
                    ? 'bg-sky-950 border-sky-400 text-sky-200 ring-2 ring-sky-400/40 shadow-lg shadow-sky-500/10'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-400">#{step + 1}</span>
                  <span className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded border ${getEventBadge(event.type)}`}>
                    {event.type}
                  </span>
                </div>
                <div className="text-[11px] font-mono font-medium truncate max-w-[140px] mt-0.5" title={event.description}>
                  {event.description}
                </div>
                <div className="text-[9px] font-mono text-slate-400 mt-0.5">Line {event.loc.line}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
