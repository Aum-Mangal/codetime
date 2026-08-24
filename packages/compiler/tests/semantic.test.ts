import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer, SemanticError } from '../src/semantic/analyzer.js';

function analyze(source: string): SemanticError[] {
  const tokens = new Lexer(source).tokenize();
  const parser = new Parser(tokens, source);
  const ast = parser.parse();
  const analyzer = new SemanticAnalyzer(source);
  const result = analyzer.analyze(ast);
  return result.errors;
}

describe('Semantic Analyzer — Scope & Variable Resolution', () => {
  it('passes on valid variable declaration and usage', () => {
    const src = `
let x = 10
let y = x + 5
print(x, y)
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(0);
  });

  it('detects undefined variable usage', () => {
    const src = `let x = undefinedVar + 1`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Undefined variable 'undefinedVar'");
  });

  it('detects duplicate variable declarations in same scope', () => {
    const src = `
let x = 1
let x = 2
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Cannot redeclare variable 'x'");
  });

  it('allows shadowing in nested block scopes', () => {
    const src = `
let x = 10
if true {
  let x = 20
  print(x)
}
print(x)
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(0);
  });

  it('detects assignment to undefined variables', () => {
    const src = `z = 100`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Cannot assign to undefined variable 'z'");
  });

  it('recognizes global built-ins (print, len, typeof, int, str, float, bool)', () => {
    const src = `
print(len([1, 2]), typeof("abc"), int(3.14), str(42), float(10), bool(1))
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(0);
  });
});

describe('Semantic Analyzer — Functions & Returns', () => {
  it('supports function hoisting at top level', () => {
    const src = `
let res = add(2, 3)

fn add(a, b) {
  return a + b
}
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(0);
  });

  it('detects duplicate function declarations', () => {
    const src = `
fn test() {}
fn test() {}
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Duplicate function declaration 'test'");
  });

  it('detects duplicate parameter names', () => {
    const src = `
fn calc(a, a) {
  return a
}
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Duplicate parameter name 'a'");
  });

  it('detects duplicate parameter names in lambda functions', () => {
    const src = `
let f = fn(x, x) {
  return x
}
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Duplicate parameter name 'x'");
  });

  it('flags return statement outside function', () => {
    const src = `
let x = 10
return x
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("'return' statement outside of function");
  });

  it('flags incorrect argument count (arity mismatch) on static calls', () => {
    const src = `
fn multiply(a, b) {
  return a * b
}

let res = multiply(5)
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Function 'multiply' expects 2 argument(s), but received 1");
  });

  it('allows default parameters in arity calculation', () => {
    const src = `
fn greet(name, msg = "Hello") {
  return msg + " " + name
}

greet("Alice")
greet("Bob", "Hi")
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(0);
  });
});

describe('Semantic Analyzer — Loop Control (break / continue)', () => {
  it('allows break and continue inside while loops', () => {
    const src = `
while true {
  if false {
    continue
  }
  break
}
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(0);
  });

  it('allows break and continue inside for-in loops', () => {
    const src = `
for x in [1, 2, 3] {
  if x == 2 {
    continue
  }
  break
}
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(0);
  });

  it('flags break outside of loops', () => {
    const src = `
let x = 1
break
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("'break' statement outside of loop");
  });

  it('flags continue outside of loops', () => {
    const src = `
if true {
  continue
}
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("'continue' statement outside of loop");
  });
});

describe('Semantic Analyzer — Structs', () => {
  it('detects duplicate struct field names', () => {
    const src = `
struct Point {
  x,
  y,
  x
}
`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Duplicate field 'x' in struct 'Point'");
  });
});

describe('Semantic Analyzer — Error Formatting', () => {
  it('formats error with code snippet, caret, and helpful explanation', () => {
    const src = `let a = 10\nlet b = unknownVar + 5`;
    const errors = analyze(src);
    expect(errors).toHaveLength(1);
    const formatted = errors[0]!.format(src);
    expect(formatted).toContain('SemanticError:');
    expect(formatted).toContain('line 2, column 9');
    expect(formatted).toContain('^');
    expect(formatted).toContain('Explanation:');
  });
});
