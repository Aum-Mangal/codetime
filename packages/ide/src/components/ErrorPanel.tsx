import React from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';

export interface ErrorPanelProps {
  error: {
    message: string;
    line: number;
    column: number;
    formatted: string;
  };
}

export const ErrorPanel: React.FC<ErrorPanelProps> = ({ error }) => {
  return (
    <div className="bg-rose-950/40 border border-rose-500/30 rounded-lg p-3 text-rose-200 text-xs font-mono select-text">
      <div className="flex items-center gap-2 font-bold text-rose-300 mb-2">
        <AlertTriangle className="w-4 h-4 text-rose-400" />
        Execution Diagnostic Error (Line {error.line}, Col {error.column})
      </div>
      <pre className="whitespace-pre-wrap bg-slate-950/80 p-2.5 rounded border border-rose-500/20 text-[11px] leading-relaxed text-rose-300 font-mono overflow-x-auto">
        {error.formatted}
      </pre>
    </div>
  );
};
