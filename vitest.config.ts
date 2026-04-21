import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['fake-indexeddb/auto', './src/__tests__/sw-setup.ts'] },
});
