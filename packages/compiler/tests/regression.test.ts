/**
 * Regression suite for bugs found in the project review.
 *
 * Every program here runs through BOTH execution paths (the VM used by the CLI
 * and the time-travel debugger used by the IDE) and must produce the same,
 * correct output.
 */
import { describe, it, expect } from 'vitest';
import { VM, TimeTravelDebugger, compile, Lexer, Parser } from '../src/index.js';

function runVM(src: string): string[] {
  const res = new VM(src).interpret(src);
  if (!res.success) throw res.error;
  return res.output;
}

function runDebugger(src: string): string[] {
  const dbg = TimeTravelDebugger.fromSource(src);
  if (dbg.hasRecordingError) throw new Error(dbg.recordingErrorMessage);
  dbg.gotoEnd();
  return dbg.getCurrentSnapshot().output;
}

function expectBoth(src: string, expected: string[]): void {
  expect(runVM(src)).toEqual(expected);
  expect(runDebugger(src)).toEqual(expected);
}

function vmError(src: string): string {
  const res = new VM(src).interpret(src);
  expect(res.success).toBe(false);
  return res.error!.message;
}

describe('Regression — loops and scoping', () => {
  it('let inside a for-in body gets a fresh value each iteration', () => {
    expectBoth(`
let r = []
for x in [1, 2, 3] {
  let y = x * 10
  r.push(y)
}
print(r)`, ['[10, 20, 30]']);
  });

  it('continue inside for-in advances to the next element', () => {
    expectBoth(`
let r = []
for x in [1, 2, 3] {
  if x == 2 { continue }
  r.push(x)
}
print(r)`, ['[1, 3]']);
  });

  it('continue after a let inside a while body does not leak stack slots', () => {
    expectBoth(`
let i = 0
let r = []
while i < 4 {
  let t = i * 2
  i += 1
  if i == 2 { continue }
  r.push(t)
}
print(r)`, ['[0, 4, 6]']);
  });

  it('break inside for-in with body locals exits cleanly', () => {
    expectBoth(`
let r = []
for x in [1, 2, 3, 4] {
  let doubled = x * 2
  if doubled > 4 { break }
  r.push(doubled)
}
print(r, len(r))`, ['[2, 4] 2']);
  });

  it('nested for-in loops with continue and break', () => {
    expectBoth(`
let out = []
for a in [1, 2, 3] {
  for b in [1, 2, 3] {
    if b == a { continue }
    if b > 2 { break }
    out.push(str(a) + str(b))
  }
}
print(out)`, ['["12", "21", "31", "32"]']);
  });

  it('closure capturing a loop local survives break', () => {
    expectBoth(`
let fs = []
let i = 0
while i < 3 {
  let j = i
  fs.push(fn() { return j })
  i += 1
  if i == 2 { break }
}
print(fs[0](), fs[1]())`, ['0 1']);
  });

  it('closure capturing a loop local survives continue', () => {
    expectBoth(`
let fs = []
for x in [1, 2, 3] {
  let y = x * 100
  fs.push(fn() { return y })
  if x == 2 { continue }
}
print(fs[0](), fs[1](), fs[2]())`, ['100 200 300']);
  });
});

describe('Regression — compound assignment', () => {
  it('array element += works', () => {
    expectBoth(`
let a = [1, 2, 3]
a[0] += 10
a[2] *= 3
print(a)`, ['[11, 2, 9]']);
  });

  it('object index and member compound assignment', () => {
    expectBoth(`
let o = { count: 1 }
o["count"] += 4
o.count -= 2
print(o.count)`, ['3']);
  });

  it('evaluates the target object expression only once', () => {
    expectBoth(`
let calls = 0
let arr = [5]
fn get() {
  calls += 1
  return arr
}
get()[0] += 1
print(arr, calls)`, ['[6] 1']);
  });
});

describe('Regression — default parameters', () => {
  it('uses the default when the argument is missing', () => {
    expectBoth(`
fn f(a, b = 5) { return b }
print(f(1), f(1, 2))`, ['5 2']);
  });

  it('keeps local slots aligned when defaults are used', () => {
    expectBoth(`
fn f(a, b = 5) {
  let c = 100
  return a + b + c
}
print(f(1))`, ['106']);
  });

  it('defaults can reference earlier parameters', () => {
    expectBoth(`
fn g(a, b = a * 2) { return b }
print(g(3))`, ['6']);
  });

  it('lambdas support defaults too', () => {
    expectBoth(`
let h = fn(x, y = "!") { return x + y }
print(h("hi"))`, ['hi!']);
  });
});

describe('Regression — structs', () => {
  it('constructs a struct instance with named fields', () => {
    expectBoth(`
struct Point { x, y }
let p = Point(1, 2)
print(p.x, p.y, typeof(p))
print(p)`, ['1 2 Point', 'Point { x: 1, y: 2 }']);
  });

  it('reports a semantic error on wrong field count', () => {
    const r = compile(`struct Point { x, y }\nlet p = Point(1)`);
    expect(r.diagnostics[0]?.message).toContain("expects 2 argument(s), but received 1");
  });
});

