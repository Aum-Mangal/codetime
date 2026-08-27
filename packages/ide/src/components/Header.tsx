import React from 'react';
import {
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Code2,
  Bug,
  Sparkles,
} from 'lucide-react';
import type { DebuggerState } from '@codetime/compiler';

export interface HeaderProps {
  onRun: () => void;
  onDebug: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onRestart: () => void;
  onGotoEnd: () => void;
  state: DebuggerState | null;
  isDebugging: boolean;
  selectedExample: string;
  onSelectExample: (name: string) => void;
  examples: { name: string; label: string }[];
}

export const Header: React.FC<HeaderProps> = ({
  onRun,
  onDebug,
  onStepForward,
  onStepBackward,
  onRestart,
  onGotoEnd,
  state,
  isDebugging,
  selectedExample,
  onSelectExample,
  examples,
}) => {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none">
      {/* Brand */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
          <Code2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-slate-100 text-sm tracking-wide flex items-center gap-2">
            CodeTime
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Time-Travel IDE
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 font-mono">v1.0.0 • VM Bytecode Engine</p>
        </div>
      </div>

      {/* Controls & Stepping */}
      <div className="flex items-center space-x-3">
        {/* Main Actions */}
        <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={onRun}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 rounded transition"
            title="Run code to completion"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run
          </button>
          <button
            onClick={onDebug}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/10 rounded transition"
            title="Start time-travel debugging"
          >
            <Bug className="w-3.5 h-3.5" />
            Debug
          </button>
        </div>

        {/* Time-Travel Navigation */}
        {isDebugging && state && (
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-sky-500/30">
            <button
              onClick={onRestart}
              disabled={state.isAtStart}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded transition"
              title="Restart (Step 0)"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={onStepBackward}
              disabled={state.isAtStart}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded transition"
              title="Step Backward"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-semibold px-2 text-sky-400 min-w-[70px] text-center">
              {state.currentStep + 1} / {state.totalSteps}
            </span>
            <button
              onClick={onStepForward}
              disabled={state.isAtEnd}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded transition"
              title="Step Forward"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onGotoEnd}
              disabled={state.isAtEnd}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded transition"
              title="Jump to End"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Examples Selector */}
      <div className="flex items-center space-x-2">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <select
          value={selectedExample}
          onChange={(e) => onSelectExample(e.target.value)}
          className="bg-slate-950 text-slate-200 border border-slate-800 text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500 transition cursor-pointer"
        >
          {examples.map((ex) => (
            <option key={ex.name} value={ex.name}>
              {ex.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
};
