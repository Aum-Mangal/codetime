export {
  TimeTravelDebugger,
  DEFAULT_MAX_STEPS,
  DEFAULT_CHECKPOINT_INTERVAL,
  DEFAULT_MAX_CHECKPOINTS,
  type RecordingOptions,
  type NavigationCommand,
} from './debugger.js';
export { captureState, restoreState, StateCopier, type VMSnapshot } from './snapshot.js';
export {
  type VariableSnapshot,
  type FrameSnapshot,
  type EventType,
  type DebuggerEvent,
  type ExecutionSnapshot,
  type DebuggerState,
  type Breakpoint,
  type RecordingStats,
  type RunOverview,
} from './types.js';
export { EVENT_KINDS } from './trace.js';