describe('Regression — semantic checks', () => {
  it('break inside a function nested in a loop is a semantic error', () => {
    const r = compile(`while true {\n  fn g() { break }\n}`);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]?.name).toBe('SemanticError');
    expect(r.diagnostics[0]?.message).toContain("'break' statement outside of loop");
  });

  it('compile errors are not reported as RuntimeError', () => {
    const res = new VM().interpret('print(nope)');
    expect(res.success).toBe(false);
    expect(res.error?.name).toBe('SemanticError');
  });

  it('warns when a let shadows an outer variable', () => {
    const r = compile(`let x = 1\nif true {\n  let x = 2\n}`);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.warnings.some(w => w.message.includes("shadows"))).toBe(true);
  });
});

describe('Regression — operator precedence', () => {
  it('unary minus binds looser than **', () => {
    expectBoth('print(-2 ** 2, 2 ** -1)', ['-4 0.5']);
  });

  it('not binds looser than comparison', () => {
    expectBoth('print(not 1 == 2, not 3 > 2 and true)', ['true false']);
  });

  it('** stays right-associative', () => {
    expectBoth('print(2 ** 3 ** 2)', ['512']);
  });
});

describe('Regression — runtime safety', () => {
  it('comparing mismatched types is a runtime error', () => {
    expect(vmError('print("10" < 9)')).toContain("Operands for '<'");
  });

  it('string comparison still works', () => {
    expectBoth('print("apple" < "banana")', ['true']);
  });

  it('printing a self-referencing array does not crash', () => {
    expectBoth(`
let a = [1]
a.push(a)
print(a)`, ['[1, [...]]']);
  });

  it('stops infinite loops with an instruction budget', () => {
    const vm = new VM(undefined, { maxInstructions: 10_000 });
    const res = vm.interpret('let i = 0\nwhile true { i += 1 }');
    expect(res.success).toBe(false);
    expect(res.error?.message).toContain('instruction limit');
  });

  it('string indexing works in both engines', () => {
    expectBoth('let s = "abc"\nprint(s[1], s.length)', ['b 3']);
  });
});

describe('Regression — parser robustness', () => {
  it('reports multiple syntax errors in one pass', () => {
    const r = compile('let = 1\nlet y = 2\nlet = 3\nprint(y)');
    expect(r.diagnostics.length).toBe(2);
    expect(r.diagnostics.every(d => d.name === 'ParserError')).toBe(true);
    expect(r.diagnostics.map(d => d.loc.line)).toEqual([1, 3]);
  });

  it('gives a clear message for an unterminated string', () => {
    const r = compile('let s = "oops\nprint(s)');
    expect(r.diagnostics[0]?.message).toContain('Unterminated string');
  });

  it('a backslash at end of input does not leak "undefined"', () => {
    const tokens = new Lexer('"abc\\').tokenize();
    expect(tokens.some(t => t.value.includes('undefined'))).toBe(false);
  });

  it('deeply nested expressions fail with a ParserError, not a crash', () => {
    const src = 'print(' + '('.repeat(5000) + '1' + ')'.repeat(5000) + ')';
    const r = compile(src);
    expect(r.diagnostics[0]?.name).toBe('ParserError');
    expect(r.diagnostics[0]?.message).toContain('nested too deeply');
  });

  it('parse() still throws the first error for backward compatibility', () => {
    expect(() => new Parser(new Lexer('let = 1').tokenize()).parse()).toThrow();
  });
});

describe('Regression — constant pool', () => {
  it('deduplicates repeated string and number constants', () => {
    const r = compile('let a = 1\nlet b = 1\nprint(a, a, a, "x", "x")');
    const strings = r.chunk!.constants.filter(c => c === 'a');
    const ones = r.chunk!.constants.filter(c => c === 1);
    expect(strings).toHaveLength(1);
    expect(ones).toHaveLength(1);
  });
});

describe('Regression — closures over null', () => {
  it('a captured variable holding null stays null after its frame returns', () => {
    expectBoth(`
fn make() {
  let x = null
  return fn() { return x }
}
print(make()())
`, ['null']);
  });

  it('assigning null through a closed-over variable sticks', () => {
    expectBoth(`
fn make() {
  let x = 1
  fn set() { x = null }
  fn get() { return x }
  return [set, get]
}
let pair = make()
pair[0]()
print(pair[1]())
`, ['null']);
  });
});

describe('Regression — resumable VM', () => {
  it('step() runs one instruction at a time to the same result as run()', () => {
    const src = 'let total = 0\nfor x in [1, 2, 3] { total += x }\nprint(total)';
    const compiled = compile(src);
    const vm = new VM(src);
    vm.load(compiled.chunk!);
    let steps = 0;
    while (vm.step() === 'running') steps++;
    expect(vm.status).toBe('halted');
    expect(vm.output).toEqual(['6']);
    expect(steps + 1).toBe(vm.instructionCount);
  });
});
