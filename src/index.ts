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
import dotenv from 'dotenv';

// UNIFIED VALIDATOR CORE COMPONENTS
import { UnifiedValidatorNode } from '@core/validator/UnifiedValidatorNode';
import { DecentralizedOrderBook } from '@core/dex/DecentralizedOrderBook';
import { OmniCoinBlockchain } from '@core/blockchain/OmniCoinBlockchain';
import { IPFSStorageNetwork } from '@core/storage/IPFSStorageNetwork';
import { P2PChatNetwork } from '@core/chat/P2PChatNetwork';
import { FeeDistributionEngine } from '@core/economics/FeeDistributionEngine';

// API Routes
import { createTradingRoutes } from '@api/trading';
import { createMarketDataRoutes } from '@api/market-data';
import { createChatRoutes } from '@api/chat';
import { createStorageRoutes } from '@api/storage';
import { createValidatorRoutes } from '@api/validator';

// Configuration and Types
import { ValidatorConfig } from '@types/validator';
import { logger } from '@utils/logger';

// Load environment variables
dotenv.config();

/**
 * OmniBazaar Unified Validator DEX
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
 */
class UnifiedValidatorDEX {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private config: ValidatorConfig;
  
  // UNIFIED VALIDATOR COMPONENTS
  private validatorNode: UnifiedValidatorNode;
  private orderBook: DecentralizedOrderBook;
  private blockchain: OmniCoinBlockchain;
  private storage: IPFSStorageNetwork;
  private chat: P2PChatNetwork;
  private feeDistribution: FeeDistributionEngine;

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
   * Load validator configuration (modest hardware requirements)
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
   */
  private validateConfiguration(config: ValidatorConfig): void {
    const requiredFields = [
      'blockchain.networkId',
      'validator.nodeId',
      'dex.tradingPairs',
      'ipfs.repo'
    ];

    for (const field of requiredFields) {
      const value = field.split('.').reduce((obj: any, key: string) => obj && obj[key], config);
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
   * Set up Express middleware
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
   * Initialize UNIFIED VALIDATOR components
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing Unified Validator DEX...');

      // 1. Initialize OmniCoin Blockchain Processor (~15% resources)
      this.blockchain = new OmniCoinBlockchain(this.config.blockchain);
      await this.blockchain.initialize();
      logger.info('✅ OmniCoin blockchain processor initialized');

      // 2. Initialize IPFS Storage Network (~15% resources)
      this.storage = new IPFSStorageNetwork(this.config.ipfs);
      await this.storage.initialize();
      logger.info('✅ IPFS storage network initialized');

      // 3. Initialize P2P Chat Network (~10% resources)
      this.chat = new P2PChatNetwork(this.config.chat, this.storage);
      await this.chat.initialize();
      logger.info('✅ P2P chat network initialized');

      // 4. Initialize Decentralized Order Book (~20% resources)
      this.orderBook = new DecentralizedOrderBook(this.config.dex, this.storage);
      await this.orderBook.initialize();
      logger.info('✅ Decentralized order book initialized');

      // 5. Initialize Fee Distribution Engine (~5% resources)
      this.feeDistribution = new FeeDistributionEngine(this.config.feeDistribution);
      await this.feeDistribution.initialize();
      logger.info('✅ Fee distribution engine initialized');

      // 6. Initialize Unified Validator Node (orchestrates all services)
      this.validatorNode = new UnifiedValidatorNode(
        this.config,
        this.blockchain,
        this.orderBook,
        this.storage,
        this.chat,
        this.feeDistribution
      );
      await this.validatorNode.initialize();
      logger.info('✅ Unified validator node initialized');

      // 7. Set up API routes
      this.setupUnifiedRoutes();
      
      // 8. Set up WebSocket handlers
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
   * Set up API routes for unified services
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
          blockchain: await this.blockchain.getHealthStatus(),
          dex: await this.orderBook.getHealthStatus(),
          storage: await this.storage.getHealthStatus(),
          chat: await this.chat.getHealthStatus(),
          validator: await this.validatorNode.getHealthStatus()
        },
        resourceUsage: await this.validatorNode.getResourceUsage()
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
          monthlyRevenueEstimate: await this.feeDistribution.getMonthlyEstimate(),
          validatorCount: await this.validatorNode.getValidatorCount(),
          networkFees: await this.feeDistribution.getNetworkFees()
        }
      });
    });

    // API routes for unified services
    this.app.use('/api/v1/trading', createTradingRoutes(this.orderBook, this.feeDistribution));
    this.app.use('/api/v1/market-data', createMarketDataRoutes(this.orderBook));
    this.app.use('/api/v1/chat', createChatRoutes(this.chat));
    this.app.use('/api/v1/storage', createStorageRoutes(this.storage));
    this.app.use('/api/v1/validator', createValidatorRoutes(this.validatorNode));

    // Error handling middleware
    this.app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('API Error:', error);
      res.status(error.status || 500).json({
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
   * Set up WebSocket for unified services
   */
  private setupUnifiedWebSocket(): void {
    this.io.on('connection', (socket) => {
      logger.info('Client connected to unified validator WebSocket', { socketId: socket.id });

      // Subscribe to trading updates
      socket.on('subscribe:trading', async (pairs: string[]) => {
        for (const pair of pairs) {
          this.orderBook.on('orderBookUpdated', (data) => {
            if (data.pair === pair) {
              socket.emit('trading-update', data);
            }
          });
        }
      });

      // Subscribe to chat messages
      socket.on('subscribe:chat', (channels: string[]) => {
        for (const channel of channels) {
          this.chat.on('messageReceived', (message) => {
            if (message.channel === channel) {
              socket.emit('chat-message', message);
            }
          });
        }
      });

      // Subscribe to validator network updates
      socket.on('subscribe:validator', () => {
        this.validatorNode.on('networkUpdate', (update) => {
          socket.emit('validator-update', update);
        });

        this.feeDistribution.on('feesDistributed', (distribution) => {
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
   * Graceful shutdown of unified validator
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
      await this.validatorNode.shutdown();
      await this.feeDistribution.shutdown();
      await this.orderBook.shutdown();
      await this.chat.shutdown();
      await this.storage.shutdown();
      await this.blockchain.shutdown();

      logger.info('✅ Unified Validator DEX shutdown completed');

    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
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

// Export for testing
export { UnifiedValidatorDEX }; 