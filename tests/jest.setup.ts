/**
 * Jest setup file for DEX tests
 */

// Extend Jest matchers
expect.extend({
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

// Global test configuration
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.VALIDATOR_ENDPOINT = 'localhost';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_DB = 'omnibazaar_test';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
});

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
const originalLog = console.log;
console.log = (...args) => {
  if (process.env.JEST_VERBOSE === 'true') {
    originalLog(...args);
  }
};

// Type declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidOrderId(): R;
    }
  }
}