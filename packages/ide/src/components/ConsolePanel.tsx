import React from 'react';

export interface ConsolePanelProps {
  output: string[];
  /** Formatted runtime error, shown after the output when the program failed. */
  error?: string;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({ output, error }) => (
  <div data-testid="console" className="h-full overflow-y-auto px-4 py-2.5 font-mono text-xs leading-relaxed select-text">
    {output.length === 0 && !error ? (
      <p className="font-sans text-fg-muted">Program output appears here. Press Run (Ctrl+Enter) or Debug (F5).</p>
    ) : (
      output.map((line, idx) => (
        <div key={idx} className="flex items-start gap-2.5">
          <span className="select-none text-fg-muted" aria-hidden>›</span>
          <span className="whitespace-pre-wrap text-fg">{line}</span>
        </div>
      ))
    )}
    {error && <pre className="mt-1 whitespace-pre-wrap text-err">{error}</pre>}
  </div>
);
