/**
 * Perpetuals Trading Engine Tests
 * 
 * Tests for perpetual futures trading functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PerpetualEngine } from '../src/core/perpetuals/PerpetualEngine';
import { PerpetualIntegration } from '../src/core/perpetuals/PerpetualIntegration';
import { DecentralizedOrderBook } from '../src/core/dex/DecentralizedOrderBook';
import { EventEmitter } from 'events';

describe('Perpetuals Trading Engine', () => {
  let engine: PerpetualEngine;
  let integration: PerpetualIntegration;
  let orderBook: DecentralizedOrderBook;

  beforeEach(async () => {
    // Initialize real components (no mocks!)
    engine = new PerpetualEngine();
    orderBook = new DecentralizedOrderBook();
    integration = new PerpetualIntegration(engine, orderBook);

    await orderBook.initialize();
    await engine.initialize();
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  describe('Position Management', () => {
    it('should open a long position', async () => {
      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18), // 1 BTC
        leverage: 10,
        price: BigInt(50000e18) // $50,000
      });

      expect(position).toBeDefined();
      expect(position.side).toBe('LONG');
      expect(position.leverage).toBe(10);
      expect(position.status).toBe('OPEN');
      expect(position.entryPrice).toBe(BigInt(50000e18));
    });

    it('should open a short position', async () => {
      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'ETH-USD',
        side: 'SHORT',
        size: BigInt(10e18), // 10 ETH
        leverage: 5,
        price: BigInt(3000e18) // $3,000
      });

      expect(position).toBeDefined();
      expect(position.side).toBe('SHORT');
      expect(position.leverage).toBe(5);
      expect(position.margin).toBeGreaterThan(BigInt(0));
    });

    it('should calculate liquidation price correctly', async () => {
      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18),
        leverage: 20,
        price: BigInt(50000e18)
      });

      // For 20x leverage, liquidation should be at ~5% move against position
      // Long position liquidates when price drops
      const expectedLiquidationPrice = BigInt(47500e18); // Approximately
      const liquidationDiff = position.liquidationPrice > expectedLiquidationPrice 
        ? position.liquidationPrice - expectedLiquidationPrice
        : expectedLiquidationPrice - position.liquidationPrice;
      
      // Allow 2% margin of error in calculation
      const tolerance = BigInt(1000e18);
      expect(liquidationDiff).toBeLessThan(tolerance);
    });

    it('should reject invalid leverage', async () => {
      await expect(engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18),
        leverage: 150, // Too high
        price: BigInt(50000e18)
      })).rejects.toThrow('exceeds maximum');
    });

    it('should update position on price change', async () => {
      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18),
        leverage: 10,
        price: BigInt(50000e18)
      });

      // Update mark price
      await engine.updateMarkPrice('BTC-USD', BigInt(51000e18));

      const updatedPosition = engine.getPosition(position.id);
      expect(updatedPosition?.unrealizedPnl).toBeGreaterThan(BigInt(0));
    });

    it('should close position partially', async () => {
      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(2e18), // 2 BTC
        leverage: 10,
        price: BigInt(50000e18)
      });

      await engine.closePosition(position.id, BigInt(1e18)); // Close 1 BTC

      const updatedPosition = engine.getPosition(position.id);
      expect(updatedPosition?.size).toBe(BigInt(1e18));
      expect(updatedPosition?.status).toBe('OPEN');
    });

    it('should close position fully', async () => {
      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e18),
        leverage: 5,
        price: BigInt(50000e18)
      });

      await engine.closePosition(position.id);

      const closedPosition = engine.getPosition(position.id);
      expect(closedPosition?.status).toBe('CLOSED');
    });
  });

  describe('Funding Rate', () => {
    it('should calculate funding rate based on price divergence', async () => {
      // Set different mark and index prices
      await engine.updateMarkPrice('BTC-USD', BigInt(50500e18));
      await engine.updateIndexPrice('BTC-USD', BigInt(50000e18));

      const fundingRate = engine.calculateFundingRate('BTC-USD');
      
      // Positive funding when mark > index (longs pay shorts)
      expect(fundingRate).toBeGreaterThan(0);
    });

    it('should apply funding payments to positions', async () => {
      const longPosition = await engine.openPosition({
        trader: '0x1111111111111111111111111111111111111111',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18),
        leverage: 10,
        price: BigInt(50000e18)
      });

      const shortPosition = await engine.openPosition({
        trader: '0x2222222222222222222222222222222222222222',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e18),
        leverage: 10,
        price: BigInt(50000e18)
      });

      // Set mark price above index (positive funding)
      await engine.updateMarkPrice('BTC-USD', BigInt(50500e18));
      await engine.updateIndexPrice('BTC-USD', BigInt(50000e18));

      // Apply funding
      await engine.applyFunding('BTC-USD');

      const updatedLong = engine.getPosition(longPosition.id);
      const updatedShort = engine.getPosition(shortPosition.id);

      // Long pays funding (negative)
      expect(updatedLong?.fundingPayment).toBeLessThan(BigInt(0));
      // Short receives funding (positive)
      expect(updatedShort?.fundingPayment).toBeGreaterThan(BigInt(0));
    });
  });

  describe('Liquidation Engine', () => {
    it('should liquidate undercollateralized position', async () => {
      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18),
        leverage: 50, // High leverage
        price: BigInt(50000e18)
      });

      // Move price against position
      await engine.updateMarkPrice('BTC-USD', BigInt(49000e18));

      // Check liquidations
      const liquidated = await engine.checkLiquidations('BTC-USD');
      expect(liquidated).toContain(position.id);

      const liquidatedPosition = engine.getPosition(position.id);
      expect(liquidatedPosition?.status).toBe('LIQUIDATED');
    });

    it('should add remaining collateral to insurance fund', async () => {
      const initialInsurance = engine.getInsuranceFund();

      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e18),
        leverage: 25,
        price: BigInt(50000e18)
      });

      // Move price against position
      await engine.updateMarkPrice('BTC-USD', BigInt(52000e18));
      await engine.checkLiquidations('BTC-USD');

      const finalInsurance = engine.getInsuranceFund();
      expect(finalInsurance).toBeGreaterThan(initialInsurance);
    });
  });

  describe('Integration with Order Book', () => {
    it('should create order book entry for perpetual order', async () => {
      const result = await integration.processPerpetualOrder({
        userId: '0x1234567890123456789012345678901234567890',
        contract: 'BTC-USD',
        type: 'LIMIT',
        side: 'LONG',
        size: '1.0',
        leverage: 10,
        entryPrice: '50000',
        status: 'PENDING'
      });

      expect(result.success).toBe(true);
      expect(result.position).toBeDefined();
      expect(result.order).toBeDefined();
    });

    it('should handle market statistics correctly', () => {
      const markets = integration.getMarkets();
      expect(markets).toBeInstanceOf(Array);
      expect(markets.length).toBeGreaterThan(0);

      const btcMarket = markets.find(m => m.symbol === 'BTC-USD');
      expect(btcMarket).toBeDefined();
      expect(btcMarket?.maxLeverage).toBe(100);
    });

    it('should track open interest', async () => {
      const initialOI = integration.getOpenInterest('BTC-USD');

      await integration.processPerpetualOrder({
        userId: '0x1234567890123456789012345678901234567890',
        contract: 'BTC-USD',
        type: 'MARKET',
        side: 'LONG',
        size: '1.0',
        leverage: 10,
        status: 'PENDING'
      });

      const finalOI = integration.getOpenInterest('BTC-USD');
      expect(parseFloat(finalOI)).toBeGreaterThan(parseFloat(initialOI));
    });
  });

  describe('Risk Management', () => {
    it('should enforce maximum position size', async () => {
      await expect(engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1000000e18), // Huge position
        leverage: 10,
        price: BigInt(50000e18)
      })).rejects.toThrow('Insufficient liquidity');
    });

    it('should prevent duplicate positions in same direction', async () => {
      await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18),
        leverage: 10,
        price: BigInt(50000e18)
      });

      // Should aggregate into existing position instead of creating new
      const secondPosition = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18),
        leverage: 10,
        price: BigInt(51000e18)
      });

      const positions = engine.getTraderPositions('0x1234567890123456789012345678901234567890');
      const btcPositions = positions.filter(p => p.market === 'BTC-USD' && p.side === 'LONG');
      expect(btcPositions.length).toBe(1);
      expect(btcPositions[0].size).toBe(BigInt(2e18)); // Combined size
    });
  });

  describe('Event Emissions', () => {
    it('should emit events on position lifecycle', async () => {
      const events: any[] = [];
      
      engine.on('positionOpened', (data) => events.push({ type: 'opened', data }));
      engine.on('positionClosed', (data) => events.push({ type: 'closed', data }));
      engine.on('positionLiquidated', (data) => events.push({ type: 'liquidated', data }));

      const position = await engine.openPosition({
        trader: '0x1234567890123456789012345678901234567890',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e18),
        leverage: 10,
        price: BigInt(50000e18)
      });

      await engine.closePosition(position.id);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('opened');
      expect(events[1].type).toBe('closed');
    });
  });
});