import React from 'react';
import type { VariableSnapshot } from '@codetime/compiler';
import { History, Redo2 } from 'lucide-react';

export interface VariablesPanelProps {
  locals: VariableSnapshot[];
  globals: VariableSnapshot[];
  /** Name of the function whose locals are shown; undefined at the top level (block locals only). */
  functionName?: string;
  /** Jump to the previous/next step that wrote a variable (reverse watchpoint). */
  onFindChange?: (name: string, direction: 'backward' | 'forward') => void;
}

const SectionHeader: React.FC<{ title: string; detail?: string }> = ({ title, detail }) => (
  <h3 className="flex items-center gap-1.5 px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-fg-muted">
    {title}
    {detail && <span className="font-mono text-[11px] font-normal tracking-normal text-fg-2">{detail}</span>}
  </h3>
);

const VariableRow: React.FC<{ variable: VariableSnapshot; onFindChange?: VariablesPanelProps['onFindChange'] }> = ({ variable: v, onFindChange }) => (
  <div
    data-variable={v.name}
    className={`group flex items-center gap-2 rounded px-3 py-1.5 transition ${
      v.changed ? 'bg-warn/10' : 'hover:bg-hover focus-within:bg-hover'
    }`}
  >
    <span className="font-mono text-xs font-medium text-fg">{v.name}</span>
    <span className="rounded-[3px] bg-hover px-1.5 py-px text-[10px] text-fg-muted group-hover:bg-elevated">{v.type}</span>
    {v.captured && (
      <span className="rounded-[3px] bg-back/15 px-1.5 py-px text-[10px] text-back" title="Captured by this closure">
        captured
      </span>
    )}
    <span
      className={`ml-auto min-w-0 truncate text-right font-mono text-xs ${v.changed ? 'text-warn' : 'text-run'}`}
      title={v.displayValue}
    >
      {v.displayValue}
    </span>
    {onFindChange && (
      <span className="flex shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={() => onFindChange(v.name, 'backward')}
          className="rounded p-0.5 text-fg-2 hover:bg-elevated hover:text-warn"
          title={`Go to the last step that changed ${v.name}`}
          aria-label={`Go to the last step that changed ${v.name}`}
        >
          <History className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onFindChange(v.name, 'forward')}
          className="rounded p-0.5 text-fg-2 hover:bg-elevated hover:text-warn"
          title={`Go to the next step that changes ${v.name}`}
          aria-label={`Go to the next step that changes ${v.name}`}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </span>
    )}
  </div>
);

export const VariablesPanel: React.FC<VariablesPanelProps> = ({ locals, globals, functionName, onFindChange }) => {
  const empty = locals.length === 0 && globals.length === 0;
  return (
    <div data-testid="variables-panel" className="h-full overflow-y-auto px-2 pb-3 select-text">
      {empty ? (
        <p className="px-3 py-6 text-center text-xs text-fg-muted">
          {onFindChange ? 'No variables at this step.' : 'Variables appear here while you debug.'}
        </p>
      ) : (
        <>
          {(functionName || locals.length > 0) && (
            <>
              <SectionHeader title="LOCALS" detail={functionName ? `${functionName}()` : undefined} />
              {locals.length === 0 ? (
                <p className="px-3 py-1 text-xs text-fg-muted">No locals yet</p>
              ) : (
                locals.map((v) => <VariableRow key={`${v.name}:${v.captured ? 'c' : 'l'}`} variable={v} onFindChange={onFindChange} />)
              )}
            </>
          )}
          <SectionHeader title="GLOBALS" />
          {globals.length === 0 ? (
            <p className="px-3 py-1 text-xs text-fg-muted">No globals yet</p>
          ) : (
            globals.map((v) => <VariableRow key={v.name} variable={v} onFindChange={onFindChange} />)
          )}
          {onFindChange && (
            <p className="px-3 pt-3 text-[11px] leading-relaxed text-fg-muted">
              Hover a variable: <History className="inline h-3 w-3" aria-label="last change" /> jumps to the step that last changed it,{' '}
              <Redo2 className="inline h-3 w-3" aria-label="next change" /> to the next one. Values changed by this step are amber.
            </p>
          )}
        </>
      )}
    </div>
  );
};
