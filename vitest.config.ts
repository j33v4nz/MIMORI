import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      '.private/**',
      '.next/**',
      'tests/e2e/**',
      '**/__tests__/e2e-*.test.ts',
      '**/node_modules/**',
      'app/lib/services/redaction-pipeline.test.ts',
    ],
  },
});
