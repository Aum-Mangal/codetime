import React, { useEffect, useRef, useState } from 'react';
import MonacoEditor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoNS, IDisposable, Position } from 'monaco-editor';
import type { VariableSnapshot } from '@codetime/compiler';
import { registerCodeTimeLanguage, LANGUAGE_ID, THEME_NAME } from '../monaco/codetimeLanguage';
import type { BreakpointSpec, Diagnostic } from '../worker/protocol';
import { BreakpointPopover } from './BreakpointPopover';

export interface LastChange {
  step: number;
  line: number;
}

export interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  /** The line of the current step while debugging. */
  activeLine?: number;
  breakpoints: BreakpointSpec[];
  onToggleBreakpoint: (line: number) => void;
  /** Replace the breakpoint on `line`; null removes it. */
  onUpdateBreakpoint: (line: number, spec: BreakpointSpec | null) => void;
  diagnostics: Diagnostic[];
  /** Variables of the innermost frame at the current step, for hover and inline values. */
  locals: VariableSnapshot[];
  globals: VariableSnapshot[];
  /** Line of each variable's last write at the current step; inline values are shown there. */
  lastWriteLines: Record<string, number>;
  /** Ask the debugger when a variable was last written; null when it never was. */
  onQueryLastChange: (name: string) => Promise<LastChange | null>;
  /** Filled with a function that moves the cursor to a position (used by Problems). */
  revealRef?: React.MutableRefObject<((line: number, column: number) => void) | null>;
}

const MAX_INLINE_VALUE = 32;
/** How far above the current line a parameter's declaration is looked for. */
const PARAM_SCAN_LINES = 200;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shorten = (s: string) => (s.length > MAX_INLINE_VALUE ? `${s.slice(0, MAX_INLINE_VALUE - 1)}…` : s);

/**
 * Where to show each variable's current value: on the line of its last write
 * in the recording. Parameters are written by the call, not by a statement,
 * so they go on the nearest `fn` line above the current line that declares them.
 */
function inlineValues(
  lines: string[],
  activeLine: number,
  variables: VariableSnapshot[],
  lastWriteLines: Record<string, number>,
): Map<number, string[]> {
  const byLine = new Map<number, string[]>();
  const add = (line: number, v: VariableSnapshot) => {
    const entries = byLine.get(line) ?? [];
    entries.push(`${v.name} = ${shorten(v.displayValue)}`);
    byLine.set(line, entries);
  };
  for (const v of variables) {
    const written = lastWriteLines[v.name];
    if (written) {
      add(written, v);
      continue;
    }
    const param = new RegExp(`\\bfn\\b[^(]*\\(([^)]*\\b${escapeRegExp(v.name)}\\b[^)]*)\\)`);
    for (let i = activeLine - 1; i >= 0 && i >= activeLine - PARAM_SCAN_LINES; i--) {
      if (param.test(lines[i] ?? '')) {
        add(i + 1, v);
        break;
      }
    }
  }
  return byLine;
}

