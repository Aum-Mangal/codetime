import type { SourceLocation } from '../lexer/token.js';

export type Severity = 'error' | 'warning';

/**
 * Base class for every error the CodeTime toolchain reports to users.
 *
 * All pipeline stages (lexer, parser, semantic analysis, codegen, VM) throw or
 * return subclasses of this, so consumers (CLI, IDE, tests) can render any
 * diagnostic the same way: `err.loc` for positioning, `err.format(src)` for text.
 */
export class CodeTimeError extends Error {
  public severity: Severity = 'error';
  /** Label shown in formatted output; defaults to the class name. */
  protected displayName?: string;

  constructor(
    message: string,
    public readonly loc: SourceLocation,
    public readonly source?: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'CodeTimeError';
  }

  /** The name users see, e.g. SyntaxError for a ParserError. */
  get label(): string {
    return this.displayName ?? this.name;
  }

  /** Format the error with source context and a caret under the error column. */
  format(src?: string): string {
    const sourceText = src ?? this.source;
    const name = this.label;
    const label = this.severity === 'warning' ? `${name} (warning)` : name;
    if (!sourceText) {
      return `${label} [line ${this.loc.line}, col ${this.loc.column}]: ${this.message}`;
    }

    const srcLine = sourceText.split('\n')[this.loc.line - 1] ?? '';
    const caret = ' '.repeat(Math.max(0, this.loc.column - 1)) + '^';
    const parts = [
      `${label}: ${this.message}`,
      `  --> line ${this.loc.line}, column ${this.loc.column}`,
      '',
      `  ${this.loc.line} | ${srcLine}`,
      `    | ${caret}`,
    ];
    if (this.hint) {
      parts.push('', `Explanation: ${this.hint}`);
    }
    return parts.join('\n');
  }
}

/** Raised by the bytecode compiler for limits the language cannot express (e.g. jump too large). */
export class CompileError extends CodeTimeError {
  constructor(message: string, loc: SourceLocation, source?: string) {
    super(message, loc, source);
    this.name = 'CompileError';
  }
}

export function isCodeTimeError(err: unknown): err is CodeTimeError {
  return err instanceof CodeTimeError;
}
