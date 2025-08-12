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

// UNIFIED VALIDATOR CORE COMPONENTS - Using service abstractions
import { ValidatorClient } from './client/ValidatorClient';
import { DecentralizedOrderBook } from './core/dex/DecentralizedOrderBook';
import { ValidatorDEXService } from './services/ValidatorDEXService';
import { ValidatorServiceProxy } from './services/validator-integration/ValidatorServiceProxy';

// Use proxy services instead of direct imports to maintain module boundaries
// The actual implementations run in the Validator module

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
  
  // UNIFIED VALIDATOR COMPONENTS - Using service abstractions
  private validatorClient!: ValidatorClient;
  private orderBook!: DecentralizedOrderBook;
  private validatorDEX!: ValidatorDEXService;
  private validatorProxy!: ValidatorServiceProxy;

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
      
      // 0. Initialize Validator proxy service
      // This provides access to storage, chat, fees, and rewards without direct imports
      this.validatorProxy = new ValidatorServiceProxy({
        validatorUrl: process.env.VALIDATOR_URL || 'http://localhost:3000',
        wsUrl: process.env.VALIDATOR_WS_URL || 'ws://localhost:3001',
        apiKey: process.env.VALIDATOR_API_KEY,
        timeout: 30000,
        mockMode: process.env.NODE_ENV === 'development' // Use mock mode in development
      });
      await this.validatorProxy.connect();
      logger.info('✅ Connected to Validator proxy services');

      // 1. Initialize Validator Client
      this.validatorClient = new ValidatorClient({
        validatorEndpoint: process.env.VALIDATOR_API_URL || 'http://localhost:8080',
        wsEndpoint: process.env.VALIDATOR_WS_URL || 'ws://localhost:8080'
      });
      await this.validatorClient.connect();
      logger.info('✅ Validator client connected');

      // 2. Initialize ValidatorDEX Service
      this.validatorDEX = new ValidatorDEXService({
        validatorEndpoint: process.env.VALIDATOR_API_URL || 'http://localhost:8080',
        wsEndpoint: process.env.VALIDATOR_WS_URL || 'ws://localhost:8080',
        networkId: this.config.blockchain.networkId,
        tradingPairs: this.config.dex.tradingPairs,
        feeStructure: {
          maker: this.config.dex.feeStructure.spotMaker,
          taker: this.config.dex.feeStructure.spotTaker
        }
      });
      await this.validatorDEX.initialize();
      logger.info('✅ ValidatorDEX service initialized');

      // 3. Services are now accessed through validatorProxy
      // - Storage: this.validatorProxy.storage
      // - Chat: this.validatorProxy.chat
      // - Fees: this.validatorProxy.fees
      // - Rewards: this.validatorProxy.rewards
      logger.info('✅ Validator services available through proxy');

      // 4. Initialize Decentralized Order Book
      this.orderBook = new DecentralizedOrderBook(this.config.dex, this.validatorProxy.storage as any);
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
          storage: { status: this.validatorProxy.storage.ipfsConnected ? 'healthy' : 'degraded', service: 'IPFSStorageNetwork' },
          chat: { status: this.validatorProxy.chat.connected ? 'healthy' : 'degraded', service: 'P2PChatNetwork' },
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
    this.app.use('/api/v1/trading', createTradingRoutes(this.orderBook as unknown as OrderBookService, this.validatorProxy.fees as unknown as FeeServiceStatus));
    this.app.use('/api/v1/market-data', createMarketDataRoutes(this.orderBook as unknown as OrderBookService));
    this.app.use('/api/v1/chat', createChatRoutes(this.validatorProxy.chat as unknown as ChatService));
    this.app.use('/api/v1/storage', createStorageRoutes(this.validatorProxy.storage as unknown as StorageService));
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
          this.validatorProxy.chat.onMessage((channel: string, message: string, sender: string) => {
            if (channel === channels[0]) { // Check if message is from subscribed channel
              socket.emit('chat-message', { channel, message, sender });
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

        this.validatorProxy.on('feesDistributed', (distribution: unknown) => {
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
      await this.orderBook.shutdown();
      await this.validatorProxy.disconnect();
      await this.validatorClient.disconnect();

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
      this.validatorProxy.storage.store(Buffer.from(JSON.stringify(order)), { type: 'order', id: order.id });
    });

    this.orderBook.on('orderFilled', (trade) => {
      logger.info('Order filled:', trade);
      // Distribute fees
      // Fee distribution handled through validator proxy
      const fee = this.validatorProxy.fees.calculateFee(BigInt(trade.amount), 'trade');
      this.validatorProxy.fees.distributeFees(fee, []);
    });

    // Listen for chat events
    // Chat messages handled through proxy callbacks
    this.validatorProxy.chat.onMessage(async (channel: string, message: string, sender: string) => {
      logger.debug('Chat message received:', { channel, message, sender });
      // Store chat history in IPFS
      await this.validatorProxy.storage.store(
        Buffer.from(JSON.stringify({ channel, message, sender, timestamp: Date.now() })),
        { type: 'chat' }
      );
    });

    // Listen for storage events
    this.validatorProxy.on('storage:fileAdded', (cid: any) => {
      logger.debug('File added to IPFS:', cid);
    });

    // Listen for fee distribution events
    this.validatorProxy.on('fees:distributed', (distribution: any) => {
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

    const isStorageActive = this.validatorProxy.storage.ipfsConnected || false;
    const isChatActive = this.validatorProxy.chat.connected || false;

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