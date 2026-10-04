/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
import path from 'node:path';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname = import.meta.dirname

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  build: {
    ssr: 'src/scripts/extract.ts',
    outDir: 'dist',
    target: 'node20',
    copyPublicDir: false,
    emptyOutDir: true,
    sourcemap: true,
    rolldownOptions: {
      output: {
        entryFileNames: 'extract.js',
        comments: false,
      },
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/scripts/**/*.ts'],
      exclude: ['src/scripts/extract.types.ts', ' extract.core.types.ts '],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
        },
      },
    ],
  },
});
