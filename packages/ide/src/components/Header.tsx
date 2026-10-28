import React from 'react';
import {
  Play,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Code2,
  Bug,
  Sparkles,
  CornerDownRight,
  CornerUpLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Undo2,
  FastForward,
  Rewind,
  Loader2,
} from 'lucide-react';
import type { DebuggerState, NavigationCommand } from '@codetime/compiler';

export interface HeaderProps {
  onRun: () => void;
  onDebug: () => void;
  onNavigate: (command: NavigationCommand) => void;
  state: DebuggerState | null;
  isDebugging: boolean;
  isRecording: boolean;
  selectedExample: string;
  onSelectExample: (name: string) => void;
  examples: { name: string; label: string }[];
}

interface NavButton {
  command: NavigationCommand;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Backward commands are disabled at the first step, forward ones at the last. */
  backward: boolean;
  color: string;
}

const BACKWARD_BUTTONS: NavButton[] = [
  { command: 'restart', label: 'Go to first step', icon: SkipBack, backward: true, color: 'text-slate-400 hover:text-white' },
  { command: 'reverseContinue', label: 'Reverse continue to previous breakpoint (Shift+F5)', icon: Rewind, backward: true, color: 'text-rose-300 hover:text-rose-100' },
  { command: 'reverseStepOut', label: 'Reverse step out: back to the line that called this function', icon: ArrowDownFromLine, backward: true, color: 'text-rose-300 hover:text-rose-100' },
  { command: 'reverseStepInto', label: 'Reverse step into: previous line, entering calls backward', icon: Undo2, backward: true, color: 'text-rose-300 hover:text-rose-100' },
  { command: 'reverseStepOver', label: 'Reverse step over: previous line (Shift+F10)', icon: CornerUpLeft, backward: true, color: 'text-rose-300 hover:text-rose-100' },
  { command: 'stepBackward', label: 'Back one instruction (Alt+Left)', icon: ChevronLeft, backward: true, color: 'text-slate-400 hover:text-white' },
];

const FORWARD_BUTTONS: NavButton[] = [
  { command: 'stepForward', label: 'Forward one instruction (Alt+Right)', icon: ChevronRight, backward: false, color: 'text-slate-400 hover:text-white' },
  { command: 'stepOver', label: 'Step over: next line (F10)', icon: CornerDownRight, backward: false, color: 'text-sky-400 hover:text-sky-200' },
  { command: 'stepInto', label: 'Step into function (F11)', icon: ArrowDownToLine, backward: false, color: 'text-sky-400 hover:text-sky-200' },
  { command: 'stepOut', label: 'Step out of function (Shift+F11)', icon: ArrowUpFromLine, backward: false, color: 'text-sky-400 hover:text-sky-200' },
  { command: 'continue', label: 'Continue to next breakpoint (F5)', icon: FastForward, backward: false, color: 'text-emerald-400 hover:text-emerald-200' },
  { command: 'gotoEnd', label: 'Go to last step', icon: SkipForward, backward: false, color: 'text-slate-400 hover:text-white' },
];

export const Header: React.FC<HeaderProps> = ({
  onRun,
  onDebug,
  onNavigate,
  state,
  isDebugging,
  isRecording,
  selectedExample,
  onSelectExample,
  examples,
}) => {
  const renderButton = ({ command, label, icon: Icon, backward, color }: NavButton) => (
    <button
      key={command}
      onClick={() => onNavigate(command)}
      disabled={!state || (backward ? state.isAtStart : state.isAtEnd)}
      className={`p-1.5 ${color} disabled:opacity-30 rounded transition`}
      title={label}
      aria-label={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

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
          <p className="text-[11px] text-slate-400 font-mono">v1.1.0 • VM Bytecode Engine</p>
        </div>
      </div>

      {/* Controls & Stepping */}
      <div className="flex items-center space-x-3">
        {/* Main Actions */}
        <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={onRun}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 rounded transition"
            title="Run code to completion (Ctrl+Enter)"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run
          </button>
          <button
            onClick={onDebug}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/10 rounded transition"
            title="Start time-travel debugging (F5)"
          >
            <Bug className="w-3.5 h-3.5" />
            Debug
          </button>
        </div>

        {/* Time-Travel Navigation */}
        {isRecording && (
          <span className="flex items-center gap-1.5 text-xs text-sky-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Recording…
          </span>
        )}
        {isDebugging && state && !isRecording && (
          <div className="flex items-center space-x-0.5 bg-slate-950 p-1 rounded-lg border border-sky-500/30">
            {BACKWARD_BUTTONS.map(renderButton)}
            <span className="text-xs font-mono font-semibold px-2 text-sky-400 min-w-[90px] text-center" title="Current step / recorded steps">
              {(state.currentStep + 1).toLocaleString('en-US')} / {state.totalSteps.toLocaleString('en-US')}
            </span>
            {FORWARD_BUTTONS.map(renderButton)}
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
