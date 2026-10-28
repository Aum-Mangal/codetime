import React from 'react';

export interface MemoryPanelProps {
  stackDisplay: string[];
}

/** The VM's operand stack at the current step, top first. */
export const MemoryPanel: React.FC<MemoryPanelProps> = ({ stackDisplay }) => (
  <div className="h-full overflow-y-auto p-2 select-text">
    {stackDisplay.length === 0 ? (
      <p className="px-3 py-6 text-center text-xs text-fg-muted">The operand stack is empty.</p>
    ) : (
      <ol className="space-y-1" aria-label="Operand stack, top first">
        {[...stackDisplay].reverse().map((value, idx) => {
          const slot = stackDisplay.length - 1 - idx;
          const isTop = idx === 0;
          return (
            <li
              key={slot}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 font-mono text-xs ${
                isTop ? 'border-fwd/40 bg-fwd/10 text-fg' : 'border-line bg-app text-fg-2'
              }`}
            >
              <span className="text-[10px] text-fg-muted">
                [{slot}]{isTop && ' top'}
              </span>
              <span className="truncate" title={value}>{value}</span>
            </li>
          );
        })}
      </ol>
    )}
  </div>
);
