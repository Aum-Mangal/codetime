import type { Monaco } from '@monaco-editor/react';
import type { editor, Position } from 'monaco-editor';

export const LANGUAGE_ID = 'codetime';
export const THEME_NAME = 'codetime-dark';

const KEYWORDS = [
  'let', 'fn', 'return', 'if', 'else', 'while', 'for', 'in',
  'break', 'continue', 'true', 'false', 'null', 'print',
  'and', 'or', 'not', 'struct',
];
const BUILTINS = ['len', 'typeof', 'int', 'float', 'str', 'bool'];

let registered = false;

/**
 * Register the CodeTime language, its theme and completions. Must run before
 * the editor is created (Monaco's `beforeMount`): a theme defined after the
 * editor exists is not applied, and the editor falls back to the light theme.
 */
export function registerCodeTimeLanguage(monaco: Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    keywords: KEYWORDS,
    builtins: BUILTINS,
    operators: [
      '=', '+=', '-=', '*=', '/=', '==', '!=', '<', '<=', '>', '>=',
      '+', '-', '*', '/', '%', '**', '!', '=>',
    ],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        // A name followed by `(` is a call (or a definition after `fn`).
        [/[a-zA-Z_]\w*(?=\s*\()/, {
          cases: { '@keywords': 'keyword', '@builtins': 'predefined', '@default': 'function' },
        }],
        [/[a-zA-Z_]\w*/, {
          cases: { '@keywords': 'keyword', '@builtins': 'predefined', '@default': 'identifier' },
        }],
        { include: '@whitespace' },
        [/\d+\.\d+/, 'number.float'],
        [/\d+/, 'number'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/[{}()[\]]/, '@brackets'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
        [/[,;:.]/, 'delimiter'],
      ],
      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\/.*/, 'comment'],
        [/#.*/, 'comment'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    comments: { lineComment: '//' },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] },
    ],
    indentationRules: { increaseIndentPattern: /\{[^}]*$/, decreaseIndentPattern: /^\s*\}/ },
  });

  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    provideCompletionItems(model: editor.ITextModel, position: Position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const { CompletionItemKind } = monaco.languages;
      const declared = new Set<string>();
      for (const m of model.getValue().matchAll(/\b(?:let|fn|struct)\s+([A-Za-z_]\w*)/g)) declared.add(m[1]!);
      return {
        suggestions: [
          ...KEYWORDS.map((k) => ({ label: k, kind: CompletionItemKind.Keyword, insertText: k, range })),
          ...BUILTINS.map((b) => ({ label: b, kind: CompletionItemKind.Function, insertText: b, range, detail: 'builtin' })),
          ...[...declared].map((d) => ({ label: d, kind: CompletionItemKind.Variable, insertText: d, range })),
        ],
      };
    },
  });

  // Colors are the syntax/* and bg tokens of the design (see index.css).
  monaco.editor.defineTheme(THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'D6DEEB' },
      { token: 'keyword', foreground: 'C792EA' },
      { token: 'predefined', foreground: '5EC4D6' },
      { token: 'function', foreground: '82AAFF' },
      { token: 'identifier', foreground: 'D6DEEB' },
      { token: 'number', foreground: 'F78C6C' },
      { token: 'number.float', foreground: 'F78C6C' },
      { token: 'string', foreground: 'C3E88D' },
      { token: 'comment', foreground: '5C6773', fontStyle: 'italic' },
      { token: 'operator', foreground: '89DDFF' },
      { token: 'delimiter', foreground: '6B7588' },
    ],
    colors: {
      'editor.background': '#0A0E14',
      'editor.foreground': '#D6DEEB',
      'editor.lineHighlightBackground': '#0F141C',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#1A2740',
      'editor.inactiveSelectionBackground': '#151B26',
      'editorCursor.foreground': '#4DB8FF',
      'editorWhitespace.foreground': '#1F2733',
      'editorIndentGuide.background1': '#1B2230',
      'editorIndentGuide.activeBackground1': '#2A3443',
      'editorLineNumber.foreground': '#4A5466',
      'editorLineNumber.activeForeground': '#E6EAF2',
      'editorGutter.background': '#0A0E14',
      'editorHoverWidget.background': '#151B26',
      'editorHoverWidget.border': '#2A3443',
      'editorSuggestWidget.background': '#151B26',
      'editorSuggestWidget.border': '#2A3443',
      'editorSuggestWidget.selectedBackground': '#1A2740',
      'editorWidget.background': '#151B26',
      'editorError.foreground': '#F2707A',
      'editorWarning.foreground': '#F5B942',
      'scrollbarSlider.background': '#2A344380',
      'scrollbarSlider.hoverBackground': '#2A3443',
    },
  });
}
