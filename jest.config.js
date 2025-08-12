/**
 * Jest Configuration for DEX Module
 * 
 * Configured for real integration testing without mocks
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/dydx-reference/**',
    '!src/uniswap-reference/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Setup files - updated path if exists
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  
  // Test timeout for integration tests with real components
  testTimeout: 30000,
  
  // Module name mapping for real implementations
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Map to actual Validator module implementations
    '^@validator/(.*)$': '<rootDir>/../Validator/src/$1',
    '^@bazaar/(.*)$': '<rootDir>/../Bazaar/src/$1',
    '^@coin/(.*)$': '<rootDir>/../Coin/src/$1',
    '^@wallet/(.*)$': '<rootDir>/../Wallet/src/$1'
  },
  
  // Globals for test environment
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        target: 'ES2022',
        lib: ['ES2022'],
        module: 'commonjs'
      }
    }
  },
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/dydx-reference/',
    '/uniswap-reference/'
  ],
  
  // Verbose output for debugging
  verbose: true,
  
  // Run tests in band for integration tests to avoid conflicts
  maxWorkers: 1,
  
  // Clear mocks between tests (though we're not using mocks anymore!)
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true
};