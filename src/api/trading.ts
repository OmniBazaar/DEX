/**
 * Trading API Routes for Unified Validator DEX
 * 
 * Handles all trading operations including:
 * - Order placement and management
 * - Market and limit orders
 * - Stop and advanced orders
 * - Perpetual futures
 * - Portfolio management
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { UnifiedOrder, Portfolio, Position, Trade, FeeInfo, ConversionResult } from '../types/config';

/**
 * Filters for querying orders
 */
interface OrderFilters {
  /** Trading pair filter */
  pair?: string;
  /** Order status filter */
  status?: string;
  /** Maximum number of results */
  limit?: number;
  /** Result offset for pagination */
  offset?: number;
  /** Start time filter */
  startTime?: Date;
  /** End time filter */
  endTime?: Date;
}

/**
 * Decentralized order book interface for trading operations
 */
interface DecentralizedOrderBook {
  submitOrder(order: Partial<UnifiedOrder>): Promise<OrderResult>;
  getOrder(orderId: string): Promise<UnifiedOrder | null>;
  cancelOrder(orderId: string, userId: string): Promise<CancelResult>;
  getUserOrders(userId: string, filters?: OrderFilters): Promise<UnifiedOrder[]>;
  getOpenOrders(userId: string): Promise<UnifiedOrder[]>;
  getOrderHistory(userId: string, filters?: OrderFilters): Promise<UnifiedOrder[]>;
  getPortfolio(userId: string): Promise<Portfolio>;
  getPositions(userId: string): Promise<Position[]>;
  closePosition(positionId: string, userId: string): Promise<Position>;
  getUserTrades(userId: string, filters?: OrderFilters): Promise<Trade[]>;
  placePerpetualOrder(order: Partial<UnifiedOrder>): Promise<OrderResult>;
  getPerpetualPositions(userId: string): Promise<Position[]>;
  autoConvertToXOM(userId: string, fromToken: string, amount: string, slippageTolerance: number): Promise<ConversionResult>;
}

/**
 * Trading fee information
 */
interface TradingFees {
  /** Fee amount */
  amount: string;
  /** Asset used for fee payment */
  asset: string;
  /** Fee type */
  type: 'maker' | 'taker';
  /** Associated order ID */
  orderId: string;
  /** User ID */
  userId: string;
}

/**
 * Fee distribution engine interface
 */
interface FeeDistributionEngine {
  recordTradingFees(fees: TradingFees): Promise<void>;
  getUserFeeInfo(userId: string): Promise<FeeInfo>;
  recordConversionFees(fees: TradingFees): Promise<void>;
}

/**
 * Result of order submission
 */
interface OrderResult {
  /** Unique order identifier */
  orderId: string;
  /** Order status */
  status: string;
  /** Whether order was filled */
  filled: boolean;
  /** Remaining quantity */
  remaining: string;
  /** Average fill price */
  averagePrice?: string;
  /** Fee information */
  fees: TradingFees;
  /** Result timestamp */
  timestamp: number;
  /** Associated position (for perpetuals) */
  position?: Position;
  /** Margin used */
  marginUsed?: string;
  /** Liquidation price */
  liquidationPrice?: string;
  /** Unrealized P&L */
  unrealizedPnL?: string;
}

/**
 * Result of order cancellation
 */
interface CancelResult {
  /** Whether cancellation was successful */
  success: boolean;
  /** Optional message */
  message?: string;
  /** Cancellation timestamp */
  timestamp?: number;
}

/**
 * Create trading API routes for the unified validator DEX
 * Handles order placement, management, portfolio operations, and conversions
 * @param orderBook - Decentralized order book implementation
 * @param feeDistribution - Fee distribution engine for validator rewards
 * @returns Express router with trading endpoints
 * @example
 * ```typescript
 * const router = createTradingRoutes(orderBook, feeDistribution);
 * app.use('/api/v1/trading', router);
 * ```
 */
