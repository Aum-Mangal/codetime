import type { Monaco } from '@monaco-editor/react';

export const LANGUAGE_ID = 'codetime';
export const THEME_NAME = 'codetime-dark';

export function registerCodeTimeLanguage(monaco: Monaco): void {
  // Register language ID
  if (!monaco.languages.getLanguages().some((lang: any) => lang.id === LANGUAGE_ID)) {
    monaco.languages.register({ id: LANGUAGE_ID });
  }

  // Define Monarch Tokens
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    keywords: [
      'let', 'fn', 'return', 'if', 'else', 'while', 'for', 'in',
      'break', 'continue', 'true', 'false', 'null', 'print',
      'and', 'or', 'not', 'struct',
    ],
    builtins: ['len', 'typeof', 'int', 'float', 'str', 'bool'],
    operators: [
      '=', '+=', '-=', '*=', '/=', '==', '!=', '<', '<=', '>', '>=',
      '+', '-', '*', '/', '%', '**', '!', '=>',
    ],

    symbols: /[=><!~?:&|+\-*\/^%]+/,

    tokenizer: {
      root: [
        // Identifiers and keywords
        [/[a-zA-Z_][a-zA-Z0-9_]*/, {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'predefined',
            '@default': 'identifier',
          },
        }],

        // Whitespace
        { include: '@whitespace' },

        // Numbers
        [/\d+\.\d+/, 'number.float'],
        [/\d+/, 'number'],

        // Strings
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],

        // Delimiters and operators
        [/[{}()\[\]]/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        }],
        [/[,;:]/, 'delimiter'],
      ],

      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\/.*/, 'comment'],
        [/#.*/, 'comment'],
      ],
    },
  });

  // Define Custom Theme
  monaco.editor.defineTheme(THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'predefined', foreground: '4EC9B0', fontStyle: 'bold' },
      { token: 'identifier', foreground: '9CDCFE' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'number.float', foreground: 'B5CEA8' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'delimiter', foreground: '808080' },
    ],
    colors: {
      'editor.background': '#0f172a', // Slate 900
      'editor.foreground': '#f8fafc',
      'editor.lineHighlightBackground': '#1e293b',
      'editorCursor.foreground': '#38bdf8',
      'editorWhitespace.foreground': '#334155',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#38bdf8',
    },
  });
}
