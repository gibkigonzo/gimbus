import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

// Evals hit the real OpenRouter API — load .env into process.env same way Nuxt's dev server does,
// since running vitest standalone (outside `nuxt dev`) doesn't source it automatically.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  test: {
    environment: 'node',
    include: ['evals/**/*.eval.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000
  },
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '#server': fileURLToPath(new URL('./server', import.meta.url)),
      'hub:blob': fileURLToPath(new URL('./evals/mocks/hub-blob.ts', import.meta.url))
    }
  }
})
