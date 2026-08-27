import React from 'react';
import { VariableSnapshot } from '@codetime/compiler';
import { Variable, Globe, Package } from 'lucide-react';

export interface VariablesPanelProps {
  locals: VariableSnapshot[];
  globals: VariableSnapshot[];
}

export const VariablesPanel: React.FC<VariablesPanelProps> = ({ locals, globals }) => {
  return (
    <div className="h-full flex flex-col bg-slate-900 text-xs font-mono select-text overflow-hidden">
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 font-bold text-slate-300 flex items-center gap-2">
        <Variable className="w-4 h-4 text-sky-400" />
        Variables Inspector
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Local Scope */}
        <div>
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-sky-400" />
            Local Scope
          </h3>
          {locals.length === 0 ? (
            <p className="text-slate-500 italic text-[11px] pl-2">No active local variables</p>
          ) : (
            <div className="bg-slate-950 rounded-lg border border-slate-800 divide-y divide-slate-800/60 overflow-hidden">
              {locals.map((v, i) => (
                <div key={i} className="px-3 py-2 flex items-center justify-between hover:bg-slate-800/40">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-sky-300">{v.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {v.type}
                    </span>
                  </div>
                  <span className="text-emerald-400 font-semibold truncate max-w-[180px]" title={v.displayValue}>
                    {v.displayValue}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Scope */}
        <div>
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            Global Scope
          </h3>
          {globals.length === 0 ? (
            <p className="text-slate-500 italic text-[11px] pl-2">No global variables declared</p>
          ) : (
            <div className="bg-slate-950 rounded-lg border border-slate-800 divide-y divide-slate-800/60 overflow-hidden">
              {globals.map((v, i) => (
                <div key={i} className="px-3 py-2 flex items-center justify-between hover:bg-slate-800/40">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-indigo-300">{v.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {v.type}
                    </span>
                  </div>
                  <span className="text-emerald-400 font-semibold truncate max-w-[180px]" title={v.displayValue}>
                    {v.displayValue}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
