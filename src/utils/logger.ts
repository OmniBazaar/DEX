/**
 * Logger Utility for Unified Validator DEX
 * 
 * Provides structured logging with different levels and formatting
 */

/**
 * Log level enumeration for filtering messages
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * Structure for log entries
 */
interface LogEntry {
  /** Log level name */
  level: string;
  /** Log message */
  message: string;
  /** ISO timestamp */
  timestamp: string;
  /** Optional additional data */
  data?: unknown;
}

/**
 * Logger class for structured logging
 */
class Logger {
  /** Current log level threshold */
  private logLevel: LogLevel;

  /**
   * Creates a new Logger instance
   * Reads log level from LOG_LEVEL environment variable
   */
  constructor() {
    const level = process.env['LOG_LEVEL']?.toUpperCase() ?? 'INFO';
    this.logLevel = LogLevel[level as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private formatMessage(level: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      level,
      message,
      timestamp,
      ...(data !== undefined ? { data } : {})
    };
    
    return JSON.stringify(logEntry);
  }

  private log(level: LogLevel, levelName: string, message: string, data?: unknown): void {
    if (level <= this.logLevel) {
      const formattedMessage = this.formatMessage(levelName, message, data);
      
      if (level === LogLevel.ERROR) {
        // eslint-disable-next-line no-console
        console.error(formattedMessage);
      } else if (level === LogLevel.WARN) {
        // eslint-disable-next-line no-console
        console.warn(formattedMessage);
      } else {
        // eslint-disable-next-line no-console
        console.warn(formattedMessage);
      }
    }
  }

  /**
   * Log error message
   * @param message - Error message
   * @param data - Optional additional data
   */
  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data);
  }

  /**
   * Log warning message
   * @param message - Warning message
   * @param data - Optional additional data
   */
  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, 'WARN', message, data);
  }

  /**
   * Log info message
   * @param message - Info message
   * @param data - Optional additional data
   */
  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, 'INFO', message, data);
  }

  /**
   * Log debug message
   * @param message - Debug message
   * @param data - Optional additional data
   */
  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data);
  }
}

/**
 * Global logger instance
 * @example
 * ```typescript
 * import { logger } from './utils/logger';
 * logger.info('Operation completed', { orderId: '123' });
 * ```
 */
export const logger = new Logger(); 