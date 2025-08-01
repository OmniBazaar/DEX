/**
 * OmniBazaar DEX - Avalanche Validator Integration
 * 
 * This module integrates with the Avalanche validator's GraphQL API
 * for order book management, trade execution, and market data.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// DEX Services with Avalanche Validator Integration
import { validatorDEX } from './services/ValidatorDEXService';
import { createValidatorDEXRoutes } from './api/ValidatorAPI';
import { ValidatorWebSocketService } from './websocket/ValidatorWebSocket';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

/**
 * OmniBazaar DEX Server with Avalanche Validator Integration
 * 
 * Key Features:
 * - Order book management through GraphQL API
 * - Real-time WebSocket updates for trading
 * - Integration with Avalanche consensus (1-2s finality)
 * - Off-chain computation for complex operations
 * - Fee distribution per OmniBazaar design
 */
class DEXServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private wsService: ValidatorWebSocketService;
  private config: {
    port: number;
    corsOrigin: string[];
    rateLimitWindow: number;
    rateLimitMax: number;
  };

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST']
      }
    });
    
    this.config = {
      port: parseInt(process.env.PORT || '3003'),
      corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000')
    };
    
    this.setupMiddleware();
    this.wsService = new ValidatorWebSocketService(this.io);
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
          connectSrc: ["'self'", "wss:", "ws:", process.env.VALIDATOR_ENDPOINT || 'http://localhost:4000']
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindow,
      max: this.config.rateLimitMax,
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
   * Initialize the DEX server
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing DEX with Avalanche Validator...');

      // Initialize validator DEX service
      await validatorDEX.initialize();
      logger.info('✅ Validator DEX service initialized');

      // Set up API routes
      this.setupRoutes();
      
      logger.info('🎉 DEX Server initialized with Avalanche integration!');
      logger.info('📊 Features:');
      logger.info('   🔹 Order book via GraphQL API');
      logger.info('   🔹 1-2s finality with Snowman consensus');
      logger.info('   🔹 Off-chain computation support');
      logger.info('   🔹 Real-time WebSocket updates');
      logger.info('   🔹 Fee structure: 0.1% maker, 0.2% taker');

    } catch (error) {
      logger.error('❌ Failed to initialize DEX server:', error);
      throw error;
    }
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (_req: Request, res: Response) => {
      try {
        // Check validator connection
        const orderBook = await validatorDEX.getOrderBook('XOM/USDC', 1);
        
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '0.1.0',
          environment: process.env.NODE_ENV || 'development',
          validator: {
            connected: true,
            endpoint: process.env.VALIDATOR_ENDPOINT,
            wsEndpoint: process.env.VALIDATOR_WS_ENDPOINT
          },
          features: {
            orderBook: true,
            trading: true,
            webSocket: true,
            marketData: true
          },
          tradingPairs: validatorDEX.getTradingPairs(),
          connections: {
            webSocket: this.wsService.getConnectedClientsCount(),
            activeSubscriptions: this.wsService.getActiveSubscriptionsCount()
          }
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });

    // API routes
    this.app.use('/api/v1/dex', createValidatorDEXRoutes());

    // Avalanche validator info
    this.app.get('/api/v1/validator/info', (_req: Request, res: Response) => {
      res.json({
        integration: 'avalanche',
        consensus: 'snowman',
        finality: '1-2 seconds',
        features: [
          'GraphQL API',
          'WebSocket subscriptions',
          'Off-chain computation',
          'Merkle tree verification',
          'IPFS storage integration'
        ],
        endpoints: {
          graphql: process.env.VALIDATOR_ENDPOINT || 'http://localhost:4000',
          websocket: process.env.VALIDATOR_WS_ENDPOINT || 'ws://localhost:4000/graphql'
        }
      });
    });

    // Error handling middleware
    this.app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('API Error:', error);
      res.status(error.status || 500).json({
        error: error.message || 'Internal Server Error',
        timestamp: new Date().toISOString()
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
   * Start the DEX server
   */
  async start(): Promise<void> {
    try {
      await this.initialize();

      this.server.listen(this.config.port, () => {
        logger.info('🚀 DEX SERVER RUNNING WITH AVALANCHE VALIDATOR');
        logger.info(`📡 API Server: http://localhost:${this.config.port}`);
        logger.info(`🔌 WebSocket: ws://localhost:${this.config.port}`);
        logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info('📊 Avalanche Integration:');
        logger.info(`   ✅ GraphQL Endpoint: ${process.env.VALIDATOR_ENDPOINT}`);
        logger.info(`   ✅ WebSocket: ${process.env.VALIDATOR_WS_ENDPOINT}`);
        logger.info('💱 Trading Features:');
        logger.info('   ✅ Spot trading with order book');
        logger.info('   ✅ Real-time price updates');
        logger.info('   ✅ Fee structure: 0.1% maker, 0.2% taker');
        logger.info('   ✅ 1-2 second trade finality');
      });

    } catch (error) {
      logger.error('❌ Failed to start DEX server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down DEX server...');

    try {
      // Close WebSocket connections
      this.wsService.cleanup();
      this.io.close();

      // Close HTTP server
      if (this.server) {
        this.server.close();
      }

      // Close validator connection
      await validatorDEX.close();

      logger.info('✅ DEX server shutdown completed');

    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
  }
}

// Create and start the DEX server
const dexServer = new DEXServer();

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, initiating graceful shutdown...');
  await dexServer.shutdown();
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, initiating graceful shutdown...');
  await dexServer.shutdown();
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
  process.exit(1);
});

// Start the DEX server
dexServer.start().catch((error) => {
  logger.error('Failed to start DEX server:', error);
  process.exit(1);
});

// Export for testing
export { DEXServer };