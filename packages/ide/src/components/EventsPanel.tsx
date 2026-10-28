import React, { useEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { RecordingStats } from '@codetime/compiler';
import type { TimelineWindow } from '../worker/protocol';

export interface EventsPanelProps {
  /** The events around the current step (the worker never sends the whole run). */
  timeline: TimelineWindow;
  stats: RecordingStats | null;
  currentStep: number;
  onGotoStep: (step: number) => void;
}

/** Dot color per event kind; the same tokens color the scrubber. */
export const KIND_DOT: Record<string, string> = {
  step: 'bg-ev-step',
  assign: 'bg-ev-assign',
  call: 'bg-ev-call',
  return: 'bg-ev-return',
  print: 'bg-ev-print',
  loop: 'bg-ev-loop',
  branch: 'bg-ev-branch',
  error: 'bg-ev-error',
  halt: 'bg-ev-error',
};

const LEGEND = ['assign', 'call', 'return', 'branch', 'print'] as const;

export const EventsPanel: React.FC<EventsPanelProps> = ({ timeline, stats, currentStep, onGotoStep }) => {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentStep, timeline]);

  return (
    <section aria-label="Events" className="flex h-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-3">
        <h2 className="text-xs font-medium">Events</h2>
        <ul className="ml-auto flex items-center gap-2" aria-label="Event kinds">
          {LEGEND.map((kind) => (
            <li key={kind} className="flex items-center gap-1 text-[10px] text-fg-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[kind]}`} aria-hidden />
              {kind}
            </li>
          ))}
        </ul>
      </div>

      {stats?.truncated && (
        <div role="alert" className="flex shrink-0 items-start gap-1.5 border-b border-warn/20 bg-warn/10 px-3 py-1.5 text-[11px] text-warn">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {stats.truncatedReason}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {timeline.events.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-fg-muted">Each executed VM instruction is listed here while you debug.</p>
        ) : (
          timeline.events.map((event, i) => {
            const step = timeline.start + i;
            const isActive = step === currentStep;
            return (
              <button
                key={step}
                ref={isActive ? activeRef : undefined}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onGotoStep(step)}
                title={`${event.type}: ${event.description}`}
                className={`flex w-full items-center gap-2.5 px-3 py-[5px] text-left transition ${
                  isActive
                    ? 'bg-back/15 shadow-[inset_2px_0_0_var(--color-back)]'
                    : `hover:bg-hover ${step > currentStep ? 'opacity-55' : ''}`
                }`}
              >
                <span className="w-12 shrink-0 font-mono text-[11px] text-fg-muted">#{(step + 1).toLocaleString('en-US')}</span>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[event.type] ?? KIND_DOT.step}`} aria-label={event.type} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{event.description}</span>
                <span className="shrink-0 font-mono text-[11px] text-fg-muted">Line {event.loc.line}</span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
};
