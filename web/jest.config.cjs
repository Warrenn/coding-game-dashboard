/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@cgd/shared$': '<rootDir>/../shared/src/index.ts',
    // sinon's main field points to ESM that Jest's jsdom env can't load.
    // Pin to its CJS bundle instead. aws-sdk-client-mock pulls sinon in.
    '^sinon$': '<rootDir>/../node_modules/sinon/pkg/sinon-no-sourcemaps.cjs',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: { module: 'esnext', jsx: 'react-jsx' } }],
  },
  testMatch: [
    '<rootDir>/test/**/*.test.tsx',
    '<rootDir>/test/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
    '<rootDir>/src/**/*.test.ts',
  ],
  // Allow ESM-only deps (sinon, aws-sdk-client-mock chain) to be transformed.
  transformIgnorePatterns: [
    '/node_modules/(?!(sinon|@sinonjs|aws-sdk-client-mock|@smithy|@aws-sdk|uuid)/)',
  ],
};
