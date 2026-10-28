import { SourceLocation } from '../lexer/index.js';

export interface VariableSnapshot {
  name: string;
  type: string;
  displayValue: string;
  /** True when the current step wrote this variable. */
  changed?: boolean;
  /** True for a variable captured by the running closure (an upvalue). */
  captured?: boolean;
}

export interface FrameSnapshot {
  id: number;
  fnName: string;
  loc: SourceLocation;
  ip: number;
  slots: number;
  locals: VariableSnapshot[];
}

export type EventType =
  | 'step'
  | 'assign'
  | 'call'
  | 'return'
  | 'print'
  | 'loop'
  | 'branch'
  | 'error'
  | 'halt';

export interface DebuggerEvent {
  type: EventType;
  description: string;
  varName?: string;
  varValue?: string;
  fnName?: string;
  loc: SourceLocation;
  stepIndex: number;
}

/** Program state after one step (one executed bytecode instruction). */
export interface ExecutionSnapshot {
  stepIndex: number;
  totalSteps: number;
  ip: number;
  loc: SourceLocation;
  sourceLine: number;
  sourceColumn: number;
  stackDisplay: string[];
  frames: FrameSnapshot[];
  globals: VariableSnapshot[];
  output: string[];
  event: DebuggerEvent;
}

export interface DebuggerState {
  currentStep: number;
  totalSteps: number;
  isAtStart: boolean;
  isAtEnd: boolean;
  hasError: boolean;
  /** True when recording stopped at the step limit before the program finished. */
  isTruncated: boolean;
  snapshot: ExecutionSnapshot;
}

export interface Breakpoint {
  line: number;
  enabled: boolean;
  /** Optional CodeTime expression; the breakpoint only stops where it is truthy. */
  condition?: string;
}

export interface RecordingStats {
  totalSteps: number;
  /** Full VM snapshots kept (including the initial state). */
  checkpoints: number;
  /** Steps between checkpoints; doubles whenever old checkpoints are thinned out. */
  checkpointInterval: number;
  /** Bytes used by the per-step event log. */
  traceBytes: number;
  truncated: boolean;
  /** Why recording stopped early, when `truncated` is true. */
  truncatedReason?: string;
  recordMs: number;
}
