import { expect } from 'chai';
import { ethers } from 'hardhat';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { 
  DydxIntegration,
  MockERC20,
  DEXRegistry,
  OrderBook 
} from '../typechain-types';

/**
 * DYDX Integration Tests
 * 
 * Tests integration with DYDX protocol features including:
 * - Perpetual trading
 * - Margin trading
 * - Cross-margin accounts
 * - Liquidations
 * - Funding rates
 * - Advanced order types
 */
describe('DYDX Integration', function() {
  let owner: HardhatEthersSigner;
  let trader1: HardhatEthersSigner;
  let trader2: HardhatEthersSigner;
  let liquidator: HardhatEthersSigner;
  
  let dydxIntegration: DydxIntegration;
  let dexRegistry: DEXRegistry;
  let orderBook: OrderBook;
  let usdc: MockERC20;
  let wbtc: MockERC20;
  let weth: MockERC20;

  const INITIAL_BALANCE = ethers.parseEther('100000');
  const USDC_DECIMALS = 6;
  const BTC_DECIMALS = 8;
  
  beforeEach(async () => {
    [owner, trader1, trader2, liquidator] = await ethers.getSigners();
    
    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory('MockERC20');
    usdc = await MockToken.deploy('USD Coin', 'USDC', USDC_DECIMALS);
    wbtc = await MockToken.deploy('Wrapped Bitcoin', 'WBTC', BTC_DECIMALS);
    weth = await MockToken.deploy('Wrapped Ether', 'WETH', 18);
    
    // Deploy DEX contracts
    const DEXRegistryFactory = await ethers.getContractFactory('DEXRegistry');
    dexRegistry = await DEXRegistryFactory.deploy();
    
    const OrderBookFactory = await ethers.getContractFactory('OrderBook');
    orderBook = await OrderBookFactory.deploy();
    
    // Deploy DYDX integration
    const DydxIntegrationFactory = await ethers.getContractFactory('DydxIntegration');
    dydxIntegration = await DydxIntegrationFactory.deploy(
      dexRegistry.address,
      usdc.address // USDC as settlement token
    );
    
    // Setup permissions
    await dexRegistry.addOperator(dydxIntegration.address);
    
    // Mint tokens to traders
    await usdc.mint(trader1.address, ethers.utils.parseUnits('1000000', USDC_DECIMALS));
    await usdc.mint(trader2.address, ethers.utils.parseUnits('1000000', USDC_DECIMALS));
    await wbtc.mint(trader1.address, ethers.utils.parseUnits('10', BTC_DECIMALS));
    await weth.mint(trader1.address, ethers.utils.parseEther('100'));
    
    // Approve DYDX integration
    await usdc.connect(trader1).approve(dydxIntegration.address, ethers.constants.MaxUint256);
    await usdc.connect(trader2).approve(dydxIntegration.address, ethers.constants.MaxUint256);
    await wbtc.connect(trader1).approve(dydxIntegration.address, ethers.constants.MaxUint256);
    await weth.connect(trader1).approve(dydxIntegration.address, ethers.constants.MaxUint256);
  });

  describe('Perpetual Trading', () => {
    it('should open a perpetual long position', async () => {
      const market = 'BTC-USD';
      const size = ethers.utils.parseUnits('0.1', BTC_DECIMALS); // 0.1 BTC
      const leverage = 10; // 10x leverage
      const collateral = ethers.utils.parseUnits('4500', USDC_DECIMALS); // $4,500 collateral
      
      await expect(
        dydxIntegration.connect(trader1).openPerpetualPosition(
          market,
          true, // isLong
          size,
          leverage,
          collateral
        )
      ).to.emit(dydxIntegration, 'PerpetualPositionOpened')
        .withArgs(trader1.address, market, true, size, leverage);
      
      const position = await dydxIntegration.getPosition(trader1.address, market);
      expect(position.size).to.equal(size);
      expect(position.isLong).to.be.true;
      expect(position.leverage).to.equal(leverage);
      expect(position.collateral).to.equal(collateral);
    });

    it('should open a perpetual short position', async () => {
      const market = 'ETH-USD';
      const size = ethers.utils.parseEther('1'); // 1 ETH
      const leverage = 5; // 5x leverage
      const collateral = ethers.utils.parseUnits('500', USDC_DECIMALS); // $500 collateral
      
      await expect(
        dydxIntegration.connect(trader1).openPerpetualPosition(
          market,
          false, // isShort
          size,
          leverage,
          collateral
        )
      ).to.emit(dydxIntegration, 'PerpetualPositionOpened');
      
      const position = await dydxIntegration.getPosition(trader1.address, market);
      expect(position.isLong).to.be.false;
    });

    it('should calculate P&L for perpetual positions', async () => {
      const market = 'BTC-USD';
      const size = ethers.utils.parseUnits('0.1', BTC_DECIMALS);
      const leverage = 10;
      const collateral = ethers.utils.parseUnits('4500', USDC_DECIMALS);
      const entryPrice = ethers.utils.parseUnits('45000', USDC_DECIMALS);
      
      // Open position
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        size,
        leverage,
        collateral
      );
      
      // Update mark price (5% increase)
      const newPrice = ethers.utils.parseUnits('47250', USDC_DECIMALS);
      await dydxIntegration.updateMarkPrice(market, newPrice);
      
      const pnl = await dydxIntegration.calculatePnL(trader1.address, market);
      
      // Expected P&L: 0.1 BTC * ($47,250 - $45,000) = $225
      const expectedPnl = ethers.utils.parseUnits('225', USDC_DECIMALS);
      expect(pnl).to.be.closeTo(expectedPnl, ethers.utils.parseUnits('1', USDC_DECIMALS));
    });

    it('should close perpetual position', async () => {
      const market = 'BTC-USD';
      const size = ethers.utils.parseUnits('0.1', BTC_DECIMALS);
      
      // Open position
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        size,
        10,
        ethers.utils.parseUnits('4500', USDC_DECIMALS)
      );
      
      // Close position
      await expect(
        dydxIntegration.connect(trader1).closePerpetualPosition(market)
      ).to.emit(dydxIntegration, 'PerpetualPositionClosed')
        .withArgs(trader1.address, market);
      
      const position = await dydxIntegration.getPosition(trader1.address, market);
      expect(position.size).to.equal(0);
    });
  });

  describe('Margin Trading', () => {
    it('should open a margin trade', async () => {
      const borrowAmount = ethers.utils.parseUnits('10000', USDC_DECIMALS); // Borrow $10,000
      const collateralAmount = ethers.utils.parseEther('5'); // 5 ETH collateral
      
      await expect(
        dydxIntegration.connect(trader1).openMarginTrade(
          weth.address, // collateral token
          usdc.address, // borrow token
          collateralAmount,
          borrowAmount
        )
      ).to.emit(dydxIntegration, 'MarginTradeOpened')
        .withArgs(
          trader1.address,
          weth.address,
          usdc.address,
          collateralAmount,
          borrowAmount
        );
      
      const account = await dydxIntegration.getMarginAccount(trader1.address);
      expect(account.totalBorrowed).to.equal(borrowAmount);
      expect(account.totalCollateral).to.be.gt(0);
    });

    it('should calculate margin ratio', async () => {
      // Open margin position
      await dydxIntegration.connect(trader1).openMarginTrade(
        weth.address,
        usdc.address,
        ethers.utils.parseEther('5'),
        ethers.utils.parseUnits('10000', USDC_DECIMALS)
      );
      
      const marginRatio = await dydxIntegration.getMarginRatio(trader1.address);
      
      // Margin ratio should be > 150% for healthy position
      expect(marginRatio).to.be.gte(15000); // 150.00%
    });

    it('should add margin to position', async () => {
      // Open margin position
      await dydxIntegration.connect(trader1).openMarginTrade(
        weth.address,
        usdc.address,
        ethers.utils.parseEther('5'),
        ethers.utils.parseUnits('10000', USDC_DECIMALS)
      );
      
      const additionalCollateral = ethers.utils.parseEther('2');
      
      await expect(
        dydxIntegration.connect(trader1).addMargin(
          weth.address,
          additionalCollateral
        )
      ).to.emit(dydxIntegration, 'MarginAdded')
        .withArgs(trader1.address, weth.address, additionalCollateral);
      
      const marginRatioAfter = await dydxIntegration.getMarginRatio(trader1.address);
      expect(marginRatioAfter).to.be.gt(15000);
    });

    it('should prevent opening position below initial margin', async () => {
      const insufficientCollateral = ethers.utils.parseEther('1'); // Too low
      const borrowAmount = ethers.utils.parseUnits('10000', USDC_DECIMALS);
      
      await expect(
        dydxIntegration.connect(trader1).openMarginTrade(
          weth.address,
          usdc.address,
          insufficientCollateral,
          borrowAmount
        )
      ).to.be.revertedWith('Insufficient initial margin');
    });
  });

  describe('Cross-Margin Accounts', () => {
    it('should enable cross-margin mode', async () => {
      await expect(
        dydxIntegration.connect(trader1).enableCrossMargin()
      ).to.emit(dydxIntegration, 'CrossMarginEnabled')
        .withArgs(trader1.address);
      
      const account = await dydxIntegration.getMarginAccount(trader1.address);
      expect(account.crossMarginEnabled).to.be.true;
    });

    it('should share collateral across positions in cross-margin', async () => {
      // Enable cross-margin
      await dydxIntegration.connect(trader1).enableCrossMargin();
      
      // Deposit collateral
      await dydxIntegration.connect(trader1).depositCollateral(
        weth.address,
        ethers.utils.parseEther('10')
      );
      
      // Open BTC perpetual
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'BTC-USD',
        true,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('2000', USDC_DECIMALS)
      );
      
      // Open ETH perpetual using same collateral pool
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'ETH-USD',
        false,
        ethers.utils.parseEther('1'),
        5,
        ethers.utils.parseUnits('500', USDC_DECIMALS)
      );
      
      // Both positions should be open
      const btcPosition = await dydxIntegration.getPosition(trader1.address, 'BTC-USD');
      const ethPosition = await dydxIntegration.getPosition(trader1.address, 'ETH-USD');
      
      expect(btcPosition.size).to.be.gt(0);
      expect(ethPosition.size).to.be.gt(0);
    });

    it('should calculate cross-margin health', async () => {
      await dydxIntegration.connect(trader1).enableCrossMargin();
      
      // Deposit collateral
      await dydxIntegration.connect(trader1).depositCollateral(
        usdc.address,
        ethers.utils.parseUnits('10000', USDC_DECIMALS)
      );
      
      // Open multiple positions
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'BTC-USD',
        true,
        ethers.utils.parseUnits('0.05', BTC_DECIMALS),
        10,
        ethers.utils.parseUnits('2250', USDC_DECIMALS)
      );
      
      const health = await dydxIntegration.getCrossMarginHealth(trader1.address);
      expect(health).to.be.gt(10000); // > 100%
    });
  });

  describe('Liquidations', () => {
    it('should liquidate undercollateralized position', async () => {
      // Setup position that will become undercollateralized
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'BTC-USD',
        true,
        ethers.utils.parseUnits('0.2', BTC_DECIMALS),
        20, // High leverage
        ethers.utils.parseUnits('4500', USDC_DECIMALS)
      );
      
      // Simulate price drop
      const crashPrice = ethers.utils.parseUnits('40000', USDC_DECIMALS); // -11% drop
      await dydxIntegration.updateMarkPrice('BTC-USD', crashPrice);
      
      // Check if liquidatable
      const isLiquidatable = await dydxIntegration.isLiquidatable(trader1.address);
      expect(isLiquidatable).to.be.true;
      
      // Perform liquidation
      await expect(
        dydxIntegration.connect(liquidator).liquidate(trader1.address, 'BTC-USD')
      ).to.emit(dydxIntegration, 'PositionLiquidated')
        .withArgs(trader1.address, 'BTC-USD', liquidator.address);
    });

    it('should pay liquidation bonus to liquidator', async () => {
      // Setup liquidatable position
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'ETH-USD',
        false,
        ethers.utils.parseEther('10'),
        15,
        ethers.utils.parseUnits('2000', USDC_DECIMALS)
      );
      
      // Price spike for short position
      await dydxIntegration.updateMarkPrice(
        'ETH-USD',
        ethers.utils.parseUnits('2800', USDC_DECIMALS)
      );
      
      const balanceBefore = await usdc.balanceOf(liquidator.address);
      
      await dydxIntegration.connect(liquidator).liquidate(trader1.address, 'ETH-USD');
      
      const balanceAfter = await usdc.balanceOf(liquidator.address);
      const bonus = balanceAfter.sub(balanceBefore);
      
      expect(bonus).to.be.gt(0);
    });

    it('should not liquidate healthy positions', async () => {
      // Open conservative position
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'BTC-USD',
        true,
        ethers.utils.parseUnits('0.01', BTC_DECIMALS),
        2, // Low leverage
        ethers.utils.parseUnits('2250', USDC_DECIMALS)
      );
      
      // Small price drop
      await dydxIntegration.updateMarkPrice(
        'BTC-USD',
        ethers.utils.parseUnits('44000', USDC_DECIMALS)
      );
      
      await expect(
        dydxIntegration.connect(liquidator).liquidate(trader1.address, 'BTC-USD')
      ).to.be.revertedWith('Position not liquidatable');
    });
  });

  describe('Funding Rates', () => {
    it('should calculate funding rate', async () => {
      const market = 'BTC-USD';
      
      // Set mark and index prices
      await dydxIntegration.updateMarkPrice(market, ethers.utils.parseUnits('45100', USDC_DECIMALS));
      await dydxIntegration.updateIndexPrice(market, ethers.utils.parseUnits('45000', USDC_DECIMALS));
      
      const fundingRate = await dydxIntegration.getFundingRate(market);
      
      // Positive funding rate when mark > index (longs pay shorts)
      expect(fundingRate).to.be.gt(0);
    });

    it('should apply funding payments', async () => {
      const market = 'BTC-USD';
      
      // Open long and short positions
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('9000', USDC_DECIMALS)
      );
      
      await dydxIntegration.connect(trader2).openPerpetualPosition(
        market,
        false,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('9000', USDC_DECIMALS)
      );
      
      // Set positive funding rate
      await dydxIntegration.updateMarkPrice(market, ethers.utils.parseUnits('45500', USDC_DECIMALS));
      await dydxIntegration.updateIndexPrice(market, ethers.utils.parseUnits('45000', USDC_DECIMALS));
      
      // Apply funding
      await expect(
        dydxIntegration.applyFunding(market)
      ).to.emit(dydxIntegration, 'FundingApplied');
      
      // Check that long paid and short received
      const longAccount = await dydxIntegration.getMarginAccount(trader1.address);
      const shortAccount = await dydxIntegration.getMarginAccount(trader2.address);
      
      expect(longAccount.realizedPnL).to.be.lt(0); // Negative from funding payment
      expect(shortAccount.realizedPnL).to.be.gt(0); // Positive from funding receipt
    });

    it('should track funding history', async () => {
      const market = 'BTC-USD';
      
      // Apply funding multiple times
      for (let i = 0; i < 3; i++) {
        await dydxIntegration.updateMarkPrice(
          market,
          ethers.utils.parseUnits((45000 + i * 100).toString(), USDC_DECIMALS)
        );
        await dydxIntegration.applyFunding(market);
        
        // Advance time
        await ethers.provider.send('evm_increaseTime', [3600]); // 1 hour
        await ethers.provider.send('evm_mine', []);
      }
      
      const history = await dydxIntegration.getFundingHistory(market, 10);
      expect(history.length).to.equal(3);
      
      // Verify chronological order
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp).to.be.gt(history[i-1].timestamp);
      }
    });
  });

  describe('Advanced Order Types', () => {
    it('should place stop-loss order', async () => {
      const market = 'BTC-USD';
      
      // Open position first
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('9000', USDC_DECIMALS)
      );
      
      // Place stop-loss
      const stopPrice = ethers.utils.parseUnits('43000', USDC_DECIMALS);
      
      await expect(
        dydxIntegration.connect(trader1).placeStopLoss(
          market,
          stopPrice,
          ethers.utils.parseUnits('0.1', BTC_DECIMALS)
        )
      ).to.emit(dydxIntegration, 'StopOrderPlaced')
        .withArgs(trader1.address, market, 'STOP_LOSS', stopPrice);
      
      const stopOrders = await dydxIntegration.getStopOrders(trader1.address, market);
      expect(stopOrders.length).to.equal(1);
      expect(stopOrders[0].triggerPrice).to.equal(stopPrice);
    });

    it('should place take-profit order', async () => {
      const market = 'ETH-USD';
      
      // Open position
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        ethers.utils.parseEther('2'),
        5,
        ethers.utils.parseUnits('5000', USDC_DECIMALS)
      );
      
      // Place take-profit
      const targetPrice = ethers.utils.parseUnits('2800', USDC_DECIMALS);
      
      await expect(
        dydxIntegration.connect(trader1).placeTakeProfit(
          market,
          targetPrice,
          ethers.utils.parseEther('2')
        )
      ).to.emit(dydxIntegration, 'StopOrderPlaced')
        .withArgs(trader1.address, market, 'TAKE_PROFIT', targetPrice);
    });

    it('should trigger stop-loss when price hits', async () => {
      const market = 'BTC-USD';
      
      // Setup position and stop-loss
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('9000', USDC_DECIMALS)
      );
      
      const stopPrice = ethers.utils.parseUnits('43000', USDC_DECIMALS);
      await dydxIntegration.connect(trader1).placeStopLoss(
        market,
        stopPrice,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS)
      );
      
      // Update price to trigger stop
      await dydxIntegration.updateMarkPrice(market, ethers.utils.parseUnits('42900', USDC_DECIMALS));
      
      // Trigger stop orders
      await expect(
        dydxIntegration.triggerStopOrders(market)
      ).to.emit(dydxIntegration, 'StopOrderTriggered');
      
      // Position should be closed
      const position = await dydxIntegration.getPosition(trader1.address, market);
      expect(position.size).to.equal(0);
    });

    it('should place trailing stop order', async () => {
      const market = 'BTC-USD';
      
      // Open position
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('9000', USDC_DECIMALS)
      );
      
      // Place trailing stop with 2% distance
      const trailingPercent = 200; // 2.00%
      
      await expect(
        dydxIntegration.connect(trader1).placeTrailingStop(
          market,
          trailingPercent,
          ethers.utils.parseUnits('0.1', BTC_DECIMALS)
        )
      ).to.emit(dydxIntegration, 'TrailingStopPlaced')
        .withArgs(trader1.address, market, trailingPercent);
    });

    it('should update trailing stop on favorable price movement', async () => {
      const market = 'BTC-USD';
      const initialPrice = ethers.utils.parseUnits('45000', USDC_DECIMALS);
      
      // Setup
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('9000', USDC_DECIMALS)
      );
      
      await dydxIntegration.connect(trader1).placeTrailingStop(
        market,
        200, // 2%
        ethers.utils.parseUnits('0.1', BTC_DECIMALS)
      );
      
      // Price increases
      const newPrice = ethers.utils.parseUnits('46000', USDC_DECIMALS);
      await dydxIntegration.updateMarkPrice(market, newPrice);
      await dydxIntegration.updateTrailingStops(market);
      
      const stopOrders = await dydxIntegration.getStopOrders(trader1.address, market);
      const newStopPrice = newPrice.mul(9800).div(10000); // 98% of new price
      
      expect(stopOrders[0].triggerPrice).to.be.closeTo(
        newStopPrice,
        ethers.utils.parseUnits('10', USDC_DECIMALS)
      );
    });
  });

  describe('Risk Management', () => {
    it('should enforce position limits', async () => {
      const market = 'BTC-USD';
      const maxSize = await dydxIntegration.getMaxPositionSize(market);
      
      await expect(
        dydxIntegration.connect(trader1).openPerpetualPosition(
          market,
          true,
          maxSize.add(1),
          5,
          ethers.utils.parseUnits('1000000', USDC_DECIMALS)
        )
      ).to.be.revertedWith('Position size exceeds limit');
    });

    it('should enforce max leverage', async () => {
      const market = 'BTC-USD';
      const maxLeverage = await dydxIntegration.getMaxLeverage(market);
      
      await expect(
        dydxIntegration.connect(trader1).openPerpetualPosition(
          market,
          true,
          ethers.utils.parseUnits('0.1', BTC_DECIMALS),
          maxLeverage.add(1),
          ethers.utils.parseUnits('1000', USDC_DECIMALS)
        )
      ).to.be.revertedWith('Leverage exceeds maximum');
    });

    it('should calculate portfolio risk metrics', async () => {
      // Open multiple positions
      await dydxIntegration.connect(trader1).enableCrossMargin();
      
      await dydxIntegration.connect(trader1).depositCollateral(
        usdc.address,
        ethers.utils.parseUnits('20000', USDC_DECIMALS)
      );
      
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'BTC-USD',
        true,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('9000', USDC_DECIMALS)
      );
      
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'ETH-USD',
        false,
        ethers.utils.parseEther('5'),
        5,
        ethers.utils.parseUnits('12500', USDC_DECIMALS)
      );
      
      const riskMetrics = await dydxIntegration.getPortfolioRisk(trader1.address);
      
      expect(riskMetrics.totalExposure).to.be.gt(0);
      expect(riskMetrics.marginUsage).to.be.gt(0);
      expect(riskMetrics.marginUsage).to.be.lt(10000); // < 100%
      expect(riskMetrics.liquidationPrice).to.exist;
    });
  });

  describe('Fee Structure', () => {
    it('should charge maker and taker fees', async () => {
      const market = 'BTC-USD';
      const makerFee = await dydxIntegration.getMakerFee();
      const takerFee = await dydxIntegration.getTakerFee();
      
      expect(makerFee).to.equal(10); // 0.10%
      expect(takerFee).to.equal(25); // 0.25%
    });

    it('should apply volume-based fee discounts', async () => {
      // Simulate high volume trading
      const volumeTier = ethers.utils.parseUnits('1000000', USDC_DECIMALS); // $1M
      await dydxIntegration.updateUserVolume(trader1.address, volumeTier);
      
      const userFees = await dydxIntegration.getUserFees(trader1.address);
      
      // Should have discounted fees
      expect(userFees.makerFee).to.be.lt(10);
      expect(userFees.takerFee).to.be.lt(25);
    });

    it('should track and distribute fees', async () => {
      const market = 'BTC-USD';
      
      // Execute trades to generate fees
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        market,
        true,
        ethers.utils.parseUnits('1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('90000', USDC_DECIMALS)
      );
      
      const collectedFees = await dydxIntegration.getCollectedFees();
      expect(collectedFees).to.be.gt(0);
      
      // Distribute fees
      await expect(
        dydxIntegration.connect(owner).distributeFees()
      ).to.emit(dydxIntegration, 'FeesDistributed');
    });
  });

  describe('Oracle Integration', () => {
    it('should update prices from oracle', async () => {
      const market = 'BTC-USD';
      const oraclePrice = ethers.utils.parseUnits('45123', USDC_DECIMALS);
      
      await expect(
        dydxIntegration.connect(owner).updatePriceFromOracle(market, oraclePrice)
      ).to.emit(dydxIntegration, 'PriceUpdated')
        .withArgs(market, oraclePrice);
      
      const markPrice = await dydxIntegration.getMarkPrice(market);
      expect(markPrice).to.equal(oraclePrice);
    });

    it('should reject stale oracle prices', async () => {
      const market = 'ETH-USD';
      const stalePrice = ethers.utils.parseUnits('2500', USDC_DECIMALS);
      const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
      
      await expect(
        dydxIntegration.connect(owner).updatePriceWithTimestamp(
          market,
          stalePrice,
          staleTimestamp
        )
      ).to.be.revertedWith('Oracle price too old');
    });
  });

  describe('Emergency Functions', () => {
    it('should pause trading in emergency', async () => {
      await expect(
        dydxIntegration.connect(owner).pauseTrading()
      ).to.emit(dydxIntegration, 'TradingPaused');
      
      // Trading should be blocked
      await expect(
        dydxIntegration.connect(trader1).openPerpetualPosition(
          'BTC-USD',
          true,
          ethers.utils.parseUnits('0.1', BTC_DECIMALS),
          5,
          ethers.utils.parseUnits('9000', USDC_DECIMALS)
        )
      ).to.be.revertedWith('Trading paused');
    });

    it('should allow emergency position closure', async () => {
      // Open position
      await dydxIntegration.connect(trader1).openPerpetualPosition(
        'BTC-USD',
        true,
        ethers.utils.parseUnits('0.1', BTC_DECIMALS),
        5,
        ethers.utils.parseUnits('9000', USDC_DECIMALS)
      );
      
      // Pause trading
      await dydxIntegration.connect(owner).pauseTrading();
      
      // Should still allow closing positions
      await expect(
        dydxIntegration.connect(trader1).emergencyClosePosition('BTC-USD')
      ).to.emit(dydxIntegration, 'EmergencyPositionClosed');
    });

    it('should allow emergency withdrawal', async () => {
      // Deposit collateral
      await dydxIntegration.connect(trader1).depositCollateral(
        usdc.address,
        ethers.utils.parseUnits('10000', USDC_DECIMALS)
      );
      
      // Enable emergency withdrawal
      await dydxIntegration.connect(owner).enableEmergencyWithdrawals();
      
      await expect(
        dydxIntegration.connect(trader1).emergencyWithdraw(usdc.address)
      ).to.emit(dydxIntegration, 'EmergencyWithdrawal');
      
      const balance = await usdc.balanceOf(trader1.address);
      expect(balance).to.be.gt(0);
    });
  });
});