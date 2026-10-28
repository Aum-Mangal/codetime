/**
 * Use the Monaco build bundled by Vite instead of @monaco-editor/react's
 * default of fetching it from a CDN at runtime. The IDE then works offline,
 * has no third-party script dependency, and ships a version pinned by the
 * lockfile (and covered by `npm audit`).
 *
 * Only the core editor API plus the editing features the IDE uses are
 * imported. The full `monaco-editor` entry would also bundle ~9 MB of
 * TypeScript/JSON/CSS/HTML language services that CodeTime never uses.
 */
import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/codicon/register';
import 'monaco-editor/features/codeEditor/register';
import 'monaco-editor/features/bracketMatching/register';
import 'monaco-editor/features/clipboard/register';
import 'monaco-editor/features/comment/register';
import 'monaco-editor/features/contextmenu/register';
import 'monaco-editor/features/cursorUndo/register';
import 'monaco-editor/features/find/register';
import 'monaco-editor/features/folding/register';
import 'monaco-editor/features/hover/register';
import 'monaco-editor/features/linesOperations/register';
import 'monaco-editor/features/multicursor/register';
import 'monaco-editor/features/suggest/register';
import 'monaco-editor/features/wordHighlighter/register';
import 'monaco-editor/features/wordOperations/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

self.MonacoEnvironment = {
  // CodeTime's language support is a Monarch tokenizer, so only the base
  // editor worker is needed (no TypeScript/JSON/CSS language workers).
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
