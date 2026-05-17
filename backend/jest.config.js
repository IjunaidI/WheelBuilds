module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['@swc/jest', { jsc: { target: 'es2022' } }] },
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testTimeout: 30000,
}
