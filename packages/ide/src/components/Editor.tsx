import React, { useEffect, useRef } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { registerCodeTimeLanguage, LANGUAGE_ID, THEME_NAME } from '../monaco/codetimeLanguage';
import type { BreakpointSpec } from '../worker/protocol';

export interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  activeLine?: number;
  isDebugging?: boolean;
  onToggleBreakpoint?: (line: number) => void;
  /** Right-click in the gutter: add or edit a breakpoint condition. */
  onEditBreakpointCondition?: (line: number) => void;
  breakpoints?: BreakpointSpec[];
}

export const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  activeLine,
  isDebugging,
  onToggleBreakpoint,
  onEditBreakpointCondition,
  breakpoints = [],
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const lineDecorationsRef = useRef<string[]>([]);
  const breakpointDecorationsRef = useRef<string[]>([]);
  // Monaco keeps the first handler it is given, so read callbacks through refs.
  const toggleRef = useRef(onToggleBreakpoint);
  const editConditionRef = useRef(onEditBreakpointCondition);
  toggleRef.current = onToggleBreakpoint;
  editConditionRef.current = onEditBreakpointCondition;

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerCodeTimeLanguage(monaco);

    // Glyph margin: left click toggles a breakpoint, right click edits its condition.
    editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const line = e.target.position?.lineNumber;
      if (!line) return;
      if (e.event.rightButton) editConditionRef.current?.(line);
      else toggleRef.current?.(line);
    });
  };

  // Update active line decoration
  useEffect(() => {
    if (!editorRef.current || !activeLine || !isDebugging) {
      if (editorRef.current && lineDecorationsRef.current.length > 0) {
        lineDecorationsRef.current = editorRef.current.deltaDecorations(lineDecorationsRef.current, []);
      }
      return;
    }

    const newDecorations = [
      {
        range: {
          startLineNumber: activeLine,
          startColumn: 1,
          endLineNumber: activeLine,
          endColumn: 1000,
        },
        options: {
          isWholeLine: true,
          className: 'debug-active-line',
          glyphMarginClassName: 'bg-sky-400 w-2.5 h-2.5 rounded-full my-auto ml-1.5',
        },
      },
    ];

    lineDecorationsRef.current = editorRef.current.deltaDecorations(
      lineDecorationsRef.current,
      newDecorations
    );

    editorRef.current.revealLineInCenterIfOutsideViewport(activeLine);
  }, [activeLine, isDebugging]);

  // Breakpoint glyphs. Re-applied on every edit too: Monaco moves decorations
  // with the text, but a breakpoint belongs to its line number.
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const lineCount: number = editorRef.current.getModel()?.getLineCount() ?? 0;
    const decorations = breakpoints.filter(({ line }) => line <= lineCount).map(({ line, condition }) => ({
      range: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1,
      },
      options: {
        isWholeLine: false,
        glyphMarginClassName: condition
          ? 'bg-amber-400 w-3 h-3 rounded-sm my-auto ml-1 cursor-pointer'
          : 'bg-rose-500 w-3 h-3 rounded-full my-auto ml-1 cursor-pointer',
        glyphMarginHoverMessage: {
          value: condition
            ? `Conditional breakpoint: \`${condition}\` (right-click to edit)`
            : 'Breakpoint (right-click to add a condition)',
        },
      },
    }));

    breakpointDecorationsRef.current = editorRef.current.deltaDecorations(
      breakpointDecorationsRef.current,
      decorations
    );
  }, [breakpoints, value]);

  return (
    <div className="h-full w-full relative overflow-hidden bg-slate-950">
      <MonacoEditor
        height="100%"
        language={LANGUAGE_ID}
        theme={THEME_NAME}
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 13,
          fontFamily: "'Fira Code', monospace",
          minimap: { enabled: false },
          lineNumbers: 'on',
          glyphMargin: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          wordWrap: 'on',
          padding: { top: 12, bottom: 12 },
          folding: true,
          renderLineHighlight: 'all',
        }}
      />
    </div>
  );
};
