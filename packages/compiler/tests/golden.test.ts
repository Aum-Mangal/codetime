/**
 * Golden-output tests: every program in examples/ has a checked-in
 * <name>.expected file with its exact output. The VM (what the CLI runs) and
 * the replay debugger (what the IDE runs) must both reproduce it.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VM, TimeTravelDebugger } from '../src/index.js';

const examplesDir = path.resolve(__dirname, '../../../examples');
const programs = fs.readdirSync(examplesDir).filter(f => f.endsWith('.ct')).sort();

function expectedOutput(file: string): string[] {
  const text = fs.readFileSync(path.join(examplesDir, file.replace(/\.ct$/, '.expected')), 'utf-8');
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

describe('Golden output of examples/*.ct', () => {
  it('every example has an .expected file', () => {
    expect(programs.length).toBeGreaterThan(0);
    for (const file of programs) {
      expect(fs.existsSync(path.join(examplesDir, file.replace(/\.ct$/, '.expected'))), file).toBe(true);
    }
  });

  it.each(programs)('%s: VM output matches', (file) => {
    const src = fs.readFileSync(path.join(examplesDir, file), 'utf-8');
    const res = new VM(src).interpret(src);
    expect(res.error).toBeUndefined();
    expect(res.output).toEqual(expectedOutput(file));
  });

  it.each(programs)('%s: replay debugger output matches', (file) => {
    const src = fs.readFileSync(path.join(examplesDir, file), 'utf-8');
    const dbg = TimeTravelDebugger.fromSource(src, { checkpointInterval: 50 });
    expect(dbg.hasRecordingError).toBe(false);
    expect(dbg.gotoEnd().snapshot.output).toEqual(expectedOutput(file));
  });
});
