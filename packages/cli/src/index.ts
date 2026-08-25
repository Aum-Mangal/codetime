#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Lexer,
  Parser,
  SemanticAnalyzer,
  BytecodeCompiler,
  VM,
  printAST,
  disassembleChunk,
} from '@codetime/compiler';

const VERSION = '1.0.0';

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

Examples:
  codetime run examples/fibonacci.ct
  codetime compile examples/arrays.ct
  codetime eval "print(2 + 3 * 4)"
`);
}

function readFile(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found '${filePath}'`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

function runFile(filePath: string): void {
  const source = readFile(filePath);
  runSource(source, filePath);
}

function runSource(source: string, filename = '<stdin>'): void {
  const vm = new VM(source);
  const result = vm.interpret(source);

  if (result.output.length > 0) {
    console.log(result.output.join('\n'));
  }

  if (!result.success && result.error) {
    console.error(result.error.format(source));
    process.exit(1);
  }
}

function showTokens(filePath: string): void {
  const source = readFile(filePath);
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  console.log(`Tokens for ${filePath}:\n`);
  for (const t of tokens) {
    const loc = `${t.loc.line.toString().padStart(3, ' ')}:${t.loc.column.toString().padEnd(3, ' ')}`;
    console.log(`  [${loc}]  ${t.type.padEnd(16, ' ')}  ${JSON.stringify(t.value)}`);
  }
}

function showAST(filePath: string): void {
  const source = readFile(filePath);
  const tokens = new Lexer(source).tokenize();
  const parser = new Parser(tokens, source);
  const ast = parser.parse();

  console.log(`AST for ${filePath}:\n`);
  console.log(printAST(ast));
}

function showBytecode(filePath: string): void {
  const source = readFile(filePath);
  const tokens = new Lexer(source).tokenize();
  const parser = new Parser(tokens, source);
  const ast = parser.parse();

  const analyzer = new SemanticAnalyzer(source);
  const semResult = analyzer.analyze(ast);
  if (semResult.errors.length > 0) {
    console.error(semResult.errors[0]!.format(source));
    process.exit(1);
  }

  const compiler = new BytecodeCompiler('script', path.basename(filePath));
  const chunk = compiler.compile(ast);

  console.log(disassembleChunk(chunk, path.basename(filePath)));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`CodeTime v${VERSION}`);
    return;
  }

  const command = args[0];
  const target = args[1];

  switch (command) {
    case 'run':
      if (!target) {
        console.error('Error: Missing file path for "run".');
        process.exit(1);
      }
      runFile(target);
      break;

    case 'tokens':
      if (!target) {
        console.error('Error: Missing file path for "tokens".');
        process.exit(1);
      }
      showTokens(target);
      break;

    case 'ast':
      if (!target) {
        console.error('Error: Missing file path for "ast".');
        process.exit(1);
      }
      showAST(target);
      break;

    case 'compile':
      if (!target) {
        console.error('Error: Missing file path for "compile".');
        process.exit(1);
      }
      showBytecode(target);
      break;

    case 'eval':
      if (!target) {
        console.error('Error: Missing code string for "eval".');
        process.exit(1);
      }
      runSource(target, '<eval>');
      break;

    default:
      if (fs.existsSync(path.resolve(process.cwd(), command))) {
        // If user passed a file directly: codetime file.ct
        runFile(command);
      } else {
        console.error(`Unknown command '${command}'. Use --help for usage.`);
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
