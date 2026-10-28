/**
 * Messages between the UI thread and the debugger worker.
 *
 * The worker owns the recording; the UI only ever receives the state of the
 * current step, a small window of timeline events around it, and a fixed-size
 * overview of the whole run, so message size does not grow with the run.
 */
import type { DebuggerEvent, DebuggerState, NavigationCommand, RecordingStats } from '@codetime/compiler';

export interface BreakpointSpec {
  line: number;
  /** CodeTime expression; the breakpoint only stops where it is truthy. */
  condition?: string;
}

export type WorkerRequest =
  /** Compile and record `source`, then show its first (`start`) or last (`end`) step. */
  | { type: 'RECORD'; source: string; startAt: 'start' | 'end' }
  | { type: 'NAVIGATE'; command: NavigationCommand }
  | { type: 'GOTO_STEP'; step: number }
  /** Jump to the previous/next step that wrote the variable `name`. */
  | { type: 'FIND_CHANGE'; name: string; direction: 'backward' | 'forward' }
  /** Replace all breakpoints. They live in the worker across recordings. */
  | { type: 'SET_BREAKPOINTS'; breakpoints: BreakpointSpec[] }
  /** Compile without running, for live diagnostics while typing. */
  | { type: 'CHECK'; source: string; version: number }
  /** When was `name` last written before the current step? Answered with LAST_CHANGE. */
  | { type: 'LAST_CHANGE'; requestId: number; name: string };

export interface TimelineWindow {
  /** Step index of events[0]. */
  start: number;
  events: DebuggerEvent[];
}

export interface WorkerError {
  message: string;
  line: number;
  column: number;
  formatted: string;
  kind: string;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
  /** Error class, e.g. SyntaxError or SemanticError. */
  kind: string;
  hint?: string;
}

/** The whole run downsampled into buckets (see TimeTravelDebugger.getOverview). */
export interface RunOverviewMessage {
  totalSteps: number;
  /** Per bucket, an index into EVENT_KINDS. */
  kinds: Uint8Array;
  /** Per bucket, the deepest call depth. */
  depths: Uint16Array;
  /** Steps where Continue stops, for markers on the scrubber. */
  breakpointHits: number[];
}

export type WorkerResponse =
  | {
      type: 'STATE';
      state: DebuggerState;
      timeline: TimelineWindow;
      stats: RecordingStats;
      /** The runtime error that ended the program, if it ended with one. */
      runtimeError: WorkerError | null;
      /** For each visible variable, the line of its last write at or before this step. */
      lastWriteLines: Record<string, number>;
    }
  /** Sent after each recording and whenever breakpoints change. */
  | { type: 'OVERVIEW'; overview: RunOverviewMessage }
  | { type: 'DIAGNOSTICS'; version: number; diagnostics: Diagnostic[] }
  /** `step` is -1 when the variable was not written before the current step. */
  | { type: 'LAST_CHANGE'; requestId: number; step: number; line: number }
  /** Something the user should know that is not an error, e.g. "x never changed". */
  | { type: 'NOTICE'; message: string }
  | { type: 'ERROR'; error: WorkerError };
