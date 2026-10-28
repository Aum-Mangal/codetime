import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      // CI fails if coverage drops below these (measured: 94.6 / 84.1 / 96.9 / 95.8).
      thresholds: {
        statements: 93,
        branches: 82,
        functions: 95,
        lines: 94,
      },
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
});
