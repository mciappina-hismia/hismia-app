import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@hismia/types': new URL('../../packages/types/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['prisma/profile.database.test.ts'],
    environment: 'node',
    globals: false,
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
