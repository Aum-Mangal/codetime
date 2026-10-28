import type { EventType } from './types.js';

/** Event kinds in the order they are stored in the trace (one byte each). */
export const EVENT_KINDS: readonly EventType[] = [
  'step', 'assign', 'call', 'return', 'print', 'loop', 'branch', 'error', 'halt',
];

export const EventKind = {
  Step: 0,
  Assign: 1,
  Call: 2,
  Return: 3,
  Print: 4,
  Loop: 5,
  Branch: 6,
  Error: 7,
  Halt: 8,
} as const;

const NO_TARGET = -1;
const INITIAL_CAPACITY = 1024;

/**
 * The compact per-step event log of a recording: one entry per executed
 * instruction, stored column-wise in typed arrays (20 bytes per step).
 *
 * This is all the debugger keeps for every step. Full VM state exists only at
 * checkpoints; anything else (variable values, descriptions) is recomputed by
 * replaying from the nearest checkpoint. Navigation queries such as "next line
 * at this call depth" or "last write to x" scan these arrays and never replay.
 */
export class TraceLog {
  public length = 0;
  public line = new Int32Array(INITIAL_CAPACITY);
  public column = new Int32Array(INITIAL_CAPACITY);
  /** Number of call frames while the instruction ran (1 = top-level script). */
  public depth = new Uint16Array(INITIAL_CAPACITY);
  public kind = new Uint8Array(INITIAL_CAPACITY);
  /** Interned name of the variable the step wrote to, or -1. */
  public target = new Int32Array(INITIAL_CAPACITY);
  /** Number of output lines printed once the step has run. */
  public outputLength = new Uint32Array(INITIAL_CAPACITY);
  /**
   * 1 when the step is the first instruction of a source line in its call
   * frame: the line differs from the frame's previous step, the frame was just
   * entered, or a loop jumped back. Steps inside calls made from the line do
   * not break it up, so "step over" can skip them.
   */
  public lineStart = new Uint8Array(INITIAL_CAPACITY);

  private readonly names: string[] = [];
  private readonly nameIds = new Map<string, number>();

  public push(
    line: number,
    column: number,
    depth: number,
    kind: number,
    target: string | null,
    outputLength: number,
    lineStart: boolean,
  ): void {
    if (this.length === this.line.length) this.grow();
    const i = this.length++;
    this.line[i] = line;
    this.column[i] = column;
    this.depth[i] = depth;
    this.kind[i] = kind;
    this.target[i] = target === null ? NO_TARGET : this.intern(target);
    this.outputLength[i] = outputLength;
    this.lineStart[i] = lineStart ? 1 : 0;
  }

  /** The id used in `target` for a variable name, or -1 if it was never written. */
  public nameId(name: string): number {
    return this.nameIds.get(name) ?? NO_TARGET;
  }

  public targetName(step: number): string | null {
    const id = this.target[step]!;
    return id === NO_TARGET ? null : this.names[id]!;
  }

  /** Bytes used by the stored steps (excluding unused capacity). */
  public get byteLength(): number {
    return this.length * (4 + 4 + 2 + 1 + 4 + 4 + 1);
  }

  private intern(name: string): number {
    let id = this.nameIds.get(name);
    if (id === undefined) {
      id = this.names.length;
      this.names.push(name);
      this.nameIds.set(name, id);
    }
    return id;
  }

  private grow(): void {
    const capacity = this.line.length * 2;
    const grow = <T extends Int32Array | Uint32Array | Uint16Array | Uint8Array>(old: T, make: (n: number) => T): T => {
      const next = make(capacity);
      next.set(old);
      return next;
    };
    this.line = grow(this.line, n => new Int32Array(n));
    this.column = grow(this.column, n => new Int32Array(n));
    this.depth = grow(this.depth, n => new Uint16Array(n));
    this.kind = grow(this.kind, n => new Uint8Array(n));
    this.target = grow(this.target, n => new Int32Array(n));
    this.outputLength = grow(this.outputLength, n => new Uint32Array(n));
    this.lineStart = grow(this.lineStart, n => new Uint8Array(n));
  }
}
