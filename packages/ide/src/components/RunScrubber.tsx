import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EVENT_KINDS } from '@codetime/compiler';
import type { RunOverviewMessage } from '../worker/protocol';

export interface RunScrubberProps {
  overview: RunOverviewMessage | null;
  currentStep: number;
  isRecording: boolean;
  onGotoStep: (step: number) => void;
}

const HEIGHT = 40;
const BASELINE = 6;
/** Bar height for plain steps at depth 1; each deeper call level adds STEP_PER_DEPTH. */
const STEP_BASE = 8;
const STEP_PER_DEPTH = 5;
const NOTABLE_HEIGHT = 26;
const FUTURE_ALPHA = 0.3;

/** Token per event kind, in EVENT_KINDS order. */
const KIND_TOKENS: Record<string, string> = {
  step: '--color-ev-step',
  assign: '--color-ev-assign',
  call: '--color-ev-call',
  return: '--color-ev-return',
  print: '--color-ev-print',
  loop: '--color-ev-loop',
  branch: '--color-ev-branch',
  error: '--color-ev-error',
  halt: '--color-ev-error',
};

function readColors(): { kinds: string[]; breakpoint: string } {
  const css = getComputedStyle(document.documentElement);
  return {
    kinds: EVENT_KINDS.map((k) => css.getPropertyValue(KIND_TOKENS[k] ?? '--color-ev-step').trim()),
    breakpoint: css.getPropertyValue('--color-err').trim(),
  };
}

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The whole recording at a glance, drawn on a canvas: one bar per bucket of
 * steps, colored by its most notable event kind, with plain steps raised by
 * call depth (so every function call shows as a plateau). Red ticks mark
 * breakpoint stops. Click or drag to travel; arrow keys step.
 */
export const RunScrubber: React.FC<RunScrubberProps> = ({ overview, currentStep, isRecording, onGotoStep }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [dragStep, setDragStep] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  const total = overview?.totalSteps ?? 0;
  const shownStep = dragStep ?? currentStep;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !overview || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);

    const colors = readColors();
    const { kinds, depths, breakpointHits } = overview;
    const buckets = kinds.length;
    const barWidth = width / buckets;
    const currentBucket = total > 0 ? (shownStep / total) * buckets : 0;
    for (let b = 0; b < buckets; b++) {
      const kind = kinds[b]!;
      const height = kind === 0
        ? STEP_BASE + Math.min(Math.max(depths[b]! - 1, 0), 4) * STEP_PER_DEPTH
        : NOTABLE_HEIGHT;
      ctx.globalAlpha = b <= currentBucket ? 1 : FUTURE_ALPHA;
      ctx.fillStyle = colors.kinds[kind] ?? colors.kinds[0]!;
      ctx.fillRect(b * barWidth, HEIGHT - BASELINE - height, Math.max(barWidth - (barWidth > 3 ? 0.5 : 0), 1), height);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.breakpoint;
    for (const step of breakpointHits) {
      ctx.fillRect(Math.min((step / total) * width, width - 2), 2, 2, 6);
    }
  }, [overview, width, shownStep, total]);

  const stepAt = useCallback((clientX: number): number => {
    const rect = containerRef.current!.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return Math.min(Math.floor(ratio * total), total - 1);
  }, [total]);

  /** Send at most one GOTO_STEP per animation frame while dragging. */
  const travel = useCallback((step: number) => {
    pendingRef.current = step;
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      if (pendingRef.current !== null) onGotoStep(pendingRef.current);
      pendingRef.current = null;
    });
  }, [onGotoStep]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  if (!overview || total === 0) {
    return (
      <div
        ref={containerRef}
        className="h-10 rounded-md border border-dashed border-line-strong bg-app flex items-center justify-center px-3 text-[11px] text-fg-muted text-center"
      >
        {isRecording ? (
          <span className="animate-pulse">Recording the run…</span>
        ) : (
          <span>
            Press <span className="text-fwd">Debug</span> to record the run, then drag here to travel through it.
          </span>
        )}
      </div>
    );
  }

  const percent = ((shownStep + 0.5) / total) * 100;
  const hoverStep = hoverX !== null && width > 0 ? Math.min(Math.floor((hoverX / width) * total), total - 1) : null;

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Recorded run"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={shownStep + 1}
      aria-valuetext={`Step ${fmt(shownStep + 1)} of ${fmt(total)}`}
      className="relative h-10 rounded-md border border-line bg-app cursor-pointer select-none touch-none overflow-visible"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const step = stepAt(e.clientX);
        setDragStep(step);
        travel(step);
      }}
      onPointerMove={(e) => {
        setHoverX(e.clientX - e.currentTarget.getBoundingClientRect().left);
        if (dragStep === null) return;
        const step = stepAt(e.clientX);
        setDragStep(step);
        travel(step);
      }}
      onPointerUp={() => setDragStep(null)}
      onPointerCancel={() => setDragStep(null)}
      onPointerLeave={() => setHoverX(null)}
      onKeyDown={(e) => {
        const page = Math.max(1, Math.round(total / 20));
        const target = {
          ArrowLeft: currentStep - 1,
          ArrowRight: currentStep + 1,
          PageUp: currentStep - page,
          PageDown: currentStep + page,
          Home: 0,
          End: total - 1,
        }[e.key];
        if (target === undefined) return;
        e.preventDefault();
        onGotoStep(Math.min(Math.max(target, 0), total - 1));
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full rounded-md" aria-hidden />
      {hoverStep !== null && dragStep === null && (
        <div className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-elevated border border-line-strong px-1.5 py-0.5 font-mono text-[10px] text-fg-2 whitespace-nowrap z-10" style={{ left: hoverX! }}>
          step {fmt(hoverStep + 1)}
        </div>
      )}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg" style={{ left: `${percent}%` }} aria-hidden>
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-fg shadow" />
      </div>
    </div>
  );
};