export function createTradingRoutes(
  orderBook: DecentralizedOrderBook,
  feeDistribution: FeeDistributionEngine
): Router {
  const router = Router();

  /**
   * Place a new trading order
   * POST /api/v1/trading/orders
   */
  router.post('/orders',
    [
      body('type').isIn(['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LIMIT', 'TRAILING_STOP', 'OCO', 'ICEBERG', 'TWAP', 'VWAP']),
      body('side').isIn(['BUY', 'SELL']),
      body('pair').isString().notEmpty(),
      body('quantity').isDecimal().notEmpty(),
      body('price').optional().isDecimal(),
      body('stopPrice').optional().isDecimal(),
      body('timeInForce').optional().isIn(['GTC', 'DAY', 'IOC', 'FOK']),
      body('leverage').optional().isInt({ min: 1, max: 100 }),
      body('reduceOnly').optional().isBoolean(),
      body('postOnly').optional().isBoolean()
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const order = {
          type: req.body.type,
          side: req.body.side,
          pair: req.body.pair,
          quantity: req.body.quantity,
          price: req.body.price,
          stopPrice: req.body.stopPrice,
          timeInForce: req.body.timeInForce || 'GTC',
          leverage: req.body.leverage || 1,
          reduceOnly: req.body.reduceOnly || false,
          postOnly: req.body.postOnly || false,
          userId: req.headers['x-user-id'] as string, // From auth middleware
          timestamp: Date.now()
        };

        const result = await orderBook.submitOrder(order);
        
        // Track fees for distribution
        if (result.filled) {
          await feeDistribution.recordTradingFees(result.fees);
        }

        logger.info('Order placed', { orderId: result.orderId, type: order.type, pair: order.pair });

        return res.status(201).json({
          success: true,
          orderId: result.orderId,
          status: result.status,
          filled: result.filled,
          remaining: result.remaining,
          averagePrice: result.averagePrice,
          fees: result.fees,
          timestamp: result.timestamp
        });

      } catch (error) {
        logger.error('Error placing order:', error);
        return res.status(500).json({
          error: 'Failed to place order',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get order status
   * GET /api/v1/trading/orders/:orderId
   */
  router.get('/orders/:orderId',
    [param('orderId').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const { orderId } = req.params;

        const order = await orderBook.getOrder(orderId || '');
        
        if (!order) {
          return res.status(404).json({
            error: 'Order not found'
          });
        }

        return res.json(order);

      } catch (error) {
        logger.error('Error getting order:', error);
        return res.status(500).json({
          error: 'Failed to get order',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Cancel an order
   * DELETE /api/v1/trading/orders/:orderId
   */
  router.delete('/orders/:orderId',
    [param('orderId').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const { orderId } = req.params;
        const userId = req.headers['x-user-id'] as string;

        const result = await orderBook.cancelOrder(orderId || '', userId || '');

        if (!result.success) {
          return res.status(400).json({
            error: 'Failed to cancel order',
            message: result.message
          });
        }

        logger.info('Order cancelled', { orderId, userId });

        return res.json({
          success: true,
          orderId,
          cancelledAt: result.timestamp
        });

      } catch (error) {
        logger.error('Error cancelling order:', error);
        return res.status(500).json({
          error: 'Failed to cancel order',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get user's active orders
   * GET /api/v1/trading/orders
   */
  router.get('/orders',
    [
      query('pair').optional().isString(),
      query('status').optional().isIn(['OPEN', 'FILLED', 'CANCELLED', 'EXPIRED']),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
      query('offset').optional().isInt({ min: 0 }).toInt()
    ],
    async (req: Request, res: Response) => {
      try {
        const userId = req.headers['x-user-id'] as string;
        const filters = {
          pair: req.query['pair'] as string,
          status: req.query['status'] as string,
          limit: parseInt(req.query['limit'] as string) || 50,
          offset: parseInt(req.query['offset'] as string) || 0
        };

        const orders = await orderBook.getUserOrders(userId || '', filters);

        return res.json({
          orders,
          total: orders.length,
          limit: filters.limit,
          offset: filters.offset
        });

      } catch (error) {
        logger.error('Error getting user orders:', error);
        return res.status(500).json({
          error: 'Failed to get orders',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get trading portfolio
   * GET /api/v1/trading/portfolio
   */
  router.get('/portfolio', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;

      const portfolio = await orderBook.getPortfolio(userId || '');

      return res.json({
        balances: portfolio.balances,
        positions: portfolio.positions,
        openOrders: portfolio.openOrders,
        totalValue: portfolio.totalValue,
        unrealizedPnL: portfolio.unrealizedPnL,
        availableMargin: portfolio.availableMargin,
        usedMargin: portfolio.usedMargin,
        marginRatio: portfolio.marginRatio
      });

    } catch (error) {
      logger.error('Error getting portfolio:', error);
      return res.status(500).json({
        error: 'Failed to get portfolio',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get trade history
   * GET /api/v1/trading/trades
   */
  router.get('/trades',
    [
      query('pair').optional().isString(),
      query('startTime').optional().isISO8601().toDate(),
      query('endTime').optional().isISO8601().toDate(),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
      query('offset').optional().isInt({ min: 0 }).toInt()
    ],
    async (req: Request, res: Response) => {
      try {
        const userId = req.headers['x-user-id'] as string;
        const filters = {
          pair: req.query['pair'] as string,
          startTime: new Date(req.query['startTime'] as string),
          endTime: new Date(req.query['endTime'] as string),
          limit: parseInt(req.query['limit'] as string) || 50,
          offset: parseInt(req.query['offset'] as string) || 0
        };

        const trades = await orderBook.getUserTrades(userId || '', filters);

        return res.json({
          trades,
          total: trades.length,
          limit: filters.limit,
          offset: filters.offset
        });

      } catch (error) {
        logger.error('Error getting trade history:', error);
        return res.status(500).json({
          error: 'Failed to get trade history',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get fee information
   * GET /api/v1/trading/fees
   */
  router.get('/fees', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;

      const feeInfo = await feeDistribution.getUserFeeInfo(userId || '');

      return res.json({
        currentFees: {
          spotMaker: feeInfo.spotMaker,
          spotTaker: feeInfo.spotTaker,
          perpetualMaker: feeInfo.perpetualMaker,
          perpetualTaker: feeInfo.perpetualTaker,
          autoConversion: feeInfo.autoConversion
        },
        feesGenerated: feeInfo.feesGenerated,
        feeDiscounts: feeInfo.feeDiscounts,
        validatorShare: '70%',
        nextDistribution: feeInfo.nextDistribution
      });

    } catch (error) {
      logger.error('Error getting fee information:', error);
      return res.status(500).json({
        error: 'Failed to get fee information',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Place perpetual futures order
   * POST /api/v1/trading/perpetuals/orders
   */
  router.post('/perpetuals/orders',
    [
      body('type').isIn(['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LIMIT']),
      body('side').isIn(['BUY', 'SELL', 'LONG', 'SHORT']),
      body('contract').isString().notEmpty(),
      body('size').isDecimal().notEmpty(),
      body('leverage').isInt({ min: 1, max: 100 }),
      body('price').optional().isDecimal(),
      body('stopPrice').optional().isDecimal(),
      body('reduceOnly').optional().isBoolean(),
      body('timeInForce').optional().isIn(['GTC', 'DAY', 'IOC', 'FOK'])
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const perpetualOrder = {
          type: req.body.type,
          side: req.body.side,
          contract: req.body.contract,
          size: req.body.size,
          leverage: req.body.leverage,
          price: req.body.price,
          stopPrice: req.body.stopPrice,
          reduceOnly: req.body.reduceOnly || false,
          timeInForce: req.body.timeInForce || 'GTC',
          userId: req.headers['x-user-id'] as string,
          timestamp: Date.now()
        };

        const result = await orderBook.placePerpetualOrder(perpetualOrder);

        // Track fees for distribution
        if (result.filled) {
          await feeDistribution.recordTradingFees(result.fees);
        }

        logger.info('Perpetual order placed', { 
          orderId: result.orderId, 
          contract: perpetualOrder.contract,
          side: perpetualOrder.side,
          leverage: perpetualOrder.leverage
        });

        return res.status(201).json({
          success: true,
          orderId: result.orderId,
          position: result.position,
          marginUsed: result.marginUsed,
          liquidationPrice: result.liquidationPrice,
          unrealizedPnL: result.unrealizedPnL,
          fees: result.fees
        });

      } catch (error) {
        logger.error('Error placing perpetual order:', error);
        return res.status(500).json({
          error: 'Failed to place perpetual order',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get perpetual positions
   * GET /api/v1/trading/perpetuals/positions
   */
  router.get('/perpetuals/positions', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;

      const positions = await orderBook.getPerpetualPositions(userId || '');

      return res.json({
        positions: positions.map((position: Position) => ({
          contract: position.contract,
          side: position.side,
          size: position.size,
          entryPrice: position.entryPrice,
          markPrice: position.markPrice,
          leverage: position.leverage,
          margin: position.margin,
          unrealizedPnL: position.unrealizedPnL,
          liquidationPrice: position.liquidationPrice,
          fundingPayment: position.fundingPayment,
          lastFundingTime: position.lastFundingTime
        }))
      });

    } catch (error) {
      logger.error('Error getting perpetual positions:', error);
      return res.status(500).json({
        error: 'Failed to get perpetual positions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Auto-convert tokens to XOM for trading
   * POST /api/v1/trading/convert
   */
  router.post('/convert',
    [
      body('fromToken').isString().notEmpty(),
      body('amount').isDecimal().notEmpty(),
      body('slippageTolerance').optional().isDecimal().isLength({ min: 0, max: 0.1 })
    ],
    async (req: Request, res: Response) => {
      try {
        const { fromToken, amount, slippageTolerance = 0.005 } = req.body;
        const userId = req.headers['x-user-id'] as string;

        const conversion = await orderBook.autoConvertToXOM(
          userId || '',
          fromToken,
          amount,
          slippageTolerance
        );

        // Track conversion fees
        await feeDistribution.recordConversionFees({
          amount: conversion.fees,
          asset: 'XOM',
          type: 'taker',
          orderId: conversion.id,
          userId: userId || ''
        });

        logger.info('Token conversion completed', {
          userId,
          fromToken,
          amount,
          xomReceived: conversion.toAmount,
          conversionRate: conversion.conversionRate
        });

        return res.json({
          success: true,
          conversionId: conversion.id,
          fromToken,
          fromAmount: amount,
          toToken: 'XOM',
          toAmount: conversion.toAmount,
          conversionRate: conversion.conversionRate,
          fees: conversion.fees,
          slippage: conversion.actualSlippage,
          timestamp: conversion.timestamp
        });

      } catch (error) {
        logger.error('Error converting tokens:', error);
        return res.status(500).json({
          error: 'Failed to convert tokens',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  return router;
} 