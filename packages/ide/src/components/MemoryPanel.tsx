import React from 'react';
import { Cpu, Server } from 'lucide-react';

export interface MemoryPanelProps {
  stackDisplay: string[];
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ stackDisplay }) => {
  return (
    <div className="h-full flex flex-col bg-slate-900 text-xs font-mono select-text overflow-hidden">
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 font-bold text-slate-300 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-amber-400" />
        VM Operand Stack
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col justify-end">
        {stackDisplay.length === 0 ? (
          <div className="text-center text-slate-500 italic text-[11px] py-8">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Operand stack is empty
          </div>
        ) : (
          <div className="space-y-1">
            {[...stackDisplay].reverse().map((valStr, idx) => {
              const stackIndex = stackDisplay.length - 1 - idx;
              const isTop = idx === 0;
              return (
                <div
                  key={stackIndex}
                  className={`px-3 py-1.5 rounded flex items-center justify-between border ${
                    isTop
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 font-bold">
                    [{stackIndex}]{isTop && ' (TOP)'}
                  </span>
                  <span className="font-semibold truncate max-w-[220px]" title={valStr}>
                    {valStr}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
