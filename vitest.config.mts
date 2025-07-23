import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    globals: true,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    pool: 'threads',
    watch: false,
    environment: 'node',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
      ],
      reporter: ['text'],
      all: true,
    },
  },
})
