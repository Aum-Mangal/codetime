#!/usr/bin/env node
/**
 * Runs every examples/*.ct through the built CLI (`codetime run`) and compares
 * stdout with the checked-in examples/*.expected. Exits 1 on any difference.
 *
 * Usage: npm run build && node scripts/check-golden.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'packages/cli/dist/index.js');
const examples = path.join(root, 'examples');
const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/\n+$/, '');

let failures = 0;
for (const file of readdirSync(examples).filter((f) => f.endsWith('.ct')).sort()) {
  const expected = normalize(readFileSync(path.join(examples, file.replace(/\.ct$/, '.expected')), 'utf-8'));
  let actual;
  try {
    actual = normalize(execFileSync(process.execPath, [cli, 'run', path.join(examples, file)], { encoding: 'utf-8' }));
  } catch (err) {
    actual = `<exit code ${err.status}>\n${normalize(String(err.stdout ?? ''))}\n${normalize(String(err.stderr ?? ''))}`;
  }
  if (actual === expected) {
    console.log(`ok    ${file}`);
  } else {
    failures++;
    console.log(`FAIL  ${file}\n--- expected\n${expected}\n--- actual\n${actual}\n`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} example(s) did not match their .expected output.`);
  process.exit(1);
}
