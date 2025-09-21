/**
 * Unit tests for PerpetualEngine
 *
 * Tests the perpetual futures trading engine including position management,
 * leverage, funding rates, liquidations, and PnL calculations.
 *
 * @module tests/core/perpetuals/PerpetualEngine.test
 */

import { PerpetualEngine, PerpetualPosition, PerpetualMarket } from '../../../src/core/perpetuals/PerpetualEngine';

describe('PerpetualEngine', () => {
  let engine: PerpetualEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    engine = new PerpetualEngine();
  });

  afterEach(() => {
    engine.stopFundingTimer();
    jest.useRealTimers();
  });

  describe('Market Management', () => {
    it('should initialize with default BTC and ETH markets', () => {
      const btcMarket = engine.getMarket('BTC-USD');
      const ethMarket = engine.getMarket('ETH-USD');

      expect(btcMarket).toBeDefined();
      expect(btcMarket?.symbol).toBe('BTC-USD');
      expect(btcMarket?.maxLeverage).toBe(100);

      expect(ethMarket).toBeDefined();
      expect(ethMarket?.symbol).toBe('ETH-USD');
      expect(ethMarket?.maxLeverage).toBe(50);
    });

    it('should add new perpetual market', () => {
      const marketAddedListener = jest.fn();
      engine.on('market:added', marketAddedListener);

      const newMarket: PerpetualMarket = {
        symbol: 'SOL-USD',
        baseCurrency: 'SOL',
        quoteCurrency: 'USD',
        minSize: BigInt(1e18), // 1 SOL
        tickSize: BigInt(1e16), // $0.01
        maxLeverage: 20,
        initialMargin: 5,
        maintenanceMargin: 2.5,
        fundingInterval: 28800,
        maxFundingRate: BigInt(1e14), // 0.01%
        makerFee: BigInt(2e13), // 0.002%
        takerFee: BigInt(5e13), // 0.005%
        insuranceFund: '0x0000000000000000000000000000000000000000',
        status: 'ACTIVE'
      };

      engine.addMarket(newMarket);

      expect(engine.getMarket('SOL-USD')).toEqual(newMarket);
      expect(engine.getOpenInterest('SOL-USD')).toBe(0n);
      expect(engine.getFundingRate('SOL-USD')).toBeDefined();
      expect(marketAddedListener).toHaveBeenCalledWith(newMarket);
    });
  });

  describe('Position Opening', () => {
    beforeEach(() => {
      // Set initial mark prices
      engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18)); // $50,000
      engine.updateIndexPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
    });

    it('should open a long position', () => {
      const positionOpenedListener = jest.fn();
      engine.on('position:opened', positionOpenedListener);

      const position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17), // 0.1 BTC
        leverage: 10
      });

      expect(position.id).toMatch(/^pos_\d+$/);
      expect(position.trader).toBe('0x123');
      expect(position.side).toBe('LONG');
      expect(position.size).toBe(BigInt(1e17));
      expect(position.leverage).toBe(10);
      expect(position.status).toBe('OPEN');
      expect(position.entryPrice).toBe(BigInt(50000) * BigInt(1e18));
      expect(position.margin).toBe(BigInt(500) * BigInt(1e18)); // $5000 / 10

      expect(positionOpenedListener).toHaveBeenCalledWith(position);
      expect(engine.getOpenInterest('BTC-USD')).toBe(BigInt(1e17));
    });

    it('should open a short position', () => {
      const position = engine.openPosition({
        trader: '0x456',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(2e17), // 0.2 BTC
        leverage: 5,
        price: BigInt(51000) * BigInt(1e18) // Custom entry price
      });

      expect(position.side).toBe('SHORT');
      expect(position.entryPrice).toBe(BigInt(51000) * BigInt(1e18));
      expect(position.margin).toBe(BigInt(2040) * BigInt(1e18)); // 0.2 * 51000 / 5
    });

    it('should reject position with leverage exceeding maximum', () => {
      expect(() => {
        engine.openPosition({
          trader: '0x789',
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(1e17),
          leverage: 101 // Max is 100
        });
      }).toThrow('Leverage 101 exceeds maximum 100');
    });

    it('should reject position below minimum size', () => {
      expect(() => {
        engine.openPosition({
          trader: '0xabc',
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(1e5), // Below minimum
          leverage: 10
        });
      }).toThrow('Size below minimum');
    });

    it('should reject position for inactive market', () => {
      const market = engine.getMarket('BTC-USD');
      if (market) {
        market.status = 'SUSPENDED';
      }

      expect(() => {
        engine.openPosition({
          trader: '0xdef',
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(1e17),
          leverage: 10
        });
      }).toThrow('Market BTC-USD not available');
    });
  });

  describe('Position Closing', () => {
    let position: PerpetualPosition;

    beforeEach(() => {
      engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
      position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17), // 0.1 BTC
        leverage: 10
      });
    });

    it('should close full position with profit', () => {
      const positionClosedListener = jest.fn();
      engine.on('position:closed', positionClosedListener);

      // Price increased to $55,000
      engine.updateMarkPrice('BTC-USD', BigInt(55000) * BigInt(1e18));

      const closedPosition = engine.closePosition(position.id);

      expect(closedPosition.status).toBe('CLOSED');
      expect(closedPosition.size).toBe(0n);
      expect(closedPosition.realizedPnl).toBe(BigInt(500) * BigInt(1e18)); // 0.1 * ($55k - $50k)

      expect(positionClosedListener).toHaveBeenCalledWith({
        position: closedPosition,
        closeSize: BigInt(1e17),
        closePrice: BigInt(55000) * BigInt(1e18),
        pnl: BigInt(500) * BigInt(1e18)
      });

      expect(engine.getOpenInterest('BTC-USD')).toBe(0n);
    });

    it('should close full position with loss', () => {
      // Price decreased to $45,000
      engine.updateMarkPrice('BTC-USD', BigInt(45000) * BigInt(1e18));

      const closedPosition = engine.closePosition(position.id);

      expect(closedPosition.realizedPnl).toBe(BigInt(-500) * BigInt(1e18)); // 0.1 * ($45k - $50k)
    });

    it('should partially close position', () => {
      engine.updateMarkPrice('BTC-USD', BigInt(52000) * BigInt(1e18));

      const updatedPosition = engine.closePosition(
        position.id,
        BigInt(3e16) // Close 0.03 BTC
      );

      expect(updatedPosition.status).toBe('OPEN');
      expect(updatedPosition.size).toBe(BigInt(7e16)); // 0.07 BTC remaining
      expect(updatedPosition.realizedPnl).toBe(BigInt(60) * BigInt(1e18)); // 0.03 * ($52k - $50k)

      // Margin should be proportionally reduced
      expect(updatedPosition.margin).toBeLessThan(position.margin);
    });

    it('should close position with custom price', () => {
      const closedPosition = engine.closePosition(
        position.id,
        undefined,
        BigInt(48000) * BigInt(1e18)
      );

      expect(closedPosition.realizedPnl).toBe(BigInt(-200) * BigInt(1e18)); // 0.1 * ($48k - $50k)
    });

    it('should reject closing non-existent position', () => {
      expect(() => {
        engine.closePosition('invalid-id');
      }).toThrow('Position invalid-id not found or not open');
    });

    it('should reject closing more than position size', () => {
      expect(() => {
        engine.closePosition(position.id, BigInt(2e17)); // Try to close 0.2 BTC
      }).toThrow('Close size exceeds position size');
    });

    it('should handle closing short position with profit', () => {
      // Open short position
      const shortPosition = engine.openPosition({
        trader: '0x456',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e17),
        leverage: 10
      });

      // Price decreased to $45,000 (profit for short)
      engine.updateMarkPrice('BTC-USD', BigInt(45000) * BigInt(1e18));

      const closedPosition = engine.closePosition(shortPosition.id);

      expect(closedPosition.realizedPnl).toBe(BigInt(500) * BigInt(1e18)); // Profit for short
    });
  });

  describe('Leverage Updates', () => {
    let position: PerpetualPosition;

    beforeEach(() => {
      engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
      position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });
    });

    it('should increase leverage', () => {
      const leverageUpdatedListener = jest.fn();
      engine.on('position:leverageUpdated', leverageUpdatedListener);

      const updatedPosition = engine.updateLeverage(position.id, 20);

      expect(updatedPosition.leverage).toBe(20);
      expect(updatedPosition.margin).toBe(BigInt(250) * BigInt(1e18)); // $5000 / 20

      // Liquidation price should be closer to entry price with higher leverage
      expect(updatedPosition.liquidationPrice).toBeLessThan(position.liquidationPrice);

      expect(leverageUpdatedListener).toHaveBeenCalledWith(updatedPosition);
    });

    it('should decrease leverage', () => {
      const updatedPosition = engine.updateLeverage(position.id, 5);

      expect(updatedPosition.leverage).toBe(5);
      expect(updatedPosition.margin).toBe(BigInt(1000) * BigInt(1e18)); // $5000 / 5

      // Liquidation price should be further from entry price with lower leverage
      expect(updatedPosition.liquidationPrice).toBeGreaterThan(position.liquidationPrice);
    });

    it('should reject leverage exceeding maximum', () => {
      expect(() => {
        engine.updateLeverage(position.id, 101);
      }).toThrow('Leverage 101 exceeds maximum 100');
    });

    it('should reject updating closed position', () => {
      engine.closePosition(position.id);

      expect(() => {
        engine.updateLeverage(position.id, 5);
      }).toThrow('Position pos_1 not found or not open');
    });
  });

  describe('Liquidations', () => {
    beforeEach(() => {
      engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
      engine.updateIndexPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
    });

    it('should liquidate long position when price drops below liquidation price', () => {
      const liquidatedListener = jest.fn();
      engine.on('position:liquidated', liquidatedListener);

      // Open highly leveraged long position
      const position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 100
      });

      // Price drops significantly
      engine.updateMarkPrice('BTC-USD', BigInt(49000) * BigInt(1e18));

      // Check liquidations
      engine.checkLiquidations();

      const liquidatedPosition = engine.getPosition(position.id);
      expect(liquidatedPosition?.status).toBe('LIQUIDATED');

      expect(liquidatedListener).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: position.id,
          trader: '0x123',
          market: 'BTC-USD',
          size: BigInt(1e17),
          price: BigInt(49000) * BigInt(1e18),
          liquidator: 'SYSTEM'
        })
      );

      // Insurance fund should receive remaining margin minus fee
      expect(engine.getInsuranceFund()).toBeGreaterThan(0n);
    });

    it('should liquidate short position when price rises above liquidation price', () => {
      // Open highly leveraged short position
      const position = engine.openPosition({
        trader: '0x456',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e17),
        leverage: 50
      });

      // Price rises significantly
      engine.updateMarkPrice('BTC-USD', BigInt(51000) * BigInt(1e18));

      engine.checkLiquidations();

      const liquidatedPosition = engine.getPosition(position.id);
      expect(liquidatedPosition?.status).toBe('LIQUIDATED');
    });

    it('should emit batch liquidation event for multiple liquidations', () => {
      const batchListener = jest.fn();
      engine.on('liquidations:batch', batchListener);

      // Open multiple highly leveraged positions
      const positions = [
        engine.openPosition({
          trader: '0x111',
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(1e17),
          leverage: 100
        }),
        engine.openPosition({
          trader: '0x222',
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(2e17),
          leverage: 100
        })
      ];

      // Price drops to trigger both liquidations
      engine.updateMarkPrice('BTC-USD', BigInt(48000) * BigInt(1e18));

      engine.checkLiquidations();

      expect(batchListener).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ positionId: positions[0].id }),
          expect.objectContaining({ positionId: positions[1].id })
        ])
      );
    });

    it('should not liquidate positions above maintenance margin', () => {
      // Open conservatively leveraged position
      const position = engine.openPosition({
        trader: '0x789',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 2
      });

      // Moderate price drop
      engine.updateMarkPrice('BTC-USD', BigInt(48000) * BigInt(1e18));

      engine.checkLiquidations();

      const checkedPosition = engine.getPosition(position.id);
      expect(checkedPosition?.status).toBe('OPEN');
    });
  });

  describe('Funding Rates', () => {
    beforeEach(() => {
      engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
      engine.updateIndexPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
    });

    it('should calculate positive funding rate when mark > index', () => {
      const fundingListener = jest.fn();
      engine.on('funding:processed', fundingListener);

      // Mark price premium over index
      engine.updateMarkPrice('BTC-USD', BigInt(50100) * BigInt(1e18));
      engine.updateIndexPrice('BTC-USD', BigInt(50000) * BigInt(1e18));

      // Fast forward to funding time
      const fundingRate = engine.getFundingRate('BTC-USD');
      if (fundingRate) {
        jest.setSystemTime(fundingRate.nextFundingAt);
      }

      // Process funding
      (engine as any).processFunding();

      expect(fundingListener).toHaveBeenCalledWith(
        expect.objectContaining({
          market: 'BTC-USD',
          rate: expect.any(BigInt)
        })
      );

      const updatedFunding = engine.getFundingRate('BTC-USD');
      expect(updatedFunding?.rate).toBeGreaterThan(0n);
    });

    it('should apply funding payments to positions', () => {
      // Open long and short positions
      const longPosition = engine.openPosition({
        trader: '0x111',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });

      const shortPosition = engine.openPosition({
        trader: '0x222',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e17),
        leverage: 10
      });

      // Create positive funding rate (longs pay shorts)
      engine.updateMarkPrice('BTC-USD', BigInt(50240) * BigInt(1e18)); // 0.48% premium

      // Fast forward to funding time
      const fundingRate = engine.getFundingRate('BTC-USD');
      if (fundingRate) {
        jest.setSystemTime(fundingRate.nextFundingAt);
      }

      (engine as any).processFunding();

      // Long position should have negative funding payment
      const updatedLong = engine.getPosition(longPosition.id);
      expect(updatedLong?.fundingPayment).toBeLessThan(0n);

      // Short position should have positive funding payment
      const updatedShort = engine.getPosition(shortPosition.id);
      expect(updatedShort?.fundingPayment).toBeGreaterThan(0n);
    });

    it('should cap funding rate at maximum', () => {
      // Create extreme premium
      engine.updateMarkPrice('BTC-USD', BigInt(60000) * BigInt(1e18)); // 20% premium
      engine.updateIndexPrice('BTC-USD', BigInt(50000) * BigInt(1e18));

      const fundingRate = engine.getFundingRate('BTC-USD');
      if (fundingRate) {
        jest.setSystemTime(fundingRate.nextFundingAt);
      }

      (engine as any).processFunding();

      const updatedFunding = engine.getFundingRate('BTC-USD');
      const market = engine.getMarket('BTC-USD');

      // Should be capped at max funding rate
      expect(updatedFunding?.rate).toBe(market?.maxFundingRate);
    });
  });

  describe('Price Updates', () => {
    let position: PerpetualPosition;

    beforeEach(() => {
      engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
      position = engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });
    });

    it('should update mark price and recalculate unrealized PnL', () => {
      const priceListener = jest.fn();
      engine.on('markPrice:updated', priceListener);

      engine.updateMarkPrice('BTC-USD', BigInt(52000) * BigInt(1e18));

      expect(priceListener).toHaveBeenCalledWith({
        market: 'BTC-USD',
        price: BigInt(52000) * BigInt(1e18)
      });

      const updatedPosition = engine.getPosition(position.id);
      expect(updatedPosition?.markPrice).toBe(BigInt(52000) * BigInt(1e18));
      expect(updatedPosition?.unrealizedPnl).toBe(BigInt(200) * BigInt(1e18)); // 0.1 * ($52k - $50k)
    });

    it('should update index price', () => {
      const priceListener = jest.fn();
      engine.on('indexPrice:updated', priceListener);

      engine.updateIndexPrice('BTC-USD', BigInt(51000) * BigInt(1e18));

      expect(priceListener).toHaveBeenCalledWith({
        market: 'BTC-USD',
        price: BigInt(51000) * BigInt(1e18)
      });

      expect(engine.getIndexPrice('BTC-USD')).toBe(BigInt(51000) * BigInt(1e18));
    });
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18));
      engine.updateMarkPrice('ETH-USD', BigInt(3000) * BigInt(1e18));
    });

    it('should get all positions for a trader', () => {
      // Create positions for different traders
      engine.openPosition({
        trader: '0x123',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });

      engine.openPosition({
        trader: '0x123',
        market: 'ETH-USD',
        side: 'SHORT',
        size: BigInt(1e18),
        leverage: 5
      });

      engine.openPosition({
        trader: '0x456',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(2e17),
        leverage: 20
      });

      const traderPositions = engine.getTraderPositions('0x123');

      expect(traderPositions).toHaveLength(2);
      expect(traderPositions.every(p => p.trader === '0x123')).toBe(true);
    });

    it('should get open interest for each market', () => {
      engine.openPosition({
        trader: '0x111',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17),
        leverage: 10
      });

      engine.openPosition({
        trader: '0x222',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(2e17),
        leverage: 10
      });

      engine.openPosition({
        trader: '0x333',
        market: 'ETH-USD',
        side: 'LONG',
        size: BigInt(5e18),
        leverage: 5
      });

      expect(engine.getOpenInterest('BTC-USD')).toBe(BigInt(3e17));
      expect(engine.getOpenInterest('ETH-USD')).toBe(BigInt(5e18));
    });
  });

  describe('Automatic Timers', () => {
    it('should process funding and liquidations automatically', () => {
      const processFundingSpy = jest.spyOn(engine as any, 'processFunding');
      const checkLiquidationsSpy = jest.spyOn(engine as any, 'checkLiquidations');

      // Advance timer by 1 minute
      jest.advanceTimersByTime(60000);

      expect(processFundingSpy).toHaveBeenCalled();
      expect(checkLiquidationsSpy).toHaveBeenCalled();
    });

    it('should handle errors in timer without breaking', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Make processFunding throw an error
      (engine as any).processFunding = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      // Timer should continue running despite error
      jest.advanceTimersByTime(60000);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Funding/liquidation processing error:',
        'Test error'
      );

      consoleErrorSpy.mockRestore();
    });

    it('should stop timer when requested', () => {
      const processFundingSpy = jest.spyOn(engine as any, 'processFunding');

      engine.stopFundingTimer();

      jest.advanceTimersByTime(120000); // 2 minutes

      // Should not be called after stopping
      expect(processFundingSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero mark price gracefully', () => {
      engine.updateMarkPrice('BTC-USD', 0n);

      expect(() => {
        engine.openPosition({
          trader: '0x123',
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(1e17),
          leverage: 10
        });
      }).not.toThrow();
    });

    it('should handle multiple rapid position updates', async () => {
      engine.updateMarkPrice('BTC-USD', BigInt(50000) * BigInt(1e18));

      const positions = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          Promise.resolve(engine.openPosition({
            trader: `0x${i}`,
            market: 'BTC-USD',
            side: i % 2 === 0 ? 'LONG' : 'SHORT',
            size: BigInt((i + 1) * 1e16),
            leverage: i + 1
          }))
        )
      );

      expect(positions).toHaveLength(10);
      expect(engine.getOpenInterest('BTC-USD')).toBe(
        positions.reduce((sum, p) => sum + p.size, 0n)
      );
    });
  });
});