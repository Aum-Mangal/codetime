/**
 * Example programs shown in the IDE, loaded from the repository's examples/
 * folder so the CLI tests, the docs and the IDE all use the same files.
 */
const sources = import.meta.glob('../../../examples/*.ct', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface Example {
  name: string;
  label: string;
  code: string;
}

/** Display order and labels; any example not listed here is appended alphabetically. */
const LABELS: Record<string, string> = {
  hello: 'Hello World',
  fibonacci: 'Fibonacci Sequence',
  factorial: 'Recursive Factorial',
  arrays: 'Arrays & Mutation',
  loops: 'Loops & Prime Sieve',
  closures: 'Closures & Higher-Order Functions',
  sorting: 'Sorting Algorithms',
  buggy: 'Buggy Binary Search (Time-Travel Demo)',
};

const all: Example[] = Object.entries(sources).map(([file, code]) => {
  const name = file.split('/').pop()!.replace(/\.ct$/, '');
  return { name, label: LABELS[name] ?? name, code };
});

const order = Object.keys(LABELS);
const rank = (name: string) => {
  const i = order.indexOf(name);
  return i === -1 ? order.length : i;
};

export const EXAMPLES: Example[] = all.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

export const DEFAULT_EXAMPLE = 'buggy';
