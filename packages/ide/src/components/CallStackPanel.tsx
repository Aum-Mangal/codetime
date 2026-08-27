import React from 'react';
import { FrameSnapshot } from '@codetime/compiler';
import { Layers } from 'lucide-react';

export interface CallStackPanelProps {
  frames: FrameSnapshot[];
}

export const CallStackPanel: React.FC<CallStackPanelProps> = ({ frames }) => {
  return (
    <div className="h-full flex flex-col bg-slate-900 text-xs font-mono select-text overflow-hidden">
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 font-bold text-slate-300 flex items-center gap-2">
        <Layers className="w-4 h-4 text-purple-400" />
        Call Stack
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {frames.length === 0 ? (
          <p className="text-slate-500 italic text-[11px] pl-2">No active call frames</p>
        ) : (
          <div className="space-y-1.5">
            {[...frames].reverse().map((frame, index) => {
              const isTop = index === 0;
              return (
                <div
                  key={frame.id}
                  className={`px-3 py-2 rounded-lg border transition ${
                    isTop
                      ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs flex items-center gap-1.5">
                      {isTop && <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />}
                      {frame.fnName || 'anonymous'}()
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      line {frame.loc.line}:{frame.loc.column}
                    </span>
                  </div>
                  {frame.locals.length > 0 && (
                    <div className="mt-1.5 text-[11px] text-slate-400 flex flex-wrap gap-1">
                      {frame.locals.map((l, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
                          {l.name} = {l.displayValue}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
