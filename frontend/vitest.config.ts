import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Map the relative-path imports used by the source code to the same
      // resolution we use elsewhere — vite needs the trailing slash for
      // directory imports.
      'src/api/axios': path.resolve(__dirname, './src/api/axios.ts'),
      'src/api': path.resolve(__dirname, './src/api/index.ts'),
    },
  },
});
