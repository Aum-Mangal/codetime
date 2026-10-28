import React from 'react';
import type { VariableSnapshot } from '@codetime/compiler';
import { Variable, Globe, Package, History, Redo2 } from 'lucide-react';

export interface VariablesPanelProps {
  locals: VariableSnapshot[];
  globals: VariableSnapshot[];
  /** Jump to the previous/next step that wrote a variable (reverse watchpoint). */
  onFindChange?: (name: string, direction: 'backward' | 'forward') => void;
}

interface VariableListProps {
  title: string;
  icon: React.ReactNode;
  emptyText: string;
  variables: VariableSnapshot[];
  nameColor: string;
  changedBg: string;
  onFindChange?: VariablesPanelProps['onFindChange'];
}

const VariableList: React.FC<VariableListProps> = ({ title, icon, emptyText, variables, nameColor, changedBg, onFindChange }) => (
  <div>
    <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
      {icon}
      {title}
    </h3>
    {variables.length === 0 ? (
      <p className="text-slate-500 italic text-[11px] pl-2">{emptyText}</p>
    ) : (
      <div className="bg-slate-950 rounded-lg border border-slate-800 divide-y divide-slate-800/60 overflow-hidden">
        {variables.map((v) => (
          <div
            key={`${v.name}:${v.captured ? 'c' : 'l'}`}
            data-variable={v.name}
            className={`group px-3 py-2 flex items-center justify-between gap-2 transition ${
              v.changed ? changedBg : 'hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center space-x-2 min-w-0">
              <span className={`font-semibold ${nameColor}`}>{v.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{v.type}</span>
              {v.captured && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300" title="Captured by this closure">
                  captured
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span
                className={`font-semibold truncate max-w-[150px] ${v.changed ? 'text-amber-300 font-bold' : 'text-emerald-400'}`}
                title={v.displayValue}
              >
                {v.displayValue}
              </span>
              {onFindChange && (
                <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                  <button
                    onClick={() => onFindChange(v.name, 'backward')}
                    className="p-0.5 text-slate-400 hover:text-amber-300"
                    title={`Go to the last step that changed ${v.name}`}
                    aria-label={`Go to the last step that changed ${v.name}`}
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onFindChange(v.name, 'forward')}
                    className="p-0.5 text-slate-400 hover:text-amber-300"
                    title={`Go to the next step that changes ${v.name}`}
                    aria-label={`Go to the next step that changes ${v.name}`}
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const VariablesPanel: React.FC<VariablesPanelProps> = ({ locals, globals, onFindChange }) => {
  return (
    <div data-testid="variables-panel" className="h-full flex flex-col bg-slate-900 text-xs font-mono select-text overflow-hidden">
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 font-bold text-slate-300 flex items-center gap-2">
        <Variable className="w-4 h-4 text-sky-400" />
        Variables Inspector
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <VariableList
          title="Local Scope"
          icon={<Package className="w-3.5 h-3.5 text-sky-400" />}
          emptyText="No active local variables"
          variables={locals}
          nameColor="text-sky-300"
          changedBg="bg-sky-500/10"
          onFindChange={onFindChange}
        />
        <VariableList
          title="Global Scope"
          icon={<Globe className="w-3.5 h-3.5 text-indigo-400" />}
          emptyText="No global variables declared"
          variables={globals}
          nameColor="text-indigo-300"
          changedBg="bg-amber-500/10"
          onFindChange={onFindChange}
        />
        {onFindChange && (locals.length > 0 || globals.length > 0) && (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Hover a variable and press <History className="inline w-3 h-3" /> to jump back to the step that last changed it.
          </p>
        )}
      </div>
    </div>
  );
};
