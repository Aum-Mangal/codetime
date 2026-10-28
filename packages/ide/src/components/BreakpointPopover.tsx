import React, { useEffect, useRef, useState } from 'react';

export interface BreakpointPopoverProps {
  line: number;
  /** Distance from the top of the editor, in pixels. */
  top: number;
  condition: string;
  exists: boolean;
  onSave: (condition: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Inline editor for a breakpoint's condition, opened by right-clicking the gutter. */
export const BreakpointPopover: React.FC<BreakpointPopoverProps> = ({ line, top, condition, exists, onSave, onRemove, onClose }) => {
  const [draft, setDraft] = useState(condition);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Monaco focuses itself after the gutter click that opened this, so take focus back afterwards.
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`Breakpoint on line ${line}`}
      className="absolute left-12 z-20 w-[min(420px,calc(100%-4rem))] rounded-lg border border-line-strong bg-elevated p-3 shadow-2xl shadow-black/50"
      style={{ top: Math.max(4, top + 4) }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft.trim());
        }}
      >
        <label htmlFor="bp-condition" className="flex items-center gap-2 text-xs font-medium text-fg">
          <span className="w-2 h-2 rotate-45 rounded-[1px] bg-warn" aria-hidden />
          Breakpoint on line {line}: stop only when
        </label>
        <input
          id="bp-condition"
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="e.g. lo == hi"
          spellCheck={false}
          autoComplete="off"
          className="mt-2 w-full rounded-md border border-line-strong bg-app px-2.5 py-1.5 font-mono text-xs text-fg placeholder:text-fg-muted focus:border-fwd focus:outline-none"
        />
        <p className="mt-1.5 text-[11px] text-fg-muted">
          Any CodeTime expression over the variables in scope. Leave empty to always stop.
        </p>
        <div className="mt-3 flex items-center justify-end gap-2">
          {exists && (
            <button type="button" onClick={onRemove} className="mr-auto rounded-md px-2 py-1 text-xs text-err hover:bg-err/10">
              Remove breakpoint
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-md px-2.5 py-1 text-xs text-fg-2 hover:bg-hover">
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-fwd px-2.5 py-1 text-xs font-semibold text-app hover:brightness-110">
            {exists ? 'Save' : 'Add breakpoint'}
          </button>
        </div>
      </form>
    </div>
  );
};
