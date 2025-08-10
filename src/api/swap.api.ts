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
 * Create swap API router with smart contract integration
 */
export function createSwapRouter(
  orderBook: DecentralizedOrderBook,
  contractService: ContractService
): Router {
  const router = Router();

  /**
   * @api {post} /api/swap/deposit Deposit tokens to DEX
   * @apiName DepositToDEX
   * @apiGroup Swap
   * @apiDescription Deposit tokens from wallet to DEX smart contract
   * 
   * @apiParam {String} token Token contract address
   * @apiParam {String} amount Amount to deposit (in wei)
   * 
   * @apiSuccess {Boolean} success Operation success status
   * @apiSuccess {String} txHash Transaction hash
   * @apiSuccess {Number} blockNumber Block number
   * @apiSuccess {String} balance Updated DEX balance
   */
  router.post('/deposit',
    authMiddleware,
    body('token').isEthereumAddress(),
    body('amount').isNumeric(),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }

        const { token, amount } = req.body as DepositRequest;

        // Validate amount
        if (BigInt(amount) <= 0n) {
          return res.status(400).json({
            success: false,
            error: 'Invalid amount'
          });
        }

        // Execute deposit on-chain
        const result = await contractService.depositToDEX(
          token,
          amount,
          userId
        );

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error || 'Deposit failed'
          });
        }

        // Get updated balance
        const balance = await contractService.getDEXBalance(userId, token);

        logger.info('User deposited to DEX', {
          userId,
          token,
          amount,
          txHash: result.txHash
        });

        return res.json({
          success: true,
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          balance
        });
      } catch (error) {
        logger.error('Deposit failed:', error);
        return res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  /**
   * @api {post} /api/swap/withdraw Withdraw tokens from DEX
   * @apiName WithdrawFromDEX
   * @apiGroup Swap
   * @apiDescription Withdraw tokens from DEX smart contract to wallet
   * 
   * @apiParam {String} token Token contract address
   * @apiParam {String} amount Amount to withdraw (in wei)
   */
  router.post('/withdraw',
    authMiddleware,
    body('token').isEthereumAddress(),
    body('amount').isNumeric(),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }

        const { token, amount } = req.body as WithdrawRequest;

        // Check balance
        const balance = await contractService.getDEXBalance(userId, token);
        if (BigInt(balance) < BigInt(amount)) {
          return res.status(400).json({
            success: false,
            error: 'Insufficient balance'
          });
        }

        // Execute withdrawal on-chain
        const result = await contractService.withdrawFromDEX(
          token,
          amount
        );

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error || 'Withdrawal failed'
          });
        }

        // Get updated balance
        const newBalance = await contractService.getDEXBalance(userId, token);

        logger.info('User withdrew from DEX', {
          userId,
          token,
          amount,
          txHash: result.txHash
        });

        return res.json({
          success: true,
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          balance: newBalance
        });
      } catch (error) {
        logger.error('Withdrawal failed:', error);
        return res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  /**
   * @api {post} /api/swap/execute Execute token swap
   * @apiName ExecuteSwap
   * @apiGroup Swap
   * @apiDescription Execute a token swap with on-chain settlement
   * 
   * @apiParam {String} tokenIn Input token address
   * @apiParam {String} tokenOut Output token address
   * @apiParam {String} amountIn Amount to swap
   * @apiParam {String} [minAmountOut] Minimum output amount
   * @apiParam {Number} [slippage=0.5] Slippage tolerance (%)
   * @apiParam {Boolean} [usePrivacy=false] Use privacy features
   */
  router.post('/execute',
    authMiddleware,
    body('tokenIn').isString(),
    body('tokenOut').isString(),
    body('amountIn').isNumeric(),
    body('minAmountOut').optional().isNumeric(),
    body('slippage').optional().isFloat({ min: 0, max: 100 }),
    body('usePrivacy').optional().isBoolean(),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
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

        if (!orderResult.success) {
          return res.status(400).json({
            success: false,
            error: orderResult.message || 'Swap failed'
          });
        }

        // Calculate output amount based on executed price
        const executedPrice = parseFloat(orderResult.order.averagePrice || '0');
        const amountOut = (parseFloat(swapRequest.amountIn) * executedPrice).toString();

        // Check slippage
        if (swapRequest.minAmountOut) {
          if (BigInt(amountOut) < BigInt(swapRequest.minAmountOut)) {
            // Cancel order due to slippage
            await orderBook.cancelOrder(orderResult.orderId, userId);
            return res.status(400).json({
              success: false,
              error: 'Slippage tolerance exceeded'
            });
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

        if (!settlementSuccess) {
          logger.warn('On-chain settlement failed, using off-chain');
        }

        logger.info('Swap executed', {
          userId,
          pair,
          amountIn: swapRequest.amountIn,
          amountOut,
          orderId: orderResult.orderId
        });

        return res.json({
          success: true,
          orderId: orderResult.orderId,
          amountIn: swapRequest.amountIn,
          amountOut,
          executedPrice,
          fees: orderResult.fees
        });
      } catch (error) {
        logger.error('Swap execution failed:', error);
        return res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  /**
   * @api {get} /api/swap/balance/:token Get DEX balance
   * @apiName GetDEXBalance
   * @apiGroup Swap
   * @apiDescription Get user's balance for a specific token in the DEX
   * 
   * @apiParam {String} token Token contract address
   */
  router.get('/balance/:token',
    authMiddleware,
    param('token').isEthereumAddress(),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }

        const token = req.params.token!;
        const balance = await contractService.getDEXBalance(userId, token);

        return res.json({
          success: true,
          token,
          balance,
          formatted: ethers.formatEther(balance)
        });
      } catch (error) {
        logger.error('Failed to get balance:', error);
        return res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  /**
   * @api {get} /api/swap/estimate Estimate swap output
   * @apiName EstimateSwap
   * @apiGroup Swap
   * @apiDescription Estimate output amount for a swap
   */
  router.get('/estimate',
    body('tokenIn').isString(),
    body('tokenOut').isString(),
    body('amountIn').isNumeric(),
    async (req: Request, res: Response) => {
      try {
        const { tokenIn, tokenOut, amountIn } = req.body;
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
        const spotPrice = depth.asks[0]?.[0] || 0;
        const averagePrice = totalOutput / parseFloat(amountIn);
        const priceImpact = ((averagePrice - spotPrice) / spotPrice) * 100;

        // Calculate fees
        const fees = parseFloat(amountIn) * 0.003; // 0.3% fee

        return res.json({
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
        return res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  /**
   * @api {get} /api/swap/gas/deposit Estimate deposit gas
   * @apiName EstimateDepositGas
   * @apiGroup Swap
   */
  router.get('/gas/deposit',
    body('token').isEthereumAddress(),
    body('amount').isNumeric(),
    async (req: Request, res: Response) => {
      try {
        const { token, amount } = req.body;
        const gasEstimate = await contractService.estimateDepositGas(token, amount);
        
        return res.json({
          success: true,
          gasLimit: gasEstimate.toString(),
          estimatedCost: ethers.formatEther(gasEstimate * 25n * 10n ** 9n) // 25 gwei
        });
      } catch (error) {
        logger.error('Failed to estimate gas:', error);
        return res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  return router;
}

export default createSwapRouter;