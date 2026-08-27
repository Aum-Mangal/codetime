import React from 'react';
import { Terminal, Trash2 } from 'lucide-react';

export interface ConsolePanelProps {
  output: string[];
  onClear?: () => void;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({ output, onClear }) => {
  return (
    <div className="h-full flex flex-col bg-slate-950 text-xs font-mono select-text overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-slate-300">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          Console Output
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition"
            title="Clear output"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 font-mono text-emerald-400 leading-relaxed space-y-1">
        {output.length === 0 ? (
          <p className="text-slate-500 italic text-[11px]">No program output</p>
        ) : (
          output.map((line, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-slate-500 select-none text-[10px] pt-0.5">&gt;</span>
              <span className="whitespace-pre-wrap">{line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
