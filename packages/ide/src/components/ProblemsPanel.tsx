import React from 'react';
import { CircleX, TriangleAlert } from 'lucide-react';
import type { Diagnostic } from '../worker/protocol';

export interface ProblemsPanelProps {
  diagnostics: Diagnostic[];
  onReveal: (line: number, column: number) => void;
}

/** Compile errors and warnings, updated while typing. */
export const ProblemsPanel: React.FC<ProblemsPanelProps> = ({ diagnostics, onReveal }) => (
  <div data-testid="problems" className="h-full overflow-y-auto py-1 select-text">
    {diagnostics.length === 0 ? (
      <p className="px-4 py-2 text-xs text-fg-muted">No problems. The program compiles.</p>
    ) : (
      <ul>
        {diagnostics.map((d, i) => {
          const Icon = d.severity === 'error' ? CircleX : TriangleAlert;
          return (
            <li key={i}>
              <button
                onClick={() => onReveal(d.line, d.column)}
                className="flex w-full items-start gap-2 px-4 py-1.5 text-left hover:bg-hover"
              >
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${d.severity === 'error' ? 'text-err' : 'text-warn'}`} aria-label={d.severity} />
                <span className="min-w-0 flex-1 text-xs">
                  <span className="text-fg">{d.message}</span>
                  {d.hint && <span className="block text-[11px] text-fg-muted">{d.hint}</span>}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                  {d.kind} · Ln {d.line}, Col {d.column}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);
