/**
 * Unit tests for PrivacyDEXService
 *
 * Tests the privacy-enhanced DEX functionality including pXOM trading,
 * encrypted order amounts, privacy swaps, and XOM ↔ pXOM conversions.
 *
 * @module tests/services/PrivacyDEXService.test
 */

import { PrivacyDEXService } from '../../src/services/PrivacyDEXService';
import { ethers } from 'ethers';

// Mock ethers provider
const mockProvider = {
  getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
  getBlockNumber: jest.fn().mockResolvedValue(100),
  on: jest.fn(),
  off: jest.fn()
} as any;

// Mock COTI SDK
jest.mock('@coti-io/coti-sdk-typescript', () => ({
  buildInputText: jest.fn(),
  buildStringInputText: jest.fn()
}), { virtual: true });

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock ID generator
jest.mock('../../src/utils/id-generator', () => ({
  generateOrderId: jest.fn().mockImplementation(() => `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
}));

describe('PrivacyDEXService', () => {
  let service: PrivacyDEXService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    service = new PrivacyDEXService({
      privacyEnabled: true,
      mpcNodeUrl: 'https://mpc.coti.io',
      conversionFee: 0.005
    }, mockProvider);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(service).toBeDefined();
      expect(service.getPXOMPairs()).toContain('pXOM/USDC');
      expect(service.getPXOMPairs()).toContain('pXOM/XOM');
    });

    it('should handle COTI SDK import failure gracefully', async () => {
      // Create service that will fail to import COTI SDK
      const failService = new PrivacyDEXService({
        privacyEnabled: true
      }, mockProvider);

      // Allow initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(failService).toBeDefined();
      // Service should still function without privacy features
    });
  });

  describe('Privacy Order Creation', () => {
    it('should create a privacy order with encrypted amounts', async () => {
      const orderCreatedListener = jest.fn();
      service.on('privacyOrderCreated', orderCreatedListener);

      const orderId = await service.createPrivacyOrder(
        '0x123',
        'pXOM/USDC',
        'buy',
        100,
        'limit',
        1.25,
        true
      );

      expect(orderId).toMatch(/^order_/);
      expect(orderCreatedListener).toHaveBeenCalledWith({
        orderId,
        user: '0x123',
        pair: 'pXOM/USDC',
        isPrivate: true
      });
    });

    it('should create a non-privacy order with plain amounts', async () => {
      const orderId = await service.createPrivacyOrder(
        '0x456',
        'XOM/USDC',
        'sell',
        50,
        'market',
        undefined,
        false
      );

      expect(orderId).toMatch(/^order_/);

      // Verify order stored correctly
      const orders = await service.getUserPrivacyOrders('0x456');
      expect(orders).toHaveLength(1);
      expect(orders[0].isPrivate).toBe(false);
      expect(orders[0].amount).toBe(50);
    });

    it('should create market orders without price', async () => {
      const orderId = await service.createPrivacyOrder(
        '0x789',
        'pXOM/ETH',
        'buy',
        10,
        'market'
      );

      expect(orderId).toMatch(/^order_/);

      const orders = await service.getUserPrivacyOrders('0x789');
      expect(orders[0].type).toBe('MARKET');
      expect(orders[0].price).toBeUndefined();
    });
  });

  describe('XOM ↔ pXOM Conversions', () => {
    it('should convert XOM to pXOM with 0.5% fee', async () => {
      const conversionListener = jest.fn();
      service.on('conversionExecuted', conversionListener);

      const result = await service.executePrivacySwap({
        user: '0xabc',
        tokenIn: 'XOM',
        tokenOut: 'pXOM',
        amountIn: 1000,
        usePrivacy: true
      });

      expect(result.success).toBe(true);
      expect(result.amountOut).toBe(995); // 1000 - 0.5% fee
      expect(result.fee).toBe(5);
      expect(result.priceImpact).toBe(0);
      expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/);

      expect(conversionListener).toHaveBeenCalledWith({
        user: '0xabc',
        tokenIn: 'XOM',
        tokenOut: 'pXOM',
        amountIn: 1000,
        amountOut: 995,
        fee: 5,
        txHash: result.txHash
      });
    });

    it('should convert pXOM to XOM with no fee', async () => {
      const result = await service.executePrivacySwap({
        user: '0xdef',
        tokenIn: 'pXOM',
        tokenOut: 'XOM',
        amountIn: 500,
        usePrivacy: true
      });

      expect(result.success).toBe(true);
      expect(result.amountOut).toBe(500); // No fee
      expect(result.fee).toBe(0);
      expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('Privacy Swaps', () => {
    beforeEach(async () => {
      // Add initial liquidity to pools
      await service.addPrivacyLiquidity(
        '0xliquidity',
        'pXOM/USDC',
        100000,
        100000,
        false
      );
    });

    it('should execute privacy swap on supported pair', async () => {
      const swapListener = jest.fn();
      service.on('privacySwapExecuted', swapListener);

      const result = await service.executePrivacySwap({
        user: '0x111',
        tokenIn: 'pXOM',
        tokenOut: 'USDC',
        amountIn: 100,
        usePrivacy: true,
        slippage: 0.01
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.amountOut).toBeDefined();
      expect(result.fee).toBe(0.003); // 0.3% pool fee
      expect(result.priceImpact).toBeGreaterThanOrEqual(0);

      expect(swapListener).toHaveBeenCalledWith({
        user: '0x111',
        tokenIn: 'pXOM',
        tokenOut: 'USDC',
        txHash: result.txHash,
        isPrivate: true
      });
    });

    it('should execute standard swap without privacy', async () => {
      const result = await service.executePrivacySwap({
        user: '0x222',
        tokenIn: 'pXOM',
        tokenOut: 'USDC',
        amountIn: 50,
        usePrivacy: false
      });

      expect(result.success).toBe(true);
      expect(typeof result.amountOut).toBe('number');
    });

    it('should fail swap on unsupported pair', async () => {
      const result = await service.executePrivacySwap({
        user: '0x333',
        tokenIn: 'INVALID',
        tokenOut: 'TOKEN',
        amountIn: 100,
        usePrivacy: true
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No liquidity pool found');
    });

    it('should handle swap with minimum output amount', async () => {
      const result = await service.executePrivacySwap({
        user: '0x444',
        tokenIn: 'pXOM',
        tokenOut: 'USDC',
        amountIn: 1000,
        minAmountOut: 990,
        usePrivacy: false,
        deadline: Date.now() + 600000
      });

      expect(result.success).toBe(true);
      // Should execute if output meets minimum
    });
  });

  describe('Liquidity Management', () => {
    it('should add liquidity to privacy pool', async () => {
      const liquidityListener = jest.fn();
      service.on('privacyLiquidityAdded', liquidityListener);

      const txHash = await service.addPrivacyLiquidity(
        '0x555',
        'pXOM/ETH',
        1000,
        0.5,
        true
      );

      expect(txHash).toMatch(/^0x[a-f0-9]{64}$/);

      expect(liquidityListener).toHaveBeenCalledWith({
        user: '0x555',
        pair: 'pXOM/ETH',
        shares: expect.any(String),
        isPrivate: true,
        txHash
      });

      // Check pool info
      const poolInfo = await service.getPrivacyPoolInfo('pXOM/ETH');
      expect(poolInfo).toBeDefined();
      expect(poolInfo?.hasLiquidity).toBe(true);
    });

    it('should handle first liquidity provider', async () => {
      const txHash = await service.addPrivacyLiquidity(
        '0x666',
        'pXOM/BTC',
        100,
        0.01,
        false
      );

      expect(txHash).toMatch(/^0x[a-f0-9]{64}$/);

      const poolInfo = await service.getPrivacyPoolInfo('pXOM/BTC');
      expect(poolInfo?.totalShares).not.toBe('0');
    });

    it('should calculate shares for subsequent liquidity providers', async () => {
      // First provider
      await service.addPrivacyLiquidity(
        '0x777',
        'pXOM/DAI',
        1000,
        1000,
        false
      );

      // Second provider
      const txHash = await service.addPrivacyLiquidity(
        '0x888',
        'pXOM/DAI',
        2000,
        2000,
        false
      );

      expect(txHash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should reject adding liquidity to non-existent pool', async () => {
      await expect(
        service.addPrivacyLiquidity(
          '0x999',
          'INVALID/PAIR',
          100,
          100,
          true
        )
      ).rejects.toThrow('Pool INVALID/PAIR not found');
    });
  });

  describe('Order Matching', () => {
    beforeEach(() => {
      // Speed up order matching for tests
      jest.advanceTimersByTime(1000);
    });

    it('should match buy and sell orders at same price', async () => {
      const matchListener = jest.fn();
      service.on('privacyOrdersMatched', matchListener);

      // Create matching orders
      const buyOrderId = await service.createPrivacyOrder(
        '0xbuy',
        'pXOM/USDC',
        'buy',
        100,
        'limit',
        1.25,
        false
      );

      const sellOrderId = await service.createPrivacyOrder(
        '0xsell',
        'pXOM/USDC',
        'sell',
        100,
        'limit',
        1.25,
        false
      );

      // Advance time to trigger matching
      jest.advanceTimersByTime(2000);

      // Wait for async operations
      await new Promise(resolve => setImmediate(resolve));

      expect(matchListener).toHaveBeenCalledWith({
        buyOrderId,
        sellOrderId,
        pair: 'pXOM/USDC'
      });
    });

    it('should match market orders immediately', async () => {
      // Create limit order first
      await service.createPrivacyOrder(
        '0xlimit',
        'pXOM/ETH',
        'sell',
        50,
        'limit',
        0.05,
        false
      );

      // Create market buy order
      const marketOrderId = await service.createPrivacyOrder(
        '0xmarket',
        'pXOM/ETH',
        'buy',
        50,
        'market',
        undefined,
        false
      );

      // Advance time for matching
      jest.advanceTimersByTime(2000);
      await new Promise(resolve => setImmediate(resolve));

      // Check order status
      const orders = await service.getUserPrivacyOrders('0xmarket');
      const marketOrder = orders.find(o => o.id === marketOrderId);
      expect(marketOrder?.status).toBe('FILLED');
    });

    it('should not match orders with incompatible prices', async () => {
      const matchListener = jest.fn();
      service.on('privacyOrdersMatched', matchListener);

      // Create non-matching orders
      await service.createPrivacyOrder(
        '0xbuy2',
        'pXOM/USDC',
        'buy',
        100,
        'limit',
        1.20, // Buy at 1.20
        false
      );

      await service.createPrivacyOrder(
        '0xsell2',
        'pXOM/USDC',
        'sell',
        100,
        'limit',
        1.30, // Sell at 1.30 (higher than buy)
        false
      );

      // Advance time
      jest.advanceTimersByTime(2000);
      await new Promise(resolve => setImmediate(resolve));

      // Should not match
      expect(matchListener).not.toHaveBeenCalled();
    });
  });

  describe('Privacy Features', () => {
    it('should check if pair supports privacy', () => {
      expect(service.isPrivacyPair('pXOM/USDC')).toBe(true);
      expect(service.isPrivacyPair('pXOM/ETH')).toBe(true);
      expect(service.isPrivacyPair('XOM/USDC')).toBe(false);
      expect(service.isPrivacyPair('ETH/USDC')).toBe(false);
    });

    it('should return all pXOM pairs', () => {
      const pairs = service.getPXOMPairs();

      expect(pairs).toContain('pXOM/USDC');
      expect(pairs).toContain('pXOM/ETH');
      expect(pairs).toContain('pXOM/BTC');
      expect(pairs).toContain('pXOM/XOM');
      expect(pairs).toContain('pXOM/DAI');
      expect(pairs).toContain('pXOM/USDT');
    });

    it('should handle encrypted value operations', async () => {
      // Test encryption/decryption fallback when COTI SDK unavailable
      const encrypted = await (service as any).encryptValue(BigInt(1000));
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.signature).toBeDefined();

      const decrypted = await (service as any).decryptForOwner(encrypted, '0xowner');
      expect(decrypted).toBe(BigInt(1000));
    });

    it('should retrieve user privacy orders with optional decryption', async () => {
      // Create privacy order
      await service.createPrivacyOrder(
        '0xprivacy',
        'pXOM/USDC',
        'buy',
        250,
        'limit',
        1.30,
        true
      );

      // Get without decryption
      const ordersEncrypted = await service.getUserPrivacyOrders('0xprivacy', false);
      expect(ordersEncrypted).toHaveLength(1);
      expect(ordersEncrypted[0].isPrivate).toBe(true);

      // Get with decryption attempt
      const ordersDecrypted = await service.getUserPrivacyOrders('0xprivacy', true);
      expect(ordersDecrypted).toHaveLength(1);
      // Should attempt decryption (mocked to return original value)
      expect(ordersDecrypted[0].amount).toBeDefined();
    });
  });

  describe('Pool Information', () => {
    it('should get privacy pool information', async () => {
      const poolInfo = await service.getPrivacyPoolInfo('pXOM/USDC');

      expect(poolInfo).toBeDefined();
      expect(poolInfo?.pair).toBe('pXOM/USDC');
      expect(poolInfo?.feePercentage).toBe(0.003);
      expect(poolInfo?.privacyEnabled).toBe(true);
      expect(poolInfo?.hasLiquidity).toBe(false); // No liquidity added yet
    });

    it('should return null for non-existent pool', async () => {
      const poolInfo = await service.getPrivacyPoolInfo('INVALID/POOL');
      expect(poolInfo).toBeNull();
    });

    it('should update pool liquidity status', async () => {
      // Add liquidity
      await service.addPrivacyLiquidity(
        '0xprovider',
        'pXOM/USDT',
        5000,
        5000,
        false
      );

      const poolInfo = await service.getPrivacyPoolInfo('pXOM/USDT');
      expect(poolInfo?.hasLiquidity).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should provide comprehensive privacy DEX statistics', async () => {
      // Create some orders
      await service.createPrivacyOrder('0x1', 'pXOM/USDC', 'buy', 100, 'limit', 1.25, true);
      await service.createPrivacyOrder('0x2', 'pXOM/USDC', 'sell', 100, 'limit', 1.26, true);
      await service.createPrivacyOrder('0x3', 'XOM/USDC', 'buy', 200, 'market', undefined, false);

      const stats = await service.getPrivacyStats();

      expect(stats.totalOrders).toBe(3);
      expect(stats.privateOrders).toBe(2);
      expect(stats.publicOrders).toBe(1);
      expect(stats.privacyPools).toBe(6); // Number of default pairs
      expect(stats.supportedPairs).toHaveLength(6);
      expect(stats.privacyEnabled).toBe(true);
      expect(stats.mpcConnected).toBe(true); // Mocked as connected
    });
  });

  describe('Error Handling', () => {
    it('should handle order creation errors', async () => {
      // Mock error in order creation
      jest.spyOn(service as any, 'encryptValue').mockRejectedValueOnce(new Error('Encryption failed'));

      await expect(
        service.createPrivacyOrder(
          '0xerror',
          'pXOM/USDC',
          'buy',
          100,
          'limit',
          1.25,
          true
        )
      ).rejects.toThrow('Encryption failed');
    });

    it('should handle swap execution errors gracefully', async () => {
      // Mock error in swap
      jest.spyOn(service as any, 'getPrivacyPoolInfo').mockImplementationOnce(() => {
        throw new Error('Pool error');
      });

      const result = await service.executePrivacySwap({
        user: '0xfail',
        tokenIn: 'pXOM',
        tokenOut: 'USDC',
        amountIn: 100,
        usePrivacy: true
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Pool error');
    });

    it('should handle liquidity addition errors', async () => {
      // Mock encryption error
      jest.spyOn(service as any, 'encryptValue').mockRejectedValueOnce(new Error('Encryption failed'));

      await expect(
        service.addPrivacyLiquidity(
          '0xliqfail',
          'pXOM/ETH',
          1000,
          0.5,
          true
        )
      ).rejects.toThrow('Encryption failed');
    });
  });

  describe('Event Emissions', () => {
    it('should emit correct events during operations', async () => {
      const events = {
        orderCreated: jest.fn(),
        swapExecuted: jest.fn(),
        liquidityAdded: jest.fn(),
        conversionExecuted: jest.fn(),
        ordersMatched: jest.fn(),
        poolUpdated: jest.fn()
      };

      // Register listeners
      Object.entries(events).forEach(([event, handler]) => {
        const eventName = event.replace(/([A-Z])/g, ':$1').toLowerCase();
        service.on(`privacy${eventName}`, handler);
      });

      // Trigger various operations
      await service.createPrivacyOrder('0xevents', 'pXOM/USDC', 'buy', 100, 'limit', 1.25);
      expect(events.orderCreated).toHaveBeenCalled();

      await service.executePrivacySwap({
        user: '0xevents',
        tokenIn: 'XOM',
        tokenOut: 'pXOM',
        amountIn: 100,
        usePrivacy: true
      });
      expect(events.conversionExecuted).toHaveBeenCalled();

      await service.addPrivacyLiquidity('0xevents', 'pXOM/USDC', 1000, 1000, false);
      expect(events.liquidityAdded).toHaveBeenCalled();
    });
  });
});