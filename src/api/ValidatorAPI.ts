/**
 * ValidatorAPI - Express routes for DEX integration with Avalanche Validator
 * 
 * Provides REST API endpoints for trading operations through the validator.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { validatorDEX, type Order, type OrderBook, type Trade, type MarketData } from '../services/ValidatorDEXService';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    address: string;
    participationScore?: number;
  };
}

/**
 * Create DEX API routes
 */
export function createValidatorDEXRoutes(): Router {
  const router = Router();
  
  // Middleware to ensure service is initialized
  router.use(async (req: Request, res: Response, next: NextFunction) => {
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
  });
  
  /**
   * Get all trading pairs
   */
  router.get('/pairs', (req: Request, res: Response) => {
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
   */
  router.get('/orderbook/:pair', async (req: Request, res: Response) => {
    try {
      const { pair } = req.params;
      const depth = parseInt(req.query.depth as string) || 20;
      
      const orderBook = await validatorDEX.getOrderBook(pair, depth);
      
      res.json({
        success: true,
        data: orderBook
      });
    } catch (error) {
      handleError(res, error, 'Failed to get order book');
    }
  });
  
  /**
   * Place a new order
   */
  router.post('/orders', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { type, tokenPair, price, amount } = req.body;
      const maker = req.user?.address || req.body.maker;
      
      if (!maker) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      const order = await validatorDEX.placeOrder({
        type,
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
  });
  
  /**
   * Get order by ID
   */
  router.get('/orders/:orderId', async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      
      const order = await validatorDEX.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }
      
      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      handleError(res, error, 'Failed to get order');
    }
  });
  
  /**
   * Get user's orders
   */
  router.get('/orders', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const maker = req.user?.address || req.query.maker as string;
      const tokenPair = req.query.pair as string;
      
      if (!maker) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      const orders = await validatorDEX.getUserOrders(maker, tokenPair);
      
      res.json({
        success: true,
        data: orders
      });
    } catch (error) {
      handleError(res, error, 'Failed to get user orders');
    }
  });
  
  /**
   * Cancel an order
   */
  router.delete('/orders/:orderId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orderId } = req.params;
      const maker = req.user?.address || req.body.maker;
      
      if (!maker) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      const cancelled = await validatorDEX.cancelOrder(orderId, maker);
      
      res.json({
        success: true,
        data: { cancelled }
      });
    } catch (error) {
      handleError(res, error, 'Failed to cancel order');
    }
  });
  
  /**
   * Get recent trades
   */
  router.get('/trades/:pair', async (req: Request, res: Response) => {
    try {
      const { pair } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const trades = await validatorDEX.getRecentTrades(pair, limit);
      
      res.json({
        success: true,
        data: trades
      });
    } catch (error) {
      handleError(res, error, 'Failed to get recent trades');
    }
  });
  
  /**
   * Get market data
   */
  router.get('/market/:pair', async (req: Request, res: Response) => {
    try {
      const { pair } = req.params;
      
      const marketData = await validatorDEX.getMarketData(pair);
      
      res.json({
        success: true,
        data: marketData
      });
    } catch (error) {
      handleError(res, error, 'Failed to get market data');
    }
  });
  
  /**
   * Calculate trading fees
   */
  router.post('/fees/calculate', (req: Request, res: Response) => {
    try {
      const { amount, isMaker } = req.body;
      
      if (!amount || typeof isMaker !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameters: amount and isMaker required'
        });
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
   */
  router.get('/ws/info', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        endpoint: process.env.VALIDATOR_WS_ENDPOINT || 'ws://localhost:4000/graphql',
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
 */
function handleError(res: Response, error: any, message: string): void {
  logger.error(message, error);
  
  const statusCode = error.status || 500;
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    message: errorMessage
  });
}

export default createValidatorDEXRoutes;