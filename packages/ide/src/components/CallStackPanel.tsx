import React from 'react';
import type { FrameSnapshot } from '@codetime/compiler';

export interface CallStackPanelProps {
  frames: FrameSnapshot[];
}

export const CallStackPanel: React.FC<CallStackPanelProps> = ({ frames }) => (
  <div className="h-full overflow-y-auto p-2 select-text">
    {frames.length === 0 ? (
      <p className="px-3 py-6 text-center text-xs text-fg-muted">The call stack appears here while you debug.</p>
    ) : (
      <ol className="space-y-1">
        {[...frames].reverse().map((frame, index) => {
          const isTop = index === 0;
          return (
            <li
              key={frame.id}
              className={`rounded-md border px-3 py-2 ${isTop ? 'border-back/40 bg-back/10' : 'border-line bg-app'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 font-mono text-xs font-medium ${isTop ? 'text-fg' : 'text-fg-2'}`}>
                  {isTop && <span className="h-1.5 w-1.5 rounded-full bg-back" aria-label="current frame" />}
                  {frame.fnName === 'main' ? '<script>' : `${frame.fnName || 'anonymous'}()`}
                </span>
                <span className="font-mono text-[10px] text-fg-muted">
                  Ln {frame.loc.line}, Col {frame.loc.column}
                </span>
              </div>
              {frame.locals.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {frame.locals.map((l, i) => (
                    <span key={i} className="max-w-full truncate rounded border border-line bg-panel px-1.5 py-px font-mono text-[10px] text-fg-2">
                      {l.name} = {l.displayValue}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    )}
  </div>
);
