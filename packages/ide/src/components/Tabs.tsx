import React from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Shown after the label, e.g. a count. */
  badge?: React.ReactNode;
}

export interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  /** Extra content on the right of the tab strip. */
  children?: React.ReactNode;
}

/** A tab strip with the design's 2px underline; arrow keys move between tabs. */
export function Tabs<T extends string>({ tabs, active, onChange, label, children }: TabsProps<T>) {
  return (
    <div className="flex h-9 shrink-0 items-center border-b border-line pl-1 pr-2">
      <div role="tablist" aria-label={label} className="flex h-full">
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => {
                const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                if (!delta) return;
                const next = tabs[(i + delta + tabs.length) % tabs.length]!;
                onChange(next.id);
                document.getElementById(`tab-${next.id}`)?.focus();
              }}
              className={`flex h-full items-center gap-1.5 border-b-2 px-3 text-xs font-medium transition ${
                selected ? 'border-fwd text-fg' : 'border-transparent text-fg-muted hover:text-fg-2'
              }`}
            >
              {tab.label}
              {tab.badge}
            </button>
          );
        })}
      </div>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
