/**
 * ValidatorAPI - Express routes for DEX integration with Avalanche Validator
 * 
 * Provides REST API endpoints for trading operations through the validator.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { validatorDEX } from '../services/ValidatorDEXService';
import { logger } from '../utils/logger';
import { OrderSide } from '../types/validator';

/**
 * Extended Request interface with authentication data
 */
export interface AuthenticatedRequest extends Request {
  /** User authentication data */
  user?: {
    /** User's blockchain address */
    address: string;
    /** Optional participation score */
    participationScore?: number;
  };
}

/**
 * API error structure
 */
interface APIError {
  /** HTTP status code */
  status?: number;
  /** Error message */
  message?: string;
}

/**
 * Create DEX API routes
 * @returns Express router with DEX endpoints
 */
export function createValidatorDEXRoutes(): Router {
  const router = Router();
  
  // Middleware to ensure service is initialized
  router.use((_req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve().then(async () => {
      try {
        // Initialize service if needed
        if (!validatorDEX['isInitialized']) {
          await validatorDEX.initialize();
        }
        next();
      } catch (error) {
        logger.error('Failed to initialize DEX service:', error);
        res.status(500).json({
          error: 'DEX service initialization failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }).catch((error) => {
      logger.error('Failed to initialize DEX service:', error);
      res.status(500).json({
        error: 'DEX service initialization failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });
  
  /**
   * Get all trading pairs
   * @param _req - Express request object
   * @param res - Express response object
   */
  router.get('/pairs', (_req: Request, res: Response): void => {
    try {
      const pairs = validatorDEX.getTradingPairs();
      res.json({
        success: true,
        data: pairs
      });
    } catch (error) {
      handleError(res, error, 'Failed to get trading pairs');
    }
  });
  
  /**
   * Get order book for a trading pair
   * @param req - Express request object
   * @param res - Express response object
   */
  router.get('/orderbook/:pair', (req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const { pair } = req.params;
        const depthParam = req.query['depth'] as string;
        const depth = (depthParam !== undefined && depthParam !== '' && parseInt(depthParam) > 0) ? parseInt(depthParam) : 20;
        
        if (pair === undefined || pair === '') {
          res.status(400).json({
            success: false,
            error: 'Trading pair is required'
          });
          return;
        }
        
        const orderBook = await validatorDEX.getOrderBook(pair, depth);
        
        res.json({
          success: true,
          data: orderBook
        });
      } catch (error) {
        handleError(res, error, 'Failed to get order book');
      }
    }).catch((error) => {
      handleError(res, error, 'Failed to get order book');
    });
  });
  
  /**
   * Place a new order
   * @param req - Express request object with auth data
   * @param res - Express response object
   */
  router.post('/orders', (req: AuthenticatedRequest, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const { type, tokenPair, price, amount } = req.body as {
          type: string;
          tokenPair: string;
          price: string;
          amount: string;
          maker?: string;
        };
        
        // Validate order type
        if (type === undefined || type === '' || !['BUY', 'SELL'].includes(type)) {
          res.status(400).json({
            success: false,
            error: 'Invalid order type. Must be BUY or SELL'
          });
          return;
        }
        const maker = req.user?.address ?? ((req.body as { maker?: string })?.maker);
        
        if (maker === undefined || maker === '') {
          res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
          return;
        }
        
        const order = await validatorDEX.placeOrder({
          type: type as OrderSide,
          tokenPair,
          price,
          amount,
          maker
        });
        
        res.status(201).json({
          success: true,
          data: order
        });
      } catch (error) {
        handleError(res, error, 'Failed to place order');
      }
    }).catch((error) => {
      handleError(res, error, 'Failed to place order');
    });
  });
  
  /**
   * Get order by ID
   * @param req - Express request object
   * @param res - Express response object
   */
  router.get('/orders/:orderId', (req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const { orderId } = req.params;
        
        if (orderId === undefined || orderId === '') {
          res.status(400).json({
            success: false,
            error: 'Order ID is required'
          });
          return;
        }
        
        const order = await validatorDEX.getOrder(orderId);
        
        if (order === null || order === undefined) {
          res.status(404).json({
            success: false,
            error: 'Order not found'
          });
          return;
        }
        
        res.json({
          success: true,
          data: order
        });
      } catch (error) {
        handleError(res, error, 'Failed to get order');
      }
    }).catch((error) => {
      handleError(res, error, 'Failed to get order');
    });
  });
  
  /**
   * Get user's orders
   * @param req - Express request object with auth data
   * @param res - Express response object
   */
  router.get('/orders', (req: AuthenticatedRequest, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const maker = req.user?.address ?? (req.query['maker'] as string | undefined);
        const tokenPair = req.query['pair'] as string | undefined;
        
        if (maker === undefined || maker === '') {
          res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
          return;
        }
        
        const orders = await validatorDEX.getUserOrders(maker, tokenPair);
        
        res.json({
          success: true,
          data: orders
        });
      } catch (error) {
        handleError(res, error, 'Failed to get user orders');
      }
    }).catch((error) => {
      handleError(res, error, 'Failed to get user orders');
    });
  });
  
  /**
   * Cancel an order
   * @param req - Express request object with auth data
   * @param res - Express response object
   */
  router.delete('/orders/:orderId', (req: AuthenticatedRequest, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const { orderId } = req.params;
        const maker = req.user?.address ?? ((req.body as { maker?: string })?.maker);
        
        if (maker === undefined || maker === '') {
          res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
          return;
        }
        
        if (orderId === undefined || orderId === '') {
          res.status(400).json({
            success: false,
            error: 'Order ID is required'
          });
          return;
        }
        
        const cancelled = await validatorDEX.cancelOrder(orderId, maker);
        
        res.json({
          success: true,
          data: { cancelled }
        });
      } catch (error) {
        handleError(res, error, 'Failed to cancel order');
      }
    }).catch((error) => {
      handleError(res, error, 'Failed to cancel order');
    });
  });
  
  /**
   * Get recent trades
   * @param req - Express request object
   * @param res - Express response object
   */
  router.get('/trades/:pair', (req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const { pair } = req.params;
        const limitParam = req.query['limit'] as string;
        const limit = (limitParam !== undefined && limitParam !== '' && parseInt(limitParam) > 0) ? parseInt(limitParam) : 50;
        
        if (pair === undefined || pair === '') {
          res.status(400).json({
            success: false,
            error: 'Trading pair is required'
          });
          return;
        }
        
        const trades = await validatorDEX.getRecentTrades(pair, limit);
        
        res.json({
          success: true,
          data: trades
        });
      } catch (error) {
        handleError(res, error, 'Failed to get recent trades');
      }
    }).catch((error) => {
      handleError(res, error, 'Failed to get recent trades');
    });
  });
  
  /**
   * Get market data
   * @param req - Express request object
   * @param res - Express response object
   */
  router.get('/market/:pair', (req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const { pair } = req.params;
        
        if (pair === undefined || pair === '') {
          res.status(400).json({
            success: false,
            error: 'Trading pair is required'
          });
          return;
        }
        
        const marketData = await validatorDEX.getMarketData(pair);
        
        res.json({
          success: true,
          data: marketData
        });
      } catch (error) {
        handleError(res, error, 'Failed to get market data');
      }
    }).catch((error) => {
      handleError(res, error, 'Failed to get market data');
    });
  });
  
  /**
   * Calculate trading fees
   * @param req - Express request object
   * @param res - Express response object
   */
  router.post('/fees/calculate', (req: Request, res: Response): void => {
    try {
      const { amount, isMaker } = req.body as {
        amount?: unknown;
        isMaker?: unknown;
      };
      
      if (amount === undefined || amount === null || typeof amount !== 'string' || typeof isMaker !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Invalid parameters: amount (string) and isMaker (boolean) required'
        });
        return;
      }
      
      const fees = validatorDEX.calculateFees(amount, isMaker);
      
      res.json({
        success: true,
        data: fees
      });
    } catch (error) {
      handleError(res, error, 'Failed to calculate fees');
    }
  });
  
  /**
   * WebSocket subscription info
   * @param _req - Express request object
   * @param res - Express response object
   */
  router.get('/ws/info', (_req: Request, res: Response): void => {
    res.json({
      success: true,
      data: {
        endpoint: process.env['VALIDATOR_WS_ENDPOINT'] ?? 'ws://localhost:4000/graphql',
        subscriptions: [
          'orderbook', // Order book updates
          'trades',    // Trade execution updates
          'orders'     // Order status updates
        ]
      }
    });
  });
  
  return router;
}

/**
 * Error handler helper
 * @param res - Express response object
 * @param error - Error object or unknown error
 * @param message - Error message to display
 * @returns Express response
 */
function handleError(res: Response, error: unknown, message: string): Response {
  logger.error(message, error);
  
  const apiError = error as APIError;
  const statusCode = (apiError?.status !== undefined && apiError.status !== 0) ? apiError.status : 500;
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  return res.status(statusCode).json({
    success: false,
    error: message,
    message: errorMessage
  });
}

export default createValidatorDEXRoutes;