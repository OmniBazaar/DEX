/**
 * Test helper to start a validator server for integration tests
 *
 * Provides methods to start and stop a real validator instance
 * for proper integration testing without mocks
 */

import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../../src/utils/logger';
import axios from 'axios';

const logger = new Logger();

/**
 * Validator test server configuration
 */
export interface ValidatorTestServerConfig {
  /** Port for HTTP API */
  port: number;
  /** WebSocket path */
  wsPath: string;
  /** Validator module path */
  validatorPath: string;
  /** Startup timeout in milliseconds */
  startupTimeout: number;
}

/**
 * Default test server configuration
 */
const DEFAULT_CONFIG: ValidatorTestServerConfig = {
  port: 3001,
  wsPath: '/ws',
  validatorPath: '/home/rickc/OmniBazaar/Validator',
  startupTimeout: 30000 // 30 seconds
};

/**
 * Validator test server manager
 */
export class ValidatorTestServer {
  private process?: ChildProcess;
  private config: ValidatorTestServerConfig;
  private isRunning = false;

  /**
   * Create validator test server
   * @param config - Server configuration
   */
  constructor(config: Partial<ValidatorTestServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the validator server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Validator server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stop();
        reject(new Error('Validator server startup timeout'));
      }, this.config.startupTimeout);

      try {
        // Start validator process
        this.process = spawn('npm', ['run', 'dev'], {
          cwd: this.config.validatorPath,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: this.config.port.toString(),
            LOG_LEVEL: 'error', // Reduce log noise in tests
            INTERNAL_API_PORT: this.config.port.toString()
          },
          stdio: ['ignore', 'pipe', 'pipe']
        });

        this.process.stdout?.on('data', (data) => {
          const output = data.toString();
          if (output.includes('Internal API server listening')) {
            clearTimeout(timeout);
            this.isRunning = true;
            // Give it a bit more time to fully initialize
            setTimeout(() => resolve(), 2000);
          }
          // Log output for debugging
          if (process.env.DEBUG_VALIDATOR) {
            console.log('[Validator]', output);
          }
        });

        this.process.stderr?.on('data', (data) => {
          const error = data.toString();
          // Log errors for debugging
          if (process.env.DEBUG_VALIDATOR) {
            console.error('[Validator Error]', error);
          }
        });

        this.process.on('error', (error) => {
          clearTimeout(timeout);
          this.isRunning = false;
          reject(error);
        });

        this.process.on('exit', (code) => {
          this.isRunning = false;
          if (code !== 0) {
            logger.error(`Validator process exited with code ${code}`);
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Stop the validator server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('Force killing validator process');
        this.process?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.process.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.process.kill('SIGTERM');
      this.isRunning = false;
    });
  }

  /**
   * Wait for server to be ready
   */
  async waitForReady(): Promise<void> {
    const maxAttempts = 30;
    const delayMs = 1000;
    const url = `http://localhost:${this.config.port}/internal/health`;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await axios.get(url);
        logger.info('Validator server is ready');
        return;
      } catch (error) {
        // Server not ready yet
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw new Error('Validator server failed to become ready');
  }

  /**
   * Check if server is running
   */
  get running(): boolean {
    return this.isRunning;
  }
}

/**
 * Global test server instance
 */
let globalTestServer: ValidatorTestServer | undefined;

/**
 * Start global test server
 */
export async function startGlobalTestServer(): Promise<void> {
  if (!globalTestServer) {
    globalTestServer = new ValidatorTestServer();
  }

  if (!globalTestServer.running) {
    await globalTestServer.start();
    await globalTestServer.waitForReady();
  }
}

/**
 * Stop global test server
 */
export async function stopGlobalTestServer(): Promise<void> {
  if (globalTestServer) {
    await globalTestServer.stop();
    globalTestServer = undefined;
  }
}

/**
 * Get test server configuration
 */
export function getTestServerConfig(): ValidatorTestServerConfig {
  return DEFAULT_CONFIG;
}