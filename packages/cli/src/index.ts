#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Lexer,
  Parser,
  VM,
  compile,
  printAST,
  disassembleChunk,
  isCodeTimeError,
  DEFAULT_MAX_INSTRUCTIONS,
  type CodeTimeError,
} from '@codetime/compiler';

const VERSION = '1.2.0';

/** Exit codes: distinguish "your program is invalid" from "your program crashed". */
const EXIT_COMPILE_ERROR = 1;
const EXIT_RUNTIME_ERROR = 2;
const EXIT_USAGE_ERROR = 64;

function printHelp(): void {
  console.log(`
CodeTime CLI — A programming language with time-travel debugging (v${VERSION})

Usage:
  codetime run <file.ct>       Execute a CodeTime source file
  codetime tokens <file.ct>    Display lexical tokens
  codetime ast <file.ct>       Display abstract syntax tree (AST)
  codetime compile <file.ct>   Display disassembled bytecode chunk
  codetime eval "<code>"       Execute inline CodeTime code
  codetime --version, -v       Show version
  codetime --help, -h          Show this help message

Options:
  --max-steps <n>   Stop after n VM instructions (default ${DEFAULT_MAX_INSTRUCTIONS.toLocaleString('en-US')}, 0 = unlimited)

Exit codes:
  0 success, 1 compile error, 2 runtime error, 64 usage error

Examples:
  codetime run examples/fibonacci.ct
  codetime compile examples/arrays.ct
  codetime eval "print(2 + 3 * 4)"
`);
}

function usageError(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(EXIT_USAGE_ERROR);
}

function readFile(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    usageError(`File not found '${filePath}'`);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

function reportDiagnostics(diagnostics: CodeTimeError[], source: string): void {
  console.error(diagnostics.map(d => d.format(source)).join('\n\n'));
}

function runSource(source: string, maxInstructions: number): void {
  const compiled = compile(source);
  for (const warning of compiled.warnings) {
    console.error(warning.format(source) + '\n');
  }
  if (!compiled.chunk) {
    reportDiagnostics(compiled.diagnostics, source);
    process.exit(EXIT_COMPILE_ERROR);
  }

  const vm = new VM(source, { maxInstructions });
  const result = vm.run(compiled.chunk);

  if (result.output.length > 0) {
    console.log(result.output.join('\n'));
  }

  if (!result.success && result.error) {
    console.error(result.error.format(source));
    process.exit(EXIT_RUNTIME_ERROR);
  }
}

function showTokens(filePath: string): void {
  const source = readFile(filePath);
  const tokens = new Lexer(source).tokenize();

  console.log(`Tokens for ${filePath}:\n`);
  for (const t of tokens) {
    const loc = `${t.loc.line.toString().padStart(3, ' ')}:${t.loc.column.toString().padEnd(3, ' ')}`;
    console.log(`  [${loc}]  ${t.type.padEnd(16, ' ')}  ${JSON.stringify(t.value)}`);
  }
}

function showAST(filePath: string): void {
  const source = readFile(filePath);
  const { program, errors } = new Parser(new Lexer(source).tokenize(), source).parseProgram();
  if (errors.length > 0) {
    reportDiagnostics(errors, source);
    process.exit(EXIT_COMPILE_ERROR);
  }

  console.log(`AST for ${filePath}:\n`);
  console.log(printAST(program));
}

function showBytecode(filePath: string): void {
  const source = readFile(filePath);
  const compiled = compile(source);
  if (!compiled.chunk) {
    reportDiagnostics(compiled.diagnostics, source);
    process.exit(EXIT_COMPILE_ERROR);
  }

  console.log(disassembleChunk(compiled.chunk, path.basename(filePath)));
}

/** Extract `--max-steps <n>` from argv, returning the remaining positional args. */
function parseOptions(argv: string[]): { positional: string[]; maxInstructions: number } {
  const positional: string[] = [];
  let maxInstructions = DEFAULT_MAX_INSTRUCTIONS;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--max-steps') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 0) {
        usageError('--max-steps expects a non-negative integer.');
      }
      maxInstructions = value;
    } else {
      positional.push(arg);
    }
  }
  return { positional, maxInstructions };
}

function main(): void {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h') || rawArgs[0] === 'help') {
    printHelp();
    return;
  }

  if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
    console.log(`CodeTime v${VERSION}`);
    return;
  }

  const { positional, maxInstructions } = parseOptions(rawArgs);
  const [command, target] = positional;

  const requireTarget = (what: string): string => target ?? usageError(`Missing ${what} for "${command}".`);

  switch (command) {
    case 'run':
      runSource(readFile(requireTarget('file path')), maxInstructions);
      break;
    case 'tokens':
      showTokens(requireTarget('file path'));
      break;
    case 'ast':
      showAST(requireTarget('file path'));
      break;
    case 'compile':
      showBytecode(requireTarget('file path'));
      break;
    case 'eval':
      runSource(requireTarget('code string'), maxInstructions);
      break;
    default:
      if (command && fs.existsSync(path.resolve(process.cwd(), command))) {
        // If user passed a file directly: codetime file.ct
        runSource(readFile(command), maxInstructions);
      } else {
        usageError(`Unknown command '${command}'. Use --help for usage.`);
      }
  }
}

try {
  main();
} catch (err) {
  if (isCodeTimeError(err)) {
    console.error(err.format());
    process.exit(EXIT_COMPILE_ERROR);
  }
  // Anything else is a bug in CodeTime itself, not in the user's program.
  console.error('Internal error in CodeTime (please report this):', err);
  process.exit(EXIT_RUNTIME_ERROR);
}
