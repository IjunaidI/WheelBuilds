module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['@swc/jest', { jsc: { target: 'es2022' } }] },
  moduleNameMapper: { '^(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testTimeout: 30000,
}
