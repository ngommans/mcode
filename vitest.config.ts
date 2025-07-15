import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['test/setup-vitest.ts'],
    watch: false,
    coverage: {
      // Only include source files in coverage reports
      include: ['packages/**/src/**/*.{js,jsx,ts,tsx}'],
      
      // Exclude patterns (in addition to node_modules)
      exclude: [
        // Config files
        '**/*.config.{js,ts,cjs}',
        '**/vite.config.{js,ts}',
        '**/vitest.config.{js,ts}',
        '**/postcss.config.{js,cjs}',
        '**/tailwind.config.{js,ts}',
        '**/commitlint.config.{js,cjs}',
        '**/playwright.config.{js,ts}',
        
        // Type definition files
        '**/*.d.ts',
        '**/types/**/*.ts',
        
        // Build outputs and dependencies
        '**/dist/**',
        '**/node_modules/**',
        '**/coverage/**',
        
        // Test files
        '**/*.test.{js,ts,jsx,tsx}',
        '**/*.spec.{js,ts,jsx,tsx}',
        '**/__tests__/**',
        '**/test/**',
        
        // Environment and setup files
        '**/test/setup-*',
        '**/test-utils/**',
        
        // Exclude any remaining node_modules just to be safe
        '**/node_modules/**',
      ],
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'clover'],
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
    ],
  },
});
