import { describe, it, expect } from 'vitest';
import { VM } from '../src/vm/vm.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function run(source: string): { output: string[]; result: any } {
  const vm = new VM(source);
  const res = vm.interpret(source);
  if (!res.success && res.error) {
    throw res.error;
  }
  return { output: res.output, result: res.result };
}

describe('VM — Arithmetic & Expressions', () => {
  it('evaluates basic arithmetic', () => {
    const { output } = run('print(2 + 3 * 4)');
    expect(output).toEqual(['14']);
  });

  it('evaluates parentheses grouping', () => {
    const { output } = run('print((2 + 3) * 4)');
    expect(output).toEqual(['20']);
  });

  it('evaluates exponentiation and right-associativity', () => {
    const { output } = run('print(2 ** 3 ** 2)');
    expect(output).toEqual(['512']);
  });

  it('evaluates integer division and float division', () => {
    const { output } = run('print(10 / 2, 7 / 2)');
    expect(output).toEqual(['5 3.5']);
  });

  it('evaluates modulo operation', () => {
    const { output } = run('print(10 % 3, 15 % 5)');
    expect(output).toEqual(['1 0']);
  });

  it('evaluates string concatenation', () => {
    const { output } = run('print("Hello " + "World" + "!")');
    expect(output).toEqual(['Hello World!']);
  });

  it('evaluates comparisons', () => {
    const src = `
print(5 > 3, 5 >= 5, 2 < 4, 3 <= 3, 10 == 10, 10 != 20)
`;
    const { output } = run(src);
    expect(output).toEqual(['true true true true true true']);
  });

  it('evaluates boolean logic with short-circuiting', () => {
    const src = `
print(true and false, true or false, not false, !true)
`;
    const { output } = run(src);
    expect(output).toEqual(['false true true false']);
  });
});

describe('VM — Variables & Scoping', () => {
  it('handles global variables and mutations', () => {
    const src = `
let x = 10
x = x + 5
print(x)
`;
    const { output } = run(src);
    expect(output).toEqual(['15']);
  });

  it('handles local scoping and shadowing', () => {
    const src = `
let x = 1
if true {
  let x = 2
  print("inner:", x)
}
print("outer:", x)
`;
    const { output } = run(src);
    expect(output).toEqual(['inner: 2', 'outer: 1']);
  });

  it('handles compound assignments', () => {
    const src = `
let a = 10
a += 5
a -= 3
a *= 2
a /= 4
print(a)
`;
    const { output } = run(src);
    expect(output).toEqual(['6']);
  });
});

describe('VM — Control Flow', () => {
  it('executes if-else branches correctly', () => {
    const src = `
let score = 85
if score >= 90 {
  print("A")
} else if score >= 80 {
  print("B")
} else {
  print("C")
}
`;
    const { output } = run(src);
    expect(output).toEqual(['B']);
  });

  it('executes while loops', () => {
    const src = `
let sum = 0
let i = 1
while i <= 5 {
  sum += i
  i += 1
}
print(sum)
`;
    const { output } = run(src);
    expect(output).toEqual(['15']);
  });

  it('handles break and continue in while loops', () => {
    const src = `
let i = 0
let evens = []
while i < 10 {
  i += 1
  if i % 2 != 0 {
    continue
  }
  if i > 6 {
    break
  }
  evens.push(i)
}
print(evens)
`;
    const { output } = run(src);
    expect(output).toEqual(['[2, 4, 6]']);
  });

  it('executes for-in loops over arrays', () => {
    const src = `
let nums = [10, 20, 30]
let total = 0
for n in nums {
  total += n
}
print(total)
`;
    const { output } = run(src);
    expect(output).toEqual(['60']);
  });
});

describe('VM — Functions & Closures', () => {
  it('executes user functions and return values', () => {
    const src = `
fn add(a, b) {
  return a + b
}
print(add(10, 20))
`;
    const { output } = run(src);
    expect(output).toEqual(['30']);
  });

  it('executes recursive factorial', () => {
    const src = `
fn fact(n) {
  if n <= 1 { return 1 }
  return n * fact(n - 1)
}
print(fact(6))
`;
    const { output } = run(src);
    expect(output).toEqual(['720']);
  });

  it('executes recursive fibonacci', () => {
    const src = `
fn fib(n) {
  if n <= 1 { return n }
  return fib(n - 1) + fib(n - 2)
}
print(fib(8))
`;
    const { output } = run(src);
    expect(output).toEqual(['21']);
  });

  it('executes closures capturing outer state', () => {
    const src = `
fn makeAdder(x) {
  return fn(y) {
    return x + y
  }
}
let add5 = makeAdder(5)
let add10 = makeAdder(10)
print(add5(3), add10(3))
`;
    const { output } = run(src);
    expect(output).toEqual(['8 13']);
  });

  it('executes mutable closures (counter)', () => {
    const src = `
fn makeCounter() {
  let count = 0
  return fn() {
    count += 1
    return count
  }
}
let c = makeCounter()
print(c(), c(), c())
`;
    const { output } = run(src);
    expect(output).toEqual(['1 2 3']);
  });
});

