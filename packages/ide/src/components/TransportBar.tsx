import React from 'react';
import {
  SkipBack,
  Rewind,
  ArrowDownFromLine,
  Undo2,
  CornerUpLeft,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  FastForward,
  SkipForward,
} from 'lucide-react';
import type { DebuggerState, NavigationCommand } from '@codetime/compiler';
import type { RunOverviewMessage } from '../worker/protocol';
import { RunScrubber } from './RunScrubber';

export interface TransportBarProps {
  state: DebuggerState | null;
  overview: RunOverviewMessage | null;
  isRecording: boolean;
  onNavigate: (command: NavigationCommand) => void;
  onGotoStep: (step: number) => void;
}

interface NavButton {
  command: NavigationCommand;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Plain instruction stepping and jumps to the ends are neutral; line/breakpoint travel is colored. */
  neutral?: boolean;
}

type Group = NavButton[];

const BACKWARD: Group[] = [
  [
    { command: 'restart', label: 'Go to first step', icon: SkipBack, neutral: true },
    { command: 'reverseContinue', label: 'Reverse continue to previous breakpoint (Shift+F5)', icon: Rewind },
  ],
  [
    { command: 'reverseStepOut', label: 'Reverse step out: back to the line that called this function', icon: ArrowDownFromLine },
    { command: 'reverseStepInto', label: 'Reverse step into: previous line, entering calls backward', icon: Undo2 },
    { command: 'reverseStepOver', label: 'Reverse step over: previous line (Shift+F10)', icon: CornerUpLeft },
  ],
  [{ command: 'stepBackward', label: 'Back one instruction (Alt+Left)', icon: ChevronLeft, neutral: true }],
];

const FORWARD: Group[] = [
  [{ command: 'stepForward', label: 'Forward one instruction (Alt+Right)', icon: ChevronRight, neutral: true }],
  [
    { command: 'stepOver', label: 'Step over: next line (F10)', icon: CornerDownRight },
    { command: 'stepInto', label: 'Step into function (F11)', icon: ArrowDownToLine },
    { command: 'stepOut', label: 'Step out of function (Shift+F11)', icon: ArrowUpFromLine },
  ],
  [
    { command: 'continue', label: 'Continue to next breakpoint (F5)', icon: FastForward },
    { command: 'gotoEnd', label: 'Go to last step', icon: SkipForward, neutral: true },
  ],
];

const fmt = (n: number) => n.toLocaleString('en-US');

export const TransportBar: React.FC<TransportBarProps> = ({ state, overview, isRecording, onNavigate, onGotoStep }) => {
  const renderGroups = (groups: Group[], backward: boolean) => (
    <div
      role="group"
      aria-label={backward ? 'Travel backward' : 'Travel forward'}
      className="flex items-center gap-0.5 rounded-lg border border-line bg-app p-0.5"
    >
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <span className="mx-0.5 h-4 w-px bg-line-strong" aria-hidden />}
          {group.map(({ command, label, icon: Icon, neutral }) => (
            <button
              key={command}
              onClick={() => onNavigate(command)}
              disabled={!state || (backward ? state.isAtStart : state.isAtEnd)}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent ${
                neutral ? 'text-fg-2 hover:text-fg' : backward ? 'text-back' : 'text-fwd'
              }`}
              title={label}
              aria-label={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );

  const frames = state?.snapshot.frames ?? [];
  const fnName = frames[frames.length - 1]?.fnName;

  return (
    <div className="shrink-0 bg-panel border-b border-line px-3 sm:px-4 py-2 flex flex-wrap lg:flex-nowrap items-center gap-x-3 gap-y-2">
      <span className="hidden xl:block text-[9px] font-semibold tracking-wider text-back" aria-hidden>BACK</span>
      {renderGroups(BACKWARD, true)}

      <div className="order-last lg:order-none basis-full lg:basis-auto flex-1 min-w-0">
        <RunScrubber
          overview={overview}
          currentStep={state?.currentStep ?? 0}
          isRecording={isRecording}
          onGotoStep={onGotoStep}
        />
      </div>

      {renderGroups(FORWARD, false)}
      <span className="hidden xl:block text-[9px] font-semibold tracking-wider text-fwd" aria-hidden>FWD</span>

      <div className="ml-auto lg:ml-0 flex flex-col items-end min-w-[96px] leading-tight">
        <span className="font-mono text-sm" title="Current step / recorded steps">
          {state ? (
            <>
              {fmt(state.currentStep + 1)} <span className="text-xs text-fg-muted">/ {fmt(state.totalSteps)}</span>
            </>
          ) : (
            <span className="text-xs text-fg-muted">no recording</span>
          )}
        </span>
        {state && (
          <span className="text-[10px] text-fg-muted truncate max-w-[180px]">
            line {state.snapshot.sourceLine}
            {fnName && fnName !== 'main' ? ` · ${fnName}()` : ''}
          </span>
        )}
      </div>
    </div>
  );
};
