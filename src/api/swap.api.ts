/**
 * Swap API Endpoints with Smart Contract Integration
 * 
 * Provides REST API for token swaps with on-chain settlement.
 * Integrates with OmniCore.sol for deposits, withdrawals, and trade settlement.
 * 
 * @module api/swap
 */

import { Router, Request, Response } from 'express';
import { DecentralizedOrderBook } from '../core/dex/DecentralizedOrderBook';
import { ContractService } from '../services/ContractService';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';
import { body, param } from 'express-validator';
import { ethers } from 'ethers';

/**
 * Swap request parameters
 */
export interface SwapRequest {
  /** Token to swap from */
  tokenIn: string;
  /** Token to swap to */
  tokenOut: string;
  /** Amount to swap */
  amountIn: string;
  /** Minimum amount to receive */
  minAmountOut?: string;
  /** Slippage tolerance (0-100) */
  slippage?: number;
  /** Use privacy features */
  usePrivacy?: boolean;
  /** Deadline timestamp */
  deadline?: number;
}

/**
 * Deposit request parameters
 */
export interface DepositRequest {
  /** Token address to deposit */
  token: string;
  /** Amount to deposit */
  amount: string;
}

/**
 * Withdrawal request parameters
 */
export interface WithdrawRequest {
  /** Token address to withdraw */
  token: string;
  /** Amount to withdraw */
  amount: string;
}

/**
 * Authenticated request interface with user context
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

/**
 * Create swap API router with smart contract integration
 * @param orderBook - The decentralized order book instance
 * @param contractService - The contract service for blockchain interactions
 * @returns The configured Express router for swap endpoints
 */
