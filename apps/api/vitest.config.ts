import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    environment: 'node',
    globals: false,
  },
});
