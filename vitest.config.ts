import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // core/ and data/ must run without any DOM shim — see CLAUDE.md §3.
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    include: ['tests/**/*.test.ts'],
  },
});