export function createSwapRouter(
  orderBook: DecentralizedOrderBook,
  contractService: ContractService
): Router {
  const router = Router();

  /**
   * Deposit tokens to DEX
   * Deposit tokens from wallet to DEX smart contract for trading.
   * @param req - Express request object with deposit parameters
   * @param res - Express response object
   * @returns void - Sends JSON response with transaction details
   */
  router.post('/deposit',
    authMiddleware,
    body('token').isEthereumAddress(),
    body('amount').isNumeric(),
    (req: AuthenticatedRequest, res: Response): void => {
      void Promise.resolve().then(async () => {
        try {
          const user = req.user;
          const userId = user?.id;
          if (userId === null || userId === undefined) {
            res.status(401).json({ 
              success: false, 
              error: 'User not authenticated' 
            });
            return;
          }

          const requestBody = req.body as Record<string, unknown>;
          const token = requestBody.token as string;
          const amount = requestBody.amount as string;

          // Validate amount
          if (BigInt(amount) <= 0n) {
            res.status(400).json({
              success: false,
              error: 'Invalid amount'
            });
            return;
          }

          // Execute deposit on-chain
          const result = await contractService.depositToDEX(
            token,
            amount,
            userId
          );

          if (result.success !== true) {
            res.status(400).json({
              success: false,
              error: result.error ?? 'Deposit failed'
            });
            return;
          }

          // Get updated balance
          const balance = await contractService.getDEXBalance(userId, token);

          logger.info('User deposited to DEX', {
            userId,
            token,
            amount,
            txHash: result.txHash
          });

          res.json({
            success: true,
            txHash: result.txHash,
            blockNumber: result.blockNumber,
            balance
          });
        } catch (error) {
          logger.error('Deposit failed:', error);
          res.status(500).json({
            success: false,
            error: (error as Error).message
          });
        }
      }).catch((error) => {
        logger.error('Deposit failed:', error);
        res.status(500).json({
          success: false,
          error: 'Deposit operation failed'
        });
      });
    }
  );

  /**
   * Withdraw tokens from DEX
   * Withdraw tokens from DEX smart contract to wallet.
   * @param req - Express request object with withdrawal parameters
   * @param res - Express response object
   * @returns void - Sends JSON response with transaction details
   */
  router.post('/withdraw',
    authMiddleware,
    body('token').isEthereumAddress(),
    body('amount').isNumeric(),
    (req: AuthenticatedRequest, res: Response): void => {
      void Promise.resolve().then(async () => {
        try {
          const user = req.user;
          const userId = user?.id;
          if (userId === null || userId === undefined) {
            res.status(401).json({ 
              success: false, 
              error: 'User not authenticated' 
            });
            return;
          }

          const requestBody = req.body as Record<string, unknown>;
          const token = requestBody.token as string;
          const amount = requestBody.amount as string;

          // Check balance
          const balance = await contractService.getDEXBalance(userId, token);
          if (BigInt(balance) < BigInt(amount)) {
            res.status(400).json({
              success: false,
              error: 'Insufficient balance'
            });
            return;
          }

          // Execute withdrawal on-chain
          const result = await contractService.withdrawFromDEX(
            token,
            amount
          );

          if (result.success !== true) {
            res.status(400).json({
              success: false,
              error: result.error ?? 'Withdrawal failed'
            });
            return;
          }

          // Get updated balance
          const newBalance = await contractService.getDEXBalance(userId, token);

          logger.info('User withdrew from DEX', {
            userId,
            token,
            amount,
            txHash: result.txHash
          });

          res.json({
            success: true,
            txHash: result.txHash,
            blockNumber: result.blockNumber,
            balance: newBalance
          });
        } catch (error) {
          logger.error('Withdrawal failed:', error);
          res.status(500).json({
            success: false,
            error: (error as Error).message
          });
        }
      }).catch((error) => {
        logger.error('Withdrawal failed:', error);
        res.status(500).json({
          success: false,
          error: 'Withdrawal operation failed'
        });
      });
    }
  );

  /**
   * Execute token swap
   * Execute a token swap with on-chain settlement.
   * @param req - Express request object with swap parameters
   * @param res - Express response object
   * @returns void - Sends JSON response with swap result
   */
  router.post('/execute',
    authMiddleware,
    body('tokenIn').isString(),
    body('tokenOut').isString(),
    body('amountIn').isNumeric(),
    body('minAmountOut').optional().isNumeric(),
    body('slippage').optional().isFloat({ min: 0, max: 100 }),
    body('usePrivacy').optional().isBoolean(),
    (req: AuthenticatedRequest, res: Response): void => {
      void Promise.resolve().then(async () => {
        try {
          const user = req.user;
          const userId = user?.id;
          if (userId === null || userId === undefined) {
            res.status(401).json({ 
              success: false, 
              error: 'User not authenticated' 
            });
            return;
          }

          const swapRequest = req.body as SwapRequest;
          const pair = `${swapRequest.tokenIn}/${swapRequest.tokenOut}`;

          // Create market order for the swap
          const orderResult = await orderBook.placeOrder({
            userId,
            pair,
            type: 'MARKET',
            side: 'SELL',
            quantity: swapRequest.amountIn,
            timeInForce: 'IOC' // Immediate or cancel
          });

          if (orderResult.success !== true) {
            res.status(400).json({
              success: false,
              error: orderResult.message ?? 'Swap failed'
            });
            return;
          }

          // Calculate output amount based on executed price
          const executedPrice = parseFloat(orderResult.order.averagePrice ?? '0');
          const amountOut = (parseFloat(swapRequest.amountIn) * executedPrice).toString();

          // Check slippage
          if (swapRequest.minAmountOut !== null && swapRequest.minAmountOut !== undefined) {
            if (BigInt(amountOut) < BigInt(swapRequest.minAmountOut)) {
              // Cancel order due to slippage
              await orderBook.cancelOrder(orderResult.orderId, userId);
              res.status(400).json({
                success: false,
                error: 'Slippage tolerance exceeded'
              });
              return;
            }
          }

          // Settle trade on-chain
          const settlementSuccess = await orderBook.settleTradeOnChain(
            userId,
            'DEX_POOL', // Counterparty is the DEX liquidity pool
            swapRequest.tokenOut,
            amountOut,
            orderResult.orderId
          );

          if (settlementSuccess !== true) {
            logger.warn('On-chain settlement failed, using off-chain');
          }

          logger.info('Swap executed', {
            userId,
            pair,
            amountIn: swapRequest.amountIn,
            amountOut,
            orderId: orderResult.orderId
          });

          res.json({
            success: true,
            orderId: orderResult.orderId,
            amountIn: swapRequest.amountIn,
            amountOut,
            executedPrice,
            fees: orderResult.fees
          });
        } catch (error) {
          logger.error('Swap execution failed:', error);
          res.status(500).json({
            success: false,
            error: (error as Error).message
          });
        }
      }).catch((error) => {
        logger.error('Swap execution failed:', error);
        res.status(500).json({
          success: false,
          error: 'Swap execution failed'
        });
      });
    }
  );

  /**
   * Get DEX balance
   * Get user's balance for a specific token in the DEX.
   * @param req - Express request object with token parameter
   * @param res - Express response object
   * @returns void - Sends JSON response with balance information
   */
  router.get('/balance/:token',
    authMiddleware,
    param('token').isEthereumAddress(),
    (req: AuthenticatedRequest, res: Response): void => {
      void Promise.resolve().then(async () => {
        try {
          const user = req.user;
          const userId = user?.id;
          if (userId === null || userId === undefined) {
            res.status(401).json({ 
              success: false, 
              error: 'User not authenticated' 
            });
            return;
          }

          const token = req.params.token;
          if (token === null || token === undefined || token === '') {
            res.status(400).json({
              success: false,
              error: 'Token parameter is required'
            });
            return;
          }

          const balance = await contractService.getDEXBalance(userId, token);

          res.json({
            success: true,
            token,
            balance,
            formatted: ethers.formatEther(balance)
          });
        } catch (error) {
          logger.error('Failed to get balance:', error);
          res.status(500).json({
            success: false,
            error: (error as Error).message
          });
        }
      }).catch((error) => {
        logger.error('Failed to get balance:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve balance'
        });
      });
    }
  );

  /**
   * Estimate swap output
   * Estimate output amount for a swap based on current market conditions.
   * @param req - Express request object with swap estimation parameters
   * @param res - Express response object
   * @returns void - Sends JSON response with swap estimation
   */
  router.get('/estimate',
    body('tokenIn').isString(),
    body('tokenOut').isString(),
    body('amountIn').isNumeric(),
    (req: Request, res: Response): void => {
      void Promise.resolve().then(async () => {
        try {
          const requestBody = req.body as Record<string, unknown>;
          const tokenIn = requestBody.tokenIn as string;
          const tokenOut = requestBody.tokenOut as string;
          const amountIn = requestBody.amountIn as string;
          
          const pair = `${tokenIn}/${tokenOut}`;

          // Get market depth to estimate price impact
          const depth = await orderBook.getMarketDepth(pair, 10);
          
          // Calculate estimated output based on order book
          let remainingAmount = parseFloat(amountIn);
          let totalOutput = 0;
          
          for (const [price, volume] of depth.asks) {
            const available = Math.min(remainingAmount, volume);
            totalOutput += available * price;
            remainingAmount -= available;
            
            if (remainingAmount <= 0) break;
          }

          // Calculate price impact
          const firstAsk = depth.asks[0];
          const spotPrice = firstAsk !== null && firstAsk !== undefined ? firstAsk[0] : 0;
          const averagePrice = totalOutput / parseFloat(amountIn);
          const priceImpact = spotPrice > 0 ? ((averagePrice - spotPrice) / spotPrice) * 100 : 0;

          // Calculate fees
          const fees = parseFloat(amountIn) * 0.003; // 0.3% fee

          res.json({
            success: true,
            amountIn,
            estimatedOutput: (totalOutput - fees).toString(),
            spotPrice: spotPrice.toString(),
            averagePrice: averagePrice.toString(),
            priceImpact: priceImpact.toFixed(2),
            fees: fees.toString()
          });
        } catch (error) {
          logger.error('Failed to estimate swap:', error);
          res.status(500).json({
            success: false,
            error: (error as Error).message
          });
        }
      }).catch((error) => {
        logger.error('Failed to estimate swap:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to estimate swap'
        });
      });
    }
  );

  /**
   * Estimate deposit gas
   * Estimate gas cost for a token deposit operation.
   * @param req - Express request object with deposit parameters
   * @param res - Express response object
   * @returns void - Sends JSON response with gas estimation
   */
  router.get('/gas/deposit',
    body('token').isEthereumAddress(),
    body('amount').isNumeric(),
    (req: Request, res: Response): void => {
      void Promise.resolve().then(async () => {
        try {
          const requestBody = req.body as Record<string, unknown>;
          const token = requestBody.token as string;
          const amount = requestBody.amount as string;
          
          const gasEstimate = await contractService.estimateDepositGas(token, amount);
          
          res.json({
            success: true,
            gasLimit: gasEstimate.toString(),
            estimatedCost: ethers.formatEther(gasEstimate * 25n * 10n ** 9n) // 25 gwei
          });
        } catch (error) {
          logger.error('Failed to estimate gas:', error);
          res.status(500).json({
            success: false,
            error: (error as Error).message
          });
        }
      }).catch((error) => {
        logger.error('Failed to estimate gas:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to estimate gas cost'
        });
      });
    }
  );

  return router;
}

export default createSwapRouter;