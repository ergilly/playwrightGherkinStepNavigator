/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/test/mocks/vscode.ts'
  },
  clearMocks: true
};
