/**
 * YugabyteDB Configuration for DEX
 * 
 * Configures YugabyteDB as the warm storage tier in the hybrid architecture.
 * YugabyteDB provides distributed SQL with PostgreSQL compatibility.
 */

import { StorageConfig } from '../storage/HybridDEXStorage';

/**
 * Get YugabyteDB connection configuration
 * Uses PostgreSQL-compatible interface
 * @returns Database connection configuration object
 */
export function getYugabyteConfig(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  connectionTimeoutMillis: number;
  query_timeout: number;
  statement_timeout: number;
  idle_in_transaction_session_timeout: number;
} {
  return {
    host: process.env['YUGABYTE_HOST'] ?? process.env['DB_HOST'] ?? '127.0.1.1',
    port: parseInt(process.env['YUGABYTE_PORT'] ?? process.env['DB_PORT'] ?? '5433'),
    database: process.env['YUGABYTE_DB'] ?? process.env['DB_NAME'] ?? 'omnibazaar',
    user: process.env['YUGABYTE_USER'] ?? process.env['DB_USER'] ?? 'omnibazaar_dev',
    password: process.env['YUGABYTE_PASSWORD'] ?? process.env['DB_PASSWORD'] ?? 'dev_password_2025',
    max: parseInt(process.env['YUGABYTE_POOL_SIZE'] ?? '20'),
    // YugabyteDB-specific options
    connectionTimeoutMillis: 5000,
    query_timeout: 30000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 60000
  };
}

/**
 * Storage configuration for DEX with YugabyteDB
 * Maintains the hybrid architecture with YugabyteDB as warm tier
 */
export const YUGABYTE_STORAGE_CONFIG: StorageConfig = {
  // Hot tier: Redis for ultra-low latency (<10ms)
  // Active orders, current order books, session data
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379'),
    ...(process.env['REDIS_PASSWORD'] !== undefined ? { password: process.env['REDIS_PASSWORD'] } : {}),
    db: parseInt(process.env['REDIS_DB'] ?? '0')
  },
  
  // Warm tier: YugabyteDB for operational data (<100ms)
  // Recent trades, order history, market data
  postgresql: getYugabyteConfig(),
  
  // Cold tier: IPFS for archival (100ms+)
  // Historical data, audit trails, compliance records
  ipfs: {
    host: process.env['IPFS_HOST'] ?? 'localhost',
    port: parseInt(process.env['IPFS_API_PORT'] ?? '5001'),
    protocol: process.env['IPFS_PROTOCOL'] ?? 'http'
  },
  
  // Archival settings
  archival: {
    threshold: parseInt(process.env['ARCHIVAL_THRESHOLD_DAYS'] ?? '7'),
    batchSize: parseInt(process.env['ARCHIVAL_BATCH_SIZE'] ?? '100')
  }
};

/**
 * Development configuration with optional services
 * Allows running with just in-memory storage for testing
 */
export const DEV_HYBRID_CONFIG: StorageConfig = {
  redis: {
    host: 'localhost',
    port: 6379,
    db: 1
  },
  postgresql: {
    host: '127.0.1.1',  // YugabyteDB local
    port: 5433,
    database: 'omnibazaar',
    user: 'omnibazaar_dev',
    password: 'dev_password_2025',
    max: 5
  },
  ipfs: {
    host: 'localhost',
    port: 5001,
    protocol: 'http'
  },
  archival: {
    threshold: 1,  // Quick archival for testing
    batchSize: 10
  }
};

/**
 * Check which storage services are available
 * Returns configuration based on available services
 * @returns Promise resolving to service availability and appropriate config
 */
export async function detectAvailableStorage(): Promise<{
  hasRedis: boolean;
  hasYugabyte: boolean;
  hasIPFS: boolean;
  config: StorageConfig;
}> {
  const net = await import('net');
  
  // Check Redis availability
  const hasRedis = await checkServiceAvailable(
    process.env['REDIS_HOST'] ?? 'localhost',
    parseInt(process.env['REDIS_PORT'] ?? '6379'),
    net
  );
  
  // Check YugabyteDB availability
  const hasYugabyte = await checkServiceAvailable(
    process.env['DB_HOST'] ?? '127.0.1.1',
    parseInt(process.env['DB_PORT'] ?? '5433'),
    net
  );
  
  // Check IPFS availability
  const hasIPFS = await checkServiceAvailable(
    process.env['IPFS_HOST'] ?? 'localhost',
    parseInt(process.env['IPFS_API_PORT'] ?? '5001'),
    net
  );
  
  // Return appropriate configuration
  let config: StorageConfig;
  if (hasRedis && hasYugabyte && hasIPFS) {
    config = YUGABYTE_STORAGE_CONFIG;
  } else if (hasYugabyte) {
    // YugabyteDB only - can still function with warm tier
    config = {
      ...YUGABYTE_STORAGE_CONFIG,
      redis: { host: '', port: 0 }, // Will use in-memory fallback
      ipfs: { host: '', port: 0, protocol: '' } // Will skip archival
    };
  } else {
    // Fallback to pure in-memory for development
    config = {
      redis: { host: '', port: 0 },
      postgresql: { host: '', port: 0, database: '', user: '', password: '', max: 0 },
      ipfs: { host: '', port: 0, protocol: '' },
      archival: { threshold: 999, batchSize: 0 } // Effectively disabled
    };
  }
  
  return { hasRedis, hasYugabyte, hasIPFS, config };
}

/**
 * Check if a service is available on a given host:port
 * @param host - The host to check
 * @param port - The port to check
 * @param net - The net module for socket connections
 * @returns Promise resolving to true if service is available
 */
async function checkServiceAvailable(
  host: string,
  port: number,
  net: typeof import('net')
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host);
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Performance expectations by storage tier
 */
export const STORAGE_PERFORMANCE_TARGETS = {
  hot: {
    readLatency: 10,    // ms
    writeLatency: 10,   // ms
    throughput: 100000  // ops/second
  },
  warm: {
    readLatency: 100,   // ms
    writeLatency: 100,  // ms
    throughput: 10000   // ops/second
  },
  cold: {
    readLatency: 1000,  // ms
    writeLatency: 1000, // ms
    throughput: 100     // ops/second
  }
};