/**
 * Jest setup file for DEX tests
 * @file Configures Jest environment for DEX module testing
 */

/**
 * Custom matcher interface for Jest
 */
interface CustomMatchers<R = unknown> {
  toBeValidOrderId(): R;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect extends CustomMatchers {}
    interface Matchers<R> extends CustomMatchers<R> {}
    interface InverseAsymmetricMatchers extends CustomMatchers {}
  }
}

/**
 * Extends Jest matchers with custom validation functions
 */
expect.extend({
  /**
   * Validates if a received value is a valid order ID
   * @param received - The value to validate
   * @returns Jest matcher result
   */
  toBeValidOrderId(received: string) {
    const pass = typeof received === 'string' && received.length > 0;
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid order ID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid order ID`,
        pass: false,
      };
    }
  },
});

/**
 * Global test configuration - sets up test environment
 */
beforeAll(() => {
  // Set test environment variables
  process.env['NODE_ENV'] = 'test';
  process.env['VALIDATOR_ENDPOINT'] = 'localhost';
  process.env['POSTGRES_HOST'] = 'localhost';
  process.env['POSTGRES_PORT'] = '5432';
  process.env['POSTGRES_DB'] = 'omnibazaar_test';
  process.env['REDIS_HOST'] = 'localhost';
  process.env['REDIS_PORT'] = '6379';
});

/**
 * Cleanup after all tests complete
 */
afterAll(() => {
  // Clean up test environment
});

// Mock external dependencies for testing
jest.mock('ws', () => ({
  WebSocket: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    close: jest.fn(),
  })),
}));

// Suppress console.log during tests (except errors)
// eslint-disable-next-line no-console
const originalLog = console.log;
/**
 * Override console.log for test environment - only shows output when JEST_VERBOSE is true
 * @param args - Arguments to log
 */
// eslint-disable-next-line no-console
console.log = (...args: unknown[]): void => {
  if (process.env['JEST_VERBOSE'] === 'true') {
    // eslint-disable-next-line no-console
    originalLog(...args);
  }
};