describe('VM — Arrays & Objects', () => {
  it('supports array indexing and length property', () => {
    const src = `
let arr = [10, 20, 30]
print(arr.length, arr[0], arr[2])
arr[1] = 99
print(arr)
`;
    const { output } = run(src);
    expect(output).toEqual(['3 10 30', '[10, 99, 30]']);
  });

  it('supports array push and pop methods', () => {
    const src = `
let list = [1, 2]
list.push(3)
print(list)
let last = list.pop()
print(last, list)
`;
    const { output } = run(src);
    expect(output).toEqual(['[1, 2, 3]', '3 [1, 2]']);
  });

  it('supports object property access and mutation', () => {
    const src = `
let user = { name: "Alice", age: 30 }
print(user.name, user.age)
user.age = 31
user["city"] = "Paris"
print(user.age, user.city)
`;
    const { output } = run(src);
    expect(output).toEqual(['Alice 30', '31 Paris']);
  });
});

describe('VM — Built-in Functions', () => {
  it('evaluates len, typeof, int, float, str, bool', () => {
    const src = `
print(len("hello"), len([1, 2, 3]))
print(typeof(42), typeof(3.14), typeof("hi"), typeof(true), typeof([]), typeof({}))
print(int(3.99), int("42"), float("3.14"), str(100), bool(1), bool(0), bool(null))
`;
    const { output } = run(src);
    expect(output).toEqual([
      '5 3',
      'integer float string boolean array object',
      '3 42 3.14 100 true false false',
    ]);
  });
});

describe('VM — Runtime Error Diagnostics', () => {
  it('throws on division by zero with source location', () => {
    const src = `
let a = 10
let b = 0
let c = a / b
`;
    const vm = new VM(src);
    const res = vm.interpret(src);
    expect(res.success).toBe(false);
    expect(res.error?.message).toContain('Division by zero');
    expect(res.error?.loc.line).toBe(4);
  });

  it('throws on array index out of bounds', () => {
    const src = `
let arr = [1, 2]
print(arr[5])
`;
    const vm = new VM(src);
    const res = vm.interpret(src);
    expect(res.success).toBe(false);
    expect(res.error?.message).toContain('Array index out of bounds');
  });

  it('includes call stack trace on function runtime error', () => {
    const src = `
fn first() { second() }
fn second() { 10 / 0 }
first()
`;
    const vm = new VM(src);
    const res = vm.interpret(src);
    expect(res.success).toBe(false);
    const formatted = res.error!.format(src);
    expect(formatted).toContain('RuntimeError: Division by zero');
    expect(formatted).toContain('Call Stack:');
    expect(formatted).toContain('at second');
    expect(formatted).toContain('at first');
  });
});

describe('VM — Example Programs Execution', () => {
  const examplesDir = path.resolve(__dirname, '../../../examples');

  it('executes hello.ct', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'hello.ct'), 'utf-8');
    const { output } = run(src);
    expect(output).toContain('Hello, World!');
  });

  it('executes fibonacci.ct', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'fibonacci.ct'), 'utf-8');
    const { output } = run(src);
    expect(output).toContain('fib(0) = 0');
    expect(output).toContain('fib(10) = 55');
  });

  it('executes factorial.ct', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'factorial.ct'), 'utf-8');
    const { output } = run(src);
    expect(output).toContain('0! = 1');
    expect(output).toContain('5! = 120');
    expect(output).toContain('10! = 3628800');
  });

  it('executes arrays.ct', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'arrays.ct'), 'utf-8');
    const { output } = run(src);
    expect(output).toContain('Length: 10');
    expect(output).toContain('Sum: 39');
    expect(output).toContain('Matrix element [1][2]: 6');
  });

  it('executes closures.ct', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'closures.ct'), 'utf-8');
    const { output } = run(src);
    expect(output).toContain('1');
    expect(output).toContain('2');
    expect(output).toContain('3');
    expect(output).toContain('101');
    expect(output).toContain('[2, 4, 6, 8, 10, 12, 14, 16, 18, 20]');
  });

  it('executes sorting.ct (bubble sort)', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'sorting.ct'), 'utf-8');
    const { output } = run(src);
    expect(output).toContain('[11, 12, 22, 25, 34, 64, 90]');
    expect(output).toContain('["apple", "banana", "cherry", "date", "elderberry"]');
  });

  it('executes loops.ct (multiplication table and prime sieve)', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'loops.ct'), 'utf-8');
    const { output } = run(src);
    expect(output).toContain('[2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]');
  });
});
