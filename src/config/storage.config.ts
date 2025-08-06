/**
 * Storage Configuration for Hybrid DEX Architecture
 * 
 * Configures the three-tier storage system:
 * - Hot: Redis (in-memory cache)
 * - Warm: PostgreSQL (operational data)
 * - Cold: IPFS (archival storage)
 */

import { StorageConfig } from '../storage/HybridDEXStorage';

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  redis: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    ...(process.env['REDIS_PASSWORD'] ? { password: process.env['REDIS_PASSWORD'] } : {}),
    db: parseInt(process.env['REDIS_DB'] || '0')
  },
  
  postgresql: {
    host: process.env['POSTGRES_HOST'] || 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] || '5432'),
    database: process.env['POSTGRES_DB'] || 'omnibazaar_dex',
    user: process.env['POSTGRES_USER'] || 'dex_user',
    password: process.env['POSTGRES_PASSWORD'] || 'dex_password',
    max: parseInt(process.env['POSTGRES_POOL_SIZE'] || '20')
  },
  
  ipfs: {
    host: process.env['IPFS_HOST'] || 'localhost',
    port: parseInt(process.env['IPFS_API_PORT'] || '5001'),
    protocol: process.env['IPFS_PROTOCOL'] || 'http'
  },
  
  archival: {
    threshold: parseInt(process.env['ARCHIVAL_THRESHOLD_DAYS'] || '7'), // Days before archiving
    batchSize: parseInt(process.env['ARCHIVAL_BATCH_SIZE'] || '100')   // Records per batch
  }
};

// Production configuration overrides
export const PRODUCTION_STORAGE_CONFIG: StorageConfig = {
  ...DEFAULT_STORAGE_CONFIG,
  redis: {
    ...DEFAULT_STORAGE_CONFIG.redis,
    // Redis Cluster endpoints for production
    host: process.env['REDIS_CLUSTER_ENDPOINT'] || DEFAULT_STORAGE_CONFIG.redis.host
  },
  postgresql: {
    ...DEFAULT_STORAGE_CONFIG.postgresql,
    // Production database with higher connection pool
    max: 50
  },
  archival: {
    threshold: 30,  // Archive after 30 days in production
    batchSize: 1000 // Larger batches for efficiency
  }
};

// Development configuration with local services
export const DEVELOPMENT_STORAGE_CONFIG: StorageConfig = {
  ...DEFAULT_STORAGE_CONFIG,
  redis: {
    host: 'localhost',
    port: 6379,
    db: 1 // Use different DB for development
  },
  postgresql: {
    host: 'localhost',
    port: 5432,
    database: 'dex_dev',
    user: 'dev_user',
    password: 'dev_password',
    max: 5 // Smaller pool for development
  },
  archival: {
    threshold: 1,  // Archive quickly for testing
    batchSize: 10  // Small batches for testing
  }
};

// Get configuration based on environment
export function getStorageConfig(): StorageConfig {
  const env = process.env['NODE_ENV'] || 'development';
  
  switch (env) {
    case 'production':
      return PRODUCTION_STORAGE_CONFIG;
    case 'development':
      return DEVELOPMENT_STORAGE_CONFIG;
    case 'test':
      return {
        ...DEVELOPMENT_STORAGE_CONFIG,
        postgresql: {
          ...DEVELOPMENT_STORAGE_CONFIG.postgresql,
          database: 'dex_test'
        }
      };
    default:
      return DEFAULT_STORAGE_CONFIG;
  }
}

// Validator-specific storage configuration
export interface ValidatorStorageConfig {
  // Validator's own storage preferences
  preferredStorageTier: 'hot' | 'warm' | 'cold';
  
  // Replication settings
  replicationFactor: number;
  syncInterval: number; // milliseconds
  
  // Performance tuning
  cacheSize: number; // MB
  maxConnections: number;
  
  // Data retention
  retentionPolicy: {
    hot: number;  // hours
    warm: number; // days
    cold: number; // days (or -1 for permanent)
  };
}

export const DEFAULT_VALIDATOR_STORAGE: ValidatorStorageConfig = {
  preferredStorageTier: 'warm',
  replicationFactor: 3,
  syncInterval: 5000, // 5 seconds
  cacheSize: 512,    // 512 MB
  maxConnections: 100,
  retentionPolicy: {
    hot: 24,      // 24 hours in Redis
    warm: 30,     // 30 days in PostgreSQL
    cold: -1      // Permanent in IPFS
  }
};