/** @type {import('jest').Config} */
const backendConfig = require('./jest.config.js');
const path = require('path');

module.exports = {
  ...backendConfig,
  roots: ['<rootDir>/../test'],
  testMatch: ['<rootDir>/../test/**/*.spec.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  // The backend ships both mime@1 (express uses `.charsets.lookup`) and
  // mime@2 nested inside superagent (uses `.getType`). Provide a shim that
  // implements both APIs so express + superagent both work in tests.
  moduleNameMapper: {
    '^mime$': path.resolve(__dirname, '..', 'test', '__mocks__', 'mime-shim.js'),
  },
};
