import React, { useEffect, useRef } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { registerCodeTimeLanguage, LANGUAGE_ID, THEME_NAME } from '../monaco/codetimeLanguage';

export interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  activeLine?: number;
  isDebugging?: boolean;
  onToggleBreakpoint?: (line: number) => void;
  breakpoints?: number[];
}

export const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  activeLine,
  isDebugging,
  onToggleBreakpoint,
  breakpoints = [],
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const lineDecorationsRef = useRef<string[]>([]);
  const breakpointDecorationsRef = useRef<string[]>([]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerCodeTimeLanguage(monaco);

    // Listen for glyph margin clicks (breakpoint toggles)
    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = e.target.position?.lineNumber;
        if (line && onToggleBreakpoint) {
          onToggleBreakpoint(line);
        }
      }
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

  // Update breakpoint glyph decorations
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const decorations = breakpoints.map((line) => ({
      range: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1,
      },
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'bg-rose-500 w-3 h-3 rounded-full my-auto ml-1 cursor-pointer',
      },
    }));

    breakpointDecorationsRef.current = editorRef.current.deltaDecorations(
      breakpointDecorationsRef.current,
      decorations
    );
  }, [breakpoints]);

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
