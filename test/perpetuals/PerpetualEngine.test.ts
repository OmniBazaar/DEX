/**
 * PerpetualEngine Test Suite
 * 
 * Tests for perpetual futures trading engine including:
 * - Position opening/closing
 * - Leverage management
 * - Funding rate calculations
 * - Liquidation mechanics
 * - PnL calculations
 * 
 * @module test/perpetuals/PerpetualEngine
 */

import { expect } from 'chai';
import { PerpetualEngine, PerpetualPosition } from '../../src/core/perpetuals/PerpetualEngine';

describe('PerpetualEngine', () => {
  let engine: PerpetualEngine;

  beforeEach(() => {
    engine = new PerpetualEngine();
    // Set initial prices
    engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
    engine.updateIndexPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
    engine.updateMarkPrice('ETH-USD', BigInt(3000) * BigInt(1e18));
    engine.updateIndexPrice('ETH-USD', BigInt(3000) * BigInt(1e18));
  });

  afterEach(() => {
    engine.stopFundingTimer();
  });

  describe('Market Management', () => {
    it('should initialize with default markets', () => {
      const btcMarket = engine.getMarket('BTC-USD');
      const ethMarket = engine.getMarket('ETH-USD');

      expect(btcMarket).to.exist;
      expect(btcMarket?.symbol).to.equal('BTC-USD');
      expect(btcMarket?.maxLeverage).to.equal(100);

      expect(ethMarket).to.exist;
      expect(ethMarket?.symbol).to.equal('ETH-USD');
      expect(ethMarket?.maxLeverage).to.equal(50);
    });

    it('should add new markets', () => {
      engine.addMarket({
        symbol: 'SOL-USD',
        baseCurrency: 'SOL',
        quoteCurrency: 'USD',
        minSize: BigInt(1e18), // 1 SOL
        tickSize: BigInt(1e16), // $0.01
        maxLeverage: 20,
        initialMargin: 5,
        maintenanceMargin: 2.5,
        fundingInterval: 28800,
        maxFundingRate: BigInt(1e14),
        makerFee: BigInt(2e13),
        takerFee: BigInt(5e13),
        insuranceFund: '0x0000000000000000000000000000000000000000',
        status: 'ACTIVE'
      });

      const solMarket = engine.getMarket('SOL-USD');
      expect(solMarket).to.exist;
      expect(solMarket?.symbol).to.equal('SOL-USD');
    });
  });

  describe('Position Opening', () => {
    it('should open a long position', () => {
      const position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17), // 0.1 BTC
        leverage: 10
      });

      expect(position).to.exist;
      expect(position.side).to.equal('LONG');
      expect(position.leverage).to.equal(10);
      expect(position.status).to.equal('OPEN');
      expect(position.size).to.equal(BigInt(1e17));
    });

    it('should open a short position', () => {
      const position = engine.openPosition({
        trader: '0x456',
        market: 'ETH-USD',
        side: 'SHORT',
        size: BigInt(1e18), // 1 ETH
        leverage: 5
      });

      expect(position).to.exist;
      expect(position.side).to.equal('SHORT');
      expect(position.leverage).to.equal(5);
      expect(position.status).to.equal('OPEN');
    });

    it('should reject position with excessive leverage', () => {
      try {
        engine.openPosition({
          trader: '0x789',
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(1e17),
          leverage: 150 // Exceeds max of 100
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).to.include('exceeds maximum');
      }
    });

    it('should reject position below minimum size', () => {
      try {
        engine.openPosition({
          trader: '0xabc',
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(1000), // Below minimum
          leverage: 10
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).to.include('below minimum');
      }
    });

    it('should calculate correct margin requirement', () => {
      const position = engine.openPosition({
        trader: '0xdef',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17), // 0.1 BTC
        leverage: 10,
        price: BigInt(50000) * BigInt(1e18)
      });

      // Notional value = 0.1 BTC * $50,000 = $5,000
      // Margin = $5,000 / 10 = $500
      const expectedMargin = BigInt(500) * BigInt(1e18);
      expect(position.margin).to.equal(expectedMargin);
    });
  });

  describe('Position Closing', () => {
    let position: PerpetualPosition;

    beforeEach(() => {
      position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17), // 0.1 BTC
        leverage: 10
      });
    });

    it('should close a full position', () => {
      const closed = engine.closePosition(position.id);

      expect(closed.status).to.equal('CLOSED');
      expect(closed.size).to.equal(BigInt(0));
    });

    it('should close a partial position', () => {
      const partialSize = BigInt(5e16); // 0.05 BTC
      const closed = engine.closePosition(position.id, partialSize);

      expect(closed.status).to.equal('OPEN');
      expect(closed.size).to.equal(BigInt(5e16)); // Remaining 0.05 BTC
    });

    it('should calculate profit for long position', () => {
      // Price increases to $55,000
      engine.updateMarkPrice('BTC-USD', BigInt(55000) * BigInt(1e18));
      
      const closed = engine.closePosition(position.id);
      
      // Profit = 0.1 BTC * ($55,000 - $50,000) = $500
      const expectedPnl = BigInt(500) * BigInt(1e18);
      expect(closed.realizedPnl).to.equal(expectedPnl);
    });

    it('should calculate loss for long position', () => {
      // Price decreases to $45,000
      engine.updateMarkPrice('BTC-USD', BigInt(45000) * BigInt(1e18));
      
      const closed = engine.closePosition(position.id);
      
      // Loss = 0.1 BTC * ($45,000 - $50,000) = -$500
      const expectedPnl = BigInt(-500) * BigInt(1e18);
      expect(closed.realizedPnl).to.equal(expectedPnl);
    });
  });

  describe('Leverage Management', () => {
    let position: PerpetualPosition;

    beforeEach(() => {
      position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });
    });

    it('should update leverage', () => {
      const updated = engine.updateLeverage(position.id, 5);

      expect(updated.leverage).to.equal(5);
      // Margin should double when leverage is halved
      expect(updated.margin).to.equal(position.margin * BigInt(2));
    });

    it('should reject excessive leverage update', () => {
      try {
        engine.updateLeverage(position.id, 150);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).to.include('exceeds maximum');
      }
    });

    it('should update liquidation price with leverage change', () => {
      const originalLiqPrice = position.liquidationPrice;
      const updated = engine.updateLeverage(position.id, 5);

      // Lower leverage should result in lower liquidation price for long
      expect(updated.liquidationPrice).to.be.lessThan(originalLiqPrice);
    });
  });

  describe('Liquidation', () => {
    it('should liquidate long position when price drops', () => {
      const position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 100 // High leverage for easier liquidation
      });

      // Price drops significantly
      engine.updateMarkPrice('BTC-USD', BigInt(49000) * BigInt(1e18));
      
      engine.checkLiquidations();
      
      const liquidated = engine.getPosition(position.id);
      expect(liquidated?.status).to.equal('LIQUIDATED');
    });

    it('should liquidate short position when price rises', () => {
      const position = engine.openPosition({
        trader: '0x456',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e17),
        leverage: 100
      });

      // Price rises significantly
      engine.updateMarkPrice('BTC-USD', BigInt(51000) * BigInt(1e18));
      
      engine.checkLiquidations();
      
      const liquidated = engine.getPosition(position.id);
      expect(liquidated?.status).to.equal('LIQUIDATED');
    });

    it('should add liquidation fee to insurance fund', () => {
      const initialFund = engine.getInsuranceFund();
      
      engine.openPosition({
        trader: '0x789',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 100
      });

      engine.updateMarkPrice('BTC-USD', BigInt(49000) * BigInt(1e18));
      engine.checkLiquidations();
      
      const finalFund = engine.getInsuranceFund();
      expect(finalFund).to.be.greaterThan(initialFund);
    });
  });

  describe('Funding Rates', () => {
    it('should calculate funding rate based on premium', () => {
      // Set mark price higher than index (positive premium)
      engine.updateMarkPrice('BTC-USD', BigInt(51000) * BigInt(1e18));
      engine.updateIndexPrice('BTC-USD', BigInt(50000) * BigInt(1e18));

      const funding = engine.getFundingRate('BTC-USD');
      expect(funding).to.exist;
      
      // With positive premium, funding rate should be positive
      // (longs pay shorts)
      expect(funding!.rate).to.be.greaterThan(BigInt(0));
    });

    it('should apply funding to long positions', async () => {
      const position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });

      // Set positive funding rate
      engine.updateMarkPrice('BTC-USD', BigInt(51000) * BigInt(1e18));
      
      // Manually trigger funding (normally on timer)
      await (engine as any).processFunding();
      
      const updated = engine.getPosition(position.id);
      // Long positions pay funding when rate is positive
      expect(updated!.fundingPayment).to.be.greaterThan(BigInt(0));
    });

    it('should apply funding to short positions', async () => {
      const position = engine.openPosition({
        trader: '0x456',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e17),
        leverage: 10
      });

      // Set positive funding rate
      engine.updateMarkPrice('BTC-USD', BigInt(51000) * BigInt(1e18));
      
      await (engine as any).processFunding();
      
      const updated = engine.getPosition(position.id);
      // Short positions receive funding when rate is positive
      expect(updated!.fundingPayment).to.be.lessThan(BigInt(0));
    });
  });

  describe('PnL Calculations', () => {
    it('should calculate unrealized PnL for long position', () => {
      const position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17), // 0.1 BTC
        leverage: 10,
        price: BigInt(50000) * BigInt(1e18)
      });

      // Price increases to $52,000
      engine.updateMarkPrice('BTC-USD', BigInt(52000) * BigInt(1e18));
      
      const updated = engine.getPosition(position.id);
      // Unrealized PnL = 0.1 * ($52,000 - $50,000) = $200
      const expectedPnl = BigInt(200) * BigInt(1e18);
      expect(updated!.unrealizedPnl).to.equal(expectedPnl);
    });

    it('should calculate unrealized PnL for short position', () => {
      const position = engine.openPosition({
        trader: '0x456',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e17), // 0.1 BTC
        leverage: 10,
        price: BigInt(50000) * BigInt(1e18)
      });

      // Price decreases to $48,000
      engine.updateMarkPrice('BTC-USD', BigInt(48000) * BigInt(1e18));
      
      const updated = engine.getPosition(position.id);
      // Unrealized PnL = 0.1 * ($50,000 - $48,000) = $200
      const expectedPnl = BigInt(200) * BigInt(1e18);
      expect(updated!.unrealizedPnl).to.equal(expectedPnl);
    });
  });

  describe('Open Interest Tracking', () => {
    it('should track open interest for market', () => {
      const initialOI = engine.getOpenInterest('BTC-USD');
      expect(initialOI).to.equal(BigInt(0));

      engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });

      const afterOpen = engine.getOpenInterest('BTC-USD');
      expect(afterOpen).to.equal(BigInt(1e17));

      engine.openPosition({
        trader: '0x456',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(2e17),
        leverage: 5
      });

      const afterSecond = engine.getOpenInterest('BTC-USD');
      expect(afterSecond).to.equal(BigInt(3e17));
    });

    it('should reduce open interest on position close', () => {
      const position = engine.openPosition({
        trader: '0x789',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });

      const beforeClose = engine.getOpenInterest('BTC-USD');
      engine.closePosition(position.id);
      const afterClose = engine.getOpenInterest('BTC-USD');

      expect(afterClose).to.equal(beforeClose - BigInt(1e17));
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero price scenarios', () => {
      engine.updateMarkPrice('BTC-USD', BigInt(0));
      const price = engine.getMarkPrice('BTC-USD');
      expect(price).to.equal(BigInt(0));
    });

    it('should reject position for inactive market', () => {
      try {
        engine.openPosition({
          trader: '0xabc',
          market: 'UNKNOWN-USD',
          side: 'LONG',
          size: BigInt(1e17),
          leverage: 10
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).to.include('not available');
      }
    });

    it('should handle multiple positions per trader', () => {
      const trader = '0xmulti';
      
      const pos1 = engine.openPosition({
        trader,
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });

      const pos2 = engine.openPosition({
        trader,
        market: 'ETH-USD',
        side: 'SHORT',
        size: BigInt(1e18),
        leverage: 5
      });

      const positions = engine.getTraderPositions(trader);
      expect(positions).to.have.lengthOf(2);
      expect(positions.map(p => p.id)).to.include(pos1.id);
      expect(positions.map(p => p.id)).to.include(pos2.id);
    });
  });
});