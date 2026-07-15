module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      { jsc: { target: 'es2022', transform: { react: { runtime: 'automatic' } } } },
    ],
  },
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testTimeout: 30000,
}
