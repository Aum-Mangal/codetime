/**
 * Messages between the UI thread and the debugger worker.
 *
 * The worker owns the recording; the UI only ever receives the state of the
 * current step plus a small window of timeline events around it, so message
 * size does not grow with the length of the run.
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
  | { type: 'SET_BREAKPOINTS'; breakpoints: BreakpointSpec[] };

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

export type WorkerResponse =
  | {
      type: 'STATE';
      state: DebuggerState;
      timeline: TimelineWindow;
      stats: RecordingStats;
      /** The runtime error that ended the program, if it ended with one. */
      runtimeError: WorkerError | null;
    }
  /** Something the user should know that is not an error, e.g. "x never changed". */
  | { type: 'NOTICE'; message: string }
  | { type: 'ERROR'; error: WorkerError };
