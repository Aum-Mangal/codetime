import React, { useEffect, useRef } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { registerCodeTimeLanguage, LANGUAGE_ID, THEME_NAME } from '../monaco/codetimeLanguage';

export interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  activeLine?: number;
  isDebugging?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  activeLine,
  isDebugging,
}) => {
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    registerCodeTimeLanguage(monaco);
  };

  // Update line highlighting when activeLine changes
  useEffect(() => {
    if (!editorRef.current || !activeLine || !isDebugging) {
      if (editorRef.current && decorationsRef.current.length > 0) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
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
          className: 'bg-sky-500/20 border-l-4 border-sky-400',
          glyphMarginClassName: 'bg-sky-400',
        },
      },
    ];

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );

    editorRef.current.revealLineInCenterIfOutsideViewport(activeLine);
  }, [activeLine, isDebugging]);

  return (
    <div className="h-full w-full relative overflow-hidden bg-slate-900">
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