export const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  activeLine,
  breakpoints,
  onToggleBreakpoint,
  onUpdateBreakpoint,
  diagnostics,
  locals,
  globals,
  lastWriteLines,
  onQueryLastChange,
  revealRef,
}) => {
  // A local shadows a global of the same name.
  const variables = React.useMemo(
    () => [...locals, ...globals.filter((g) => !locals.some((l) => l.name === g.name))],
    [locals, globals],
  );
  const editorRef = useRef<MonacoNS.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const currentLineRef = useRef<MonacoNS.IEditorDecorationsCollection | null>(null);
  const breakpointRef = useRef<MonacoNS.IEditorDecorationsCollection | null>(null);
  const inlineRef = useRef<MonacoNS.IEditorDecorationsCollection | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);
  const [editorReady, setEditorReady] = useState(false);
  const [popover, setPopover] = useState<{ line: number; top: number } | null>(null);

  // Monaco keeps the first handler it is given, so callbacks and data are read through refs.
  const latest = useRef({ onToggleBreakpoint, variables, onQueryLastChange, breakpoints });
  latest.current = { onToggleBreakpoint, variables, onQueryLastChange, breakpoints };

  const handleBeforeMount: BeforeMount = (monaco) => registerCodeTimeLanguage(monaco);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    currentLineRef.current = editor.createDecorationsCollection();
    breakpointRef.current = editor.createDecorationsCollection();
    inlineRef.current = editor.createDecorationsCollection();
    if (revealRef) {
      revealRef.current = (lineNumber, column) => {
        editor.revealLineInCenter(lineNumber);
        editor.setPosition({ lineNumber, column });
        editor.focus();
      };
    }

    // Gutter: left click toggles a breakpoint, right click edits its condition.
    disposablesRef.current.push(editor.onMouseDown((e) => {
      const { MouseTargetType } = monaco.editor;
      if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.type !== MouseTargetType.GUTTER_LINE_NUMBERS) return;
      const line = e.target.position?.lineNumber;
      if (!line) return;
      if (e.event.rightButton) {
        e.event.preventDefault();
        setPopover({ line, top: editor.getTopForLineNumber(line) - editor.getScrollTop() + editor.getOption(monaco.editor.EditorOption.lineHeight) });
      } else if (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
        latest.current.onToggleBreakpoint(line);
      }
    }));
    disposablesRef.current.push(editor.onDidScrollChange(() => setPopover(null)));

    // Hover an identifier while debugging: its value at the current step and when it last changed.
    disposablesRef.current.push(monaco.languages.registerHoverProvider(LANGUAGE_ID, {
      provideHover: async (model: MonacoNS.ITextModel, position: Position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const variable = latest.current.variables.find((v) => v.name === word.word);
        if (!variable) return null;
        const change = await latest.current.onQueryLastChange(variable.name);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        return {
          range,
          contents: [
            { value: `\`${variable.name}\` *${variable.type}* = \`${variable.displayValue.replace(/`/g, "'")}\`` },
            {
              value: change
                ? `Last changed at step ${(change.step + 1).toLocaleString('en-US')} (line ${change.line})`
                : 'Not changed before this step',
            },
          ],
        };
      },
    }));
    setEditorReady(true);
  };

  useEffect(() => () => disposablesRef.current.forEach((d) => d.dispose()), []);

  // Current line.
  useEffect(() => {
    if (!editorRef.current || !editorReady) return;
    if (!activeLine) {
      currentLineRef.current?.clear();
      return;
    }
    const bp = breakpoints.find((b) => b.line === activeLine);
    currentLineRef.current?.set([{
      range: { startLineNumber: activeLine, startColumn: 1, endLineNumber: activeLine, endColumn: 1 },
      options: {
        isWholeLine: true,
        className: 'ct-current-line',
        glyphMarginClassName: `ct-current-glyph${bp ? (bp.condition ? ' ct-breakpoint-conditional' : ' ct-breakpoint') : ''}`,
        stickiness: 1,
      },
    }]);
  }, [activeLine, breakpoints, editorReady]);

  // Follow the current line, only when it moves (not when breakpoints change).
  useEffect(() => {
    if (activeLine && editorReady) editorRef.current?.revealLineInCenterIfOutsideViewport(activeLine);
  }, [activeLine, editorReady]);

  // Breakpoint glyphs. Re-applied on every edit: Monaco moves decorations with
  // the text, but a breakpoint belongs to its line number.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !editorReady) return;
    const lineCount = editor.getModel()?.getLineCount() ?? 0;
    breakpointRef.current?.set(breakpoints.filter(({ line }) => line <= lineCount && line !== activeLine).map(({ line, condition }) => ({
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: {
        glyphMarginClassName: condition ? 'ct-breakpoint-conditional' : 'ct-breakpoint',
        glyphMarginHoverMessage: {
          value: condition
            ? `Conditional breakpoint: \`${condition}\` (right-click to edit)`
            : 'Breakpoint (right-click to add a condition)',
        },
      },
    })));
  }, [breakpoints, value, activeLine, editorReady]);

  // Inline values next to the assignments that led to the current step.
  useEffect(() => {
    if (!editorReady) return;
    if (!activeLine || variables.length === 0) {
      inlineRef.current?.clear();
      return;
    }
    const lines = value.split('\n');
    const byLine = inlineValues(lines, activeLine, variables, lastWriteLines);
    inlineRef.current?.set([...byLine].map(([line, entries]) => ({
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: (lines[line - 1]?.length ?? 0) + 1 },
      options: { after: { content: entries.join(', '), inlineClassName: 'ct-inline-value' } },
    })));
  }, [activeLine, variables, lastWriteLines, value, editorReady]);

  // Live diagnostics as Monaco markers.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!monaco || !model || !editorReady) return;
    monaco.editor.setModelMarkers(model, 'codetime', diagnostics.filter((d) => d.line <= model.getLineCount()).map((d) => {
      const word = model.getWordAtPosition({ lineNumber: d.line, column: d.column });
      return {
        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: d.hint ? `${d.message}\n${d.hint}` : d.message,
        source: d.kind,
        startLineNumber: d.line,
        startColumn: word?.startColumn ?? d.column,
        endLineNumber: d.line,
        endColumn: word?.endColumn ?? d.column + 1,
      };
    }));
  }, [diagnostics, editorReady]);

  const popoverBreakpoint = popover ? breakpoints.find((b) => b.line === popover.line) : undefined;

  return (
    <div className="h-full w-full relative overflow-hidden bg-app">
      <MonacoEditor
        height="100%"
        language={LANGUAGE_ID}
        theme={THEME_NAME}
        value={value}
        onChange={(val) => onChange(val ?? '')}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        options={{
          fontSize: 13,
          lineHeight: 20,
          fontFamily: "'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          glyphMargin: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          padding: { top: 8, bottom: 8 },
          folding: false,
          renderLineHighlight: 'line',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          contextmenu: false,
          hover: { delay: 250 },
          fixedOverflowWidgets: true,
        }}
      />
      {popover && (
        <BreakpointPopover
          line={popover.line}
          top={popover.top}
          condition={popoverBreakpoint?.condition ?? ''}
          exists={Boolean(popoverBreakpoint)}
          onSave={(condition) => {
            onUpdateBreakpoint(popover.line, condition ? { line: popover.line, condition } : { line: popover.line });
            setPopover(null);
          }}
          onRemove={() => {
            onUpdateBreakpoint(popover.line, null);
            setPopover(null);
          }}
          onClose={() => {
            setPopover(null);
            editorRef.current?.focus();
          }}
        />
      )}
    </div>
  );
};
