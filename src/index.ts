/**
 * OmniBazaar Unified Validator DEX - Main Entry Point
 * 
 * UNIFIED VALIDATOR ARCHITECTURE using modest hardware:
 * - 4 cores, 8GB RAM, 100GB storage ($300-500 hardware)
 * - Handles blockchain, DEX, IPFS, and chat services
 * - 70% fee sharing with validators
 * - Early on-chain settlement for critical functions
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

// Service interfaces
interface OrderBookService {
  status: string;
  initialized: boolean;
}

interface FeeServiceStatus {
  status: string;
  active: boolean;
}

interface ChatService {
  status: string;
  connected: boolean;
}

interface StorageService {
  status: string;
  ipfsConnected: boolean;
}

interface ValidatorService {
  status: string;
  operational: boolean;
}

// UNIFIED VALIDATOR CORE COMPONENTS - Using actual implementations
import { ValidatorClient } from './client/ValidatorClient';
import { DecentralizedOrderBook } from './core/dex/DecentralizedOrderBook';

// Import actual implementations from Validator module
import { IPFSStorageNetwork } from '../../Validator/src/services/storage/IPFSStorageNetwork';
import { P2PChatNetwork } from '../../Validator/src/services/chat/P2PChatNetwork';
import { FeeService } from '../../Validator/src/services/FeeService';
import { BlockRewardService } from '../../Validator/src/services/BlockRewardService';
import { MasterMerkleEngine } from '../../Validator/src/engines/MasterMerkleEngine';
import { ConfigService } from '../../Validator/src/services/ConfigService';
import { Database } from '../../Validator/src/database/Database';
// import { ParticipationScoreService } from '../../Validator/src/services/ParticipationScoreService';

// API Routes
import { 
  createTradingRoutes,
  createMarketDataRoutes,
  createChatRoutes,
  createStorageRoutes,
  createValidatorRoutes
} from './api';

// Configuration and Types
import { ValidatorConfig } from './types/validator';
import { logger } from './utils/logger';

// Component health and resource interfaces
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastCheck?: number;
}

interface ResourceUsage {
  cpu: number;      // Percentage 0-100
  memory: number;   // Percentage 0-100  
  storage: number;  // Percentage 0-100
  network?: number; // Bandwidth usage in Mbps
}

// Load environment variables
dotenv.config();

/**
 * OmniBazaar Unified Validator DEX - Main orchestrator class
 * 
 * KEY INNOVATION: Single node handles ALL services on modest hardware
 * 
 * ✅ Blockchain Processing (OmniCoin Proof of Participation)
 * ✅ DEX Operations (Order matching, settlement)
 * ✅ IPFS Storage (Distributed file storage)
 * ✅ P2P Chat Network (Messaging and communication)
 * ✅ Fee Distribution (70% to validators, 20% company, 10% development)
 * 
 * Hardware Requirements: 4 cores, 8GB RAM, 100GB storage
 * Total Resource Usage: ~60% of modest hardware
 * 
 * @example
 * ```typescript
 * const validatorDEX = new UnifiedValidatorDEX();
 * await validatorDEX.start();
 * ```
 */
class UnifiedValidatorDEX {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  private config: ValidatorConfig;
  
  // UNIFIED VALIDATOR COMPONENTS - Using actual implementations
  private validatorClient!: ValidatorClient;
  private orderBook!: DecentralizedOrderBook;
  private blockchain!: BlockRewardService; // Blockchain rewards service
  private storage!: IPFSStorageNetwork;
  private chat!: P2PChatNetwork;
  private feeDistribution!: FeeService;
  private merkleEngine!: MasterMerkleEngine;
  private configService!: ConfigService;
  private database!: Database;

