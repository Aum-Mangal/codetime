import React, { useRef, useEffect } from 'react';
import { DebuggerEvent } from '@codetime/compiler';
import { History, Activity } from 'lucide-react';

export interface TimelinePanelProps {
  timeline: DebuggerEvent[];
  currentStep: number;
  onGotoStep: (step: number) => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  timeline,
  currentStep,
  onGotoStep,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll timeline to current step
  useEffect(() => {
    if (containerRef.current) {
      const activeEl = containerRef.current.children[currentStep] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentStep]);

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'assign': return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      case 'call':   return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'return': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'print':  return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'loop':   return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      case 'halt':   return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:       return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 border-t border-slate-800 select-none overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xs text-slate-300">
          <History className="w-3.5 h-3.5 text-sky-400" />
          Execution Timeline
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {timeline.length} Recorded Steps
        </span>
      </div>

      {/* Scrubbable Timeline Track */}
      <div className="flex-1 p-2 overflow-x-auto overflow-y-hidden">
        <div ref={containerRef} className="flex items-center space-x-1.5 h-full">
          {timeline.map((event, idx) => {
            const isActive = idx === currentStep;
            return (
              <button
                key={idx}
                onClick={() => onGotoStep(idx)}
                className={`group relative flex-shrink-0 px-2.5 py-1.5 rounded-lg border text-left transition ${
                  isActive
                    ? 'bg-sky-950 border-sky-400 text-sky-200 ring-2 ring-sky-400/40 shadow-lg shadow-sky-500/10'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    #{idx + 1}
                  </span>
                  <span className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded border ${getEventBadge(event.type)}`}>
                    {event.type}
                  </span>
                </div>
                <div className="text-[11px] font-mono font-medium truncate max-w-[140px] mt-0.5" title={event.description}>
                  {event.description}
                </div>
                <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                  Line {event.loc.line}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
