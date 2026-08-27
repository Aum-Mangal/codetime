import { SourceLocation } from '../lexer/index.js';
import { Value } from '../vm/value.js';

export interface VariableSnapshot {
  name: string;
  value: Value;
  type: string;
  displayValue: string;
  changed?: boolean; // true if value changed from previous step
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
  snapshot: ExecutionSnapshot;
}

export interface Breakpoint {
  line: number;
  enabled: boolean;
}
