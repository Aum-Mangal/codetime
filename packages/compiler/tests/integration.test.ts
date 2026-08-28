import { describe, it, expect } from 'vitest';
import { Lexer, Parser, SemanticAnalyzer, BytecodeCompiler, VM, TimeTravelDebugger } from '../src/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function runSource(source: string) {
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens, source).parse();
  const semRes = new SemanticAnalyzer(source).analyze(ast);
  if (semRes.errors.length > 0) {
    throw new Error(semRes.errors[0]!.message);
  }
  const chunk = new BytecodeCompiler('script', 'main').compile(ast);
  const vm = new VM();
  return vm.run(chunk).output;
}

describe('CodeTime E2E Integration Suite', () => {
  it('executes full arithmetic, string concatenation, and logical expressions', () => {
    const src = `
let a = 10
let b = 20
let c = (a + b) * 2 - 5
let strResult = "Value: " + str(c)
print(strResult)
`;
    const output = runSource(src);
    expect(output).toEqual(['Value: 55']);
  });

  it('executes nested loops and array operations', () => {
    const src = `
let matrix = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9]
]

let sum = 0
for row in matrix {
  for item in row {
    sum += item
  }
}
print("Sum of matrix:", sum)
`;
    const output = runSource(src);
    expect(output).toEqual(['Sum of matrix: 45']);
  });

  it('executes recursive functions and higher-order functions with closures', () => {
    const src = `
fn map(arr, mapper) {
  let result = []
  for item in arr {
    result.push(mapper(item))
  }
  return result
}

fn multiplier(factor) {
  fn multiply(x) {
    return x * factor
  }
  return multiply
}

let double = multiplier(2)
let numbers = [1, 2, 3, 4, 5]
let doubled = map(numbers, double)
print("Doubled:", doubled)
`;
    const output = runSource(src);
    expect(output).toEqual(['Doubled: [2, 4, 6, 8, 10]']);
  });

  it('executes object manipulation and struct creation', () => {
    const src = `
let person = {
  name: "Alice",
  age: 30,
  skills: ["TypeScript", "Compiler Design"]
}

person.age += 1
person.skills.push("Time-Travel Debugging")

print("Person:", person.name, "Age:", person.age)
print("Skills count:", len(person.skills))
`;
    const output = runSource(src);
    expect(output).toEqual(['Person: Alice Age: 31', 'Skills count: 3']);
  });

  it('debugger and VM produce identical output across execution', () => {
    const src = `
let result = []
let i = 1
while i <= 5 {
  if i % 2 == 0 {
    result.push("even:" + str(i))
  } else {
    result.push("odd:" + str(i))
  }
  i += 1
}
print("Result:", result)
`;
    const vmOutput = runSource(src);

    const dbg = TimeTravelDebugger.fromSource(src);
    dbg.gotoEnd();
    const dbgOutput = dbg.getCurrentSnapshot().output;

    expect(vmOutput).toEqual(dbgOutput);
    expect(vmOutput).toEqual(['Result: ["odd:1", "even:2", "odd:3", "even:4", "odd:5"]']);
  });

  it('verifies all example .ct files in examples/ directory run cleanly', () => {
    const examplesDir = path.resolve(__dirname, '../../../examples');
    const files = fs.readdirSync(examplesDir).filter(f => f.endsWith('.ct'));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const src = fs.readFileSync(path.join(examplesDir, file), 'utf-8');
      const dbg = TimeTravelDebugger.fromSource(src);
      expect(dbg.totalSteps).toBeGreaterThan(0);
      dbg.gotoEnd();
      expect(dbg.getCurrentSnapshot().output).toBeDefined();
    }
  });
});
