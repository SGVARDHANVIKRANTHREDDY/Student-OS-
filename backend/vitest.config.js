import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**', 'middleware/**', 'routes/**'],
    },
    // Isolate test files so DB state doesn't leak between suites
    pool: 'forks',
    testTimeout: 15000,
    env: {
      JWT_SECRET: 'test-jwt-secret-for-ci',
      SESSION_SECRET: 'test-session-secret',
      NODE_ENV: 'test',
    },
  },
})