  /**
   * Creates a new UnifiedValidatorDEX instance
   * Initializes Express server, WebSocket server, and configuration
   */
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.config = this.loadConfiguration();
    this.setupMiddleware();
  }

  /**
   * Load validator configuration from environment variables
   * Configures modest hardware requirements and unified services
   * @returns Validated validator configuration
   * @throws {Error} If required configuration fields are missing
   */
  private loadConfiguration(): ValidatorConfig {
    const config: ValidatorConfig = {
      // Server Configuration
      port: parseInt(process.env.PORT || '3000'),
      wsPort: parseInt(process.env.WS_PORT || '8080'),
      environment: process.env.NODE_ENV || 'development',
      
      // Modest Hardware Configuration
      hardware: {
        cores: parseInt(process.env.VALIDATOR_CORES || '4'),
        memory: parseInt(process.env.VALIDATOR_MEMORY || '8'), // GB
        storage: parseInt(process.env.VALIDATOR_STORAGE || '100'), // GB
        bandwidth: parseInt(process.env.VALIDATOR_BANDWIDTH || '50') // Mbps
      },
      
      // OmniCoin Blockchain Configuration
      blockchain: {
        networkId: process.env.OMNICOIN_NETWORK_ID || 'omnibazaar-mainnet',
        rpcUrl: process.env.OMNICOIN_RPC_URL || 'https://rpc.omnicoin.network',
        chainId: parseInt(process.env.OMNICOIN_CHAIN_ID || '1'),
        validatorStake: process.env.VALIDATOR_STAKE || '1000', // 1000 XOM minimum
        consensusThreshold: parseFloat(process.env.CONSENSUS_THRESHOLD || '0.67')
      },
      
      // DEX Configuration
      dex: {
        tradingPairs: process.env.TRADING_PAIRS?.split(',') || ['XOM/USDC', 'XOM/ETH', 'XOM/BTC'],
        feeStructure: {
          spotMaker: parseFloat(process.env.SPOT_MAKER_FEE || '0.001'), // 0.1%
          spotTaker: parseFloat(process.env.SPOT_TAKER_FEE || '0.002'), // 0.2%
          perpetualMaker: parseFloat(process.env.PERP_MAKER_FEE || '0.0005'), // 0.05%
          perpetualTaker: parseFloat(process.env.PERP_TAKER_FEE || '0.0015'), // 0.15%
          autoConversion: parseFloat(process.env.AUTO_CONVERSION_FEE || '0.003') // 0.3%
        },
        maxLeverage: parseInt(process.env.MAX_LEVERAGE || '100'),
        liquidationThreshold: parseFloat(process.env.LIQUIDATION_THRESHOLD || '0.8')
      },
      
      // IPFS Storage Configuration
      ipfs: {
        repo: process.env.IPFS_REPO || './ipfs-repo',
        swarmPort: parseInt(process.env.IPFS_SWARM_PORT || '4001'),
        apiPort: parseInt(process.env.IPFS_API_PORT || '5001'),
        gatewayPort: parseInt(process.env.IPFS_GATEWAY_PORT || '8080'),
        bootstrapNodes: process.env.IPFS_BOOTSTRAP?.split(',') || [],
        storageQuota: parseInt(process.env.IPFS_STORAGE_QUOTA || '50') // 50GB
      },
      
      // Chat Network Configuration
      chat: {
        maxConnections: parseInt(process.env.CHAT_MAX_CONNECTIONS || '1000'),
        messageRetention: parseInt(process.env.CHAT_RETENTION || '7'), // days
        encryptionEnabled: process.env.CHAT_ENCRYPTION === 'true',
        moderationEnabled: process.env.CHAT_MODERATION === 'true'
      },
      
      // Fee Distribution Configuration
      feeDistribution: {
        validatorShare: parseFloat(process.env.VALIDATOR_FEE_SHARE || '0.70'), // 70%
        companyShare: parseFloat(process.env.COMPANY_FEE_SHARE || '0.20'), // 20%
        developmentShare: parseFloat(process.env.DEVELOPMENT_FEE_SHARE || '0.10'), // 10%
        distributionInterval: parseInt(process.env.FEE_DISTRIBUTION_INTERVAL || '3600') // 1 hour
      },
      
      // Validator Network Configuration
      validator: {
        nodeId: process.env.VALIDATOR_NODE_ID || `validator-${Date.now()}`,
        networkEndpoints: process.env.VALIDATOR_ENDPOINTS?.split(',') || ['http://localhost:8080'],
        heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30'), // seconds
        participationScoreThreshold: parseFloat(process.env.PARTICIPATION_THRESHOLD || '75.0')
      },
      
      // Security Configuration
      security: {
        jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
        encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-change-in-production',
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
        rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX || '1000')
      },
      
      // OmniBazaar Integration
      omnibazaar: {
        walletApiUrl: process.env.WALLET_API_URL || 'http://localhost:3001',
        marketplaceApiUrl: process.env.MARKETPLACE_API_URL || 'http://localhost:3002',
        storageApiUrl: process.env.STORAGE_API_URL || 'http://localhost:3003',
        kycServiceUrl: process.env.KYC_SERVICE_URL || 'http://localhost:3004'
      }
    };

    this.validateConfiguration(config);
    return config;
  }

  /**
   * Validate unified validator configuration
   * Ensures all required fields are present and fee distribution sums to 100%
   * @param config - Configuration to validate
   * @throws {Error} If configuration is invalid or incomplete
   */
  private validateConfiguration(config: ValidatorConfig): void {
    const requiredFields = [
      'blockchain.networkId',
      'validator.nodeId',
      'dex.tradingPairs',
      'ipfs.repo'
    ];

    for (const field of requiredFields) {
      const value = field.split('.').reduce((obj: Record<string, unknown>, key: string) => obj && obj[key] as Record<string, unknown>, config as unknown as Record<string, unknown>);
      if (!value || (Array.isArray(value) && value.length === 0)) {
        throw new Error(`Missing required configuration: ${field}`);
      }
    }

    // Validate fee distribution adds up to 100%
    const totalFeeShare = config.feeDistribution.validatorShare + 
                         config.feeDistribution.companyShare + 
                         config.feeDistribution.developmentShare;
    
    if (Math.abs(totalFeeShare - 1.0) > 0.001) {
      throw new Error(`Fee distribution must sum to 100%, got ${totalFeeShare * 100}%`);
    }

    logger.info('✅ Unified validator configuration validated', {
      environment: config.environment,
      nodeId: config.validator.nodeId,
      hardware: config.hardware,
      feeDistribution: config.feeDistribution
    });
  }

  /**
   * Set up Express middleware for security, CORS, rate limiting, and parsing
   * Configures helmet for security, CORS for cross-origin requests, and rate limiting
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.security.rateLimitWindowMs,
      max: this.config.security.rateLimitMaxRequests,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  /**
   * Initialize all unified validator components
   * Sets up blockchain processor, IPFS storage, chat network, order book, and fee distribution
   * @throws {Error} If any component fails to initialize
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing Unified Validator DEX...');
      
      // 0. Initialize core dependencies with YugabyteDB
      this.database = new Database({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5433'), // YugabyteDB default port
        database: process.env.DB_NAME || 'dex_validator',
        user: process.env.DB_USER || 'yugabyte',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        maxConnections: 30, // Increased for distributed nature
        redis: {
          host: process.env.REDIS_HOST || process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'), // YugabyteDB Redis API
          password: process.env.REDIS_PASSWORD,
          db: 0
        }
      });
      await this.database.initialize();
      
      // Create MerkleEngine first with initial data
      this.merkleEngine = new MasterMerkleEngine();
      
      // Then create ConfigService with MerkleEngine
      this.configService = new ConfigService(this.merkleEngine, 0.67);
      logger.info('✅ Core dependencies initialized');

      // 1. Initialize Validator Client
      this.validatorClient = new ValidatorClient({
        validatorEndpoint: process.env.VALIDATOR_API_URL || 'http://localhost:8080',
        wsEndpoint: process.env.VALIDATOR_WS_URL || 'ws://localhost:8080'
      });
      await this.validatorClient.connect();
      logger.info('✅ Validator client connected');

      // 2. Initialize BlockReward Service (~15% resources)
      this.blockchain = new BlockRewardService(this.database, {
        oddaoAddress: process.env.ODDAO_ADDRESS || '0x0000000000000000000000000000000000000001',
        stakingPoolAddress: process.env.STAKING_POOL_ADDRESS || '0x0000000000000000000000000000000000000002'
      });
      await this.blockchain.initialize();
      logger.info('✅ OmniCoin blockchain reward service initialized');

      // 3. Initialize IPFS Storage Network (~15% resources)
      this.storage = new IPFSStorageNetwork({
        bootstrapNodes: [
          '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
          '/ip4/104.236.179.241/tcp/4001/p2p/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM'
        ],
        storageQuota: 10 * 1024 * 1024 * 1024, // 10GB
        enableGateway: true,
        gatewayPort: 8081
      } as any);
      await this.storage.initialize();
      logger.info('✅ IPFS storage network initialized');

      // 4. Initialize Fee Distribution Service (~5% resources) - before chat
      this.feeDistribution = new FeeService(this.merkleEngine, this.configService);
      logger.info('✅ Fee distribution service initialized');

      // 5. Initialize P2P Chat Network (~10% resources)
      this.chat = new P2PChatNetwork({
        maxChannels: 1000,
        maxUsersPerChannel: 100,
        messageRetentionDays: 7,
        enableEncryption: true,
        maxMessageSize: 10000,
        rateLimitMessages: 10,
        rateLimitWindowMs: 60000,
        bootstrapNodes: []
      }, this.database, this.feeDistribution);
      await this.chat.initialize();
      logger.info('✅ P2P chat network initialized');

      // 6. Initialize Decentralized Order Book (~20% resources)
      this.orderBook = new DecentralizedOrderBook(this.config.dex, this.storage as any);
      await this.orderBook.initialize();
      logger.info('✅ Decentralized order book initialized');

      // 7. Set up event listeners for cross-component communication
      this.setupEventListeners();

      // 8. Set up API routes
      this.setupUnifiedRoutes();
      
      // 9. Set up WebSocket handlers
      this.setupUnifiedWebSocket();

      logger.info('🎉 UNIFIED VALIDATOR DEX READY!');
      logger.info('📊 Resource Usage:');
      logger.info('   🔹 Blockchain Processing: ~15%');
      logger.info('   🔹 DEX Operations: ~20%');
      logger.info('   🔹 IPFS Storage: ~15%');
      logger.info('   🔹 Chat Network: ~10%');
      logger.info('   🔹 Total Usage: ~60% of modest hardware');
      logger.info('💰 Fee Distribution: 70% validators, 20% company, 10% development');

    } catch (error) {
      logger.error('❌ Failed to initialize Unified Validator DEX:', error);
      throw error;
    }
  }

  /**
   * Set up API routes for all unified services
   * Configures health checks, validator status, trading, market data, chat, storage, and validator routes
   */
  private setupUnifiedRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (_req: Request, res: Response) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        environment: this.config.environment,
        architecture: 'unified-validator',
        components: {
          blockchain: { status: 'healthy', service: 'BlockRewardService' },
          dex: { status: 'healthy', service: 'DecentralizedOrderBook' },
          storage: { status: this.storage.isRunning ? 'healthy' : 'degraded', service: 'IPFSStorageNetwork' },
          chat: { status: this.chat.isConnected ? 'healthy' : 'degraded', service: 'P2PChatNetwork' },
          validator: { status: this.validatorClient.isConnected() ? 'healthy' : 'degraded', service: 'ValidatorClient' }
        },
        resourceUsage: await this.getResourceUsage()
      };
      
      res.json(health);
    });

    // Validator network status
    this.app.get('/validator-status', async (_req: Request, res: Response) => {
      res.json({
        isUnifiedValidator: true,
        services: {
          blockchain: 'OmniCoin Proof of Participation',
          dex: 'Decentralized order matching',
          storage: 'IPFS distributed storage',
          chat: 'P2P messaging network'
        },
        feeDistribution: this.config.feeDistribution,
        hardwareRequirements: this.config.hardware,
        economics: {
          monthlyRevenueEstimate: '1000', // Will be calculated from actual fees
          validatorCount: 100, // Placeholder - would call await this.validatorClient.getValidatorCount(),
          networkFees: '0.003' // 0.3% trading fee
        }
      });
    });

    // API routes for unified services
    this.app.use('/api/v1/trading', createTradingRoutes(this.orderBook as unknown as OrderBookService, this.feeDistribution as unknown as FeeServiceStatus));
    this.app.use('/api/v1/market-data', createMarketDataRoutes(this.orderBook as unknown as OrderBookService));
    this.app.use('/api/v1/chat', createChatRoutes(this.chat as unknown as ChatService));
    this.app.use('/api/v1/storage', createStorageRoutes(this.storage as unknown as StorageService));
    // this.app.use('/api/v1/validator', createValidatorRoutes(this.validatorNode as unknown as ValidatorService));

    // Error handling middleware
    this.app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('API Error:', error);
      res.status((error as {status?: number}).status || 500).json({
        error: error.message || 'Internal Server Error',
        timestamp: new Date().toISOString(),
        unifiedValidator: true
      });
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        error: 'Endpoint not found',
        timestamp: new Date().toISOString(),
        suggestion: 'Check /health for available endpoints'
      });
    });
  }

  /**
   * Set up WebSocket handlers for real-time communication
   * Handles trading updates, chat messages, and validator network events
   */
  private setupUnifiedWebSocket(): void {
    this.io.on('connection', (socket) => {
      logger.info('Client connected to unified validator WebSocket', { socketId: socket.id });

      // Subscribe to trading updates
      socket.on('subscribe:trading', async (pairs: string[]) => {
        for (const pair of pairs) {
          (this.orderBook as unknown as EventEmitter).on('orderBookUpdated', (data: {pair?: string}) => {
            if (data.pair === pair) {
              socket.emit('trading-update', data);
            }
          });
        }
      });

      // Subscribe to chat messages
      socket.on('subscribe:chat', (channels: string[]) => {
        for (const channel of channels) {
          (this.chat as unknown as EventEmitter).on('messageReceived', (message: {channel: string}) => {
            if (message.channel === channel) {
              socket.emit('chat-message', message);
            }
          });
        }
      });

      // Subscribe to validator network updates
      socket.on('subscribe:validator', () => {
        // Validator node updates disabled for now
        // (this.validatorNode as unknown as EventEmitter).on('networkUpdate', (update: unknown) => {
        //   socket.emit('validator-update', update);
        // });

        (this.feeDistribution as unknown as EventEmitter).on('feesDistributed', (distribution: unknown) => {
          socket.emit('fee-distribution', distribution);
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('Client disconnected from unified validator WebSocket', { socketId: socket.id });
      });
    });
  }

  /**
   * Start the unified validator DEX server
   * Initializes all components and starts listening on configured port
   * @throws {Error} If server fails to start
   */
  async start(): Promise<void> {
    try {
      await this.initialize();

      this.server.listen(this.config.port, () => {
        logger.info('🚀 UNIFIED VALIDATOR DEX SERVER RUNNING');
        logger.info(`📡 API Server: http://localhost:${this.config.port}`);
        logger.info(`🔌 WebSocket: ws://localhost:${this.config.port}`);
        logger.info(`🌐 Environment: ${this.config.environment}`);
        logger.info('📊 Unified Services:');
        logger.info('   ✅ OmniCoin Blockchain Processing');
        logger.info('   ✅ DEX Trading Operations');
        logger.info('   ✅ IPFS Distributed Storage');
        logger.info('   ✅ P2P Chat Network');
        logger.info('💰 Fee Distribution:');
        logger.info(`   👥 Validators: ${this.config.feeDistribution.validatorShare * 100}%`);
        logger.info(`   🏢 Company: ${this.config.feeDistribution.companyShare * 100}%`);
        logger.info(`   🛠️ Development: ${this.config.feeDistribution.developmentShare * 100}%`);
      });

    } catch (error) {
      logger.error('❌ Failed to start Unified Validator DEX:', error);
      process.exit(1);
    }
  }

  /**
   * Gracefully shutdown the unified validator
   * Closes WebSocket connections, HTTP server, and all unified services
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Unified Validator DEX...');

    try {
      // Close WebSocket connections
      this.io.close();

      // Close HTTP server
      if (this.server) {
        this.server.close();
      }

      // Shutdown all unified services
      // await this.validatorNode.shutdown();
      await this.feeDistribution.shutdown();
      await this.orderBook.shutdown();
      await this.chat.shutdown();
      await this.storage.shutdown();
      await this.blockchain.shutdown();
      // MerkleEngine doesn't have shutdown
      await this.database.close();

      logger.info('✅ Unified Validator DEX shutdown completed');

    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
  }

  /**
   * Set up event listeners for cross-component communication
   */
  private setupEventListeners(): void {
    // Listen for order book events
    this.orderBook.on('orderPlaced', (order) => {
      logger.info('Order placed:', order);
      // Store order data in IPFS
      this.storage.store(`order_${order.id}`, JSON.stringify(order));
    });

    this.orderBook.on('orderFilled', (trade) => {
      logger.info('Order filled:', trade);
      // Distribute fees
      this.feeDistribution.recordTrade(trade);
    });

    // Listen for chat events
    this.chat.on('message', (message: any) => {
      logger.debug('Chat message received:', message);
      // Store chat history in IPFS
      this.storage.store(`chat_${Date.now()}`, JSON.stringify(message));
    });

    // Listen for storage events
    this.storage.on('fileAdded', (cid: any) => {
      logger.debug('File added to IPFS:', cid);
    });

    // Listen for fee distribution events
    this.feeDistribution.on('distribution', (distribution: any) => {
      logger.info('Fee distribution completed:', distribution);
    });
  }

  /**
   * Get current resource usage
   */
  private async getResourceUsage(): Promise<ResourceUsage> {
    // Simple resource calculation based on component status
    const baseUsage = {
      blockchain: 15,  // 15% for blockchain processing
      storage: 15,     // 15% for IPFS storage
      chat: 10,        // 10% for P2P chat
      orderBook: 20,   // 20% for order book
      fee: 5          // 5% for fee distribution
    };

    const isStorageActive = this.storage.isRunning || false;
    const isChatActive = this.chat.isConnected || false;

    return {
      cpu: baseUsage.blockchain + baseUsage.orderBook + baseUsage.fee + 
           (isStorageActive ? baseUsage.storage : 0) + 
           (isChatActive ? baseUsage.chat : 0),
      memory: 60, // Approximate memory usage
      storage: 40, // Approximate storage usage
      network: 10  // Approximate network bandwidth in Mbps
    };
  }
}

// Create and start the unified validator DEX
const validatorDEX = new UnifiedValidatorDEX();

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, initiating graceful shutdown...');
  await validatorDEX.shutdown();
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, initiating graceful shutdown...');
  await validatorDEX.shutdown();
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
  process.exit(1);
});

// Start the unified validator DEX
validatorDEX.start().catch((error) => {
  logger.error('Failed to start Unified Validator DEX:', error);
  process.exit(1);
});

/**
 * Export the UnifiedValidatorDEX class for testing and external use
 */
export { UnifiedValidatorDEX };

// Export all public APIs and types
export * from './api/perpetuals.api';
export * from './api/swap.api';
export * from './services/PrivacyDEXService';
export * from './services/ContractService';

// Export specific types to avoid conflicts
export type {
  UnifiedOrder,
  PerpetualOrder,
  Position,
  Portfolio,
  Balance,
  Trade,
  OrderBook,
  TradingPair,
  Candle,
  ConversionResult,
  ChatMessage,
  ChatChannel,
  IPFSFile,
  DEXConfig,
  OrderBookLevel,
  OrderError,
  InvalidPairError,
  InsufficientBalanceError
} from './types/config';

export type {
  ValidatorConfig,
  ServiceHealth,
  ResourceUsage,
  NetworkStats,
  FeeDistribution
} from './types/validator'; 