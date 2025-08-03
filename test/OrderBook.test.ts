import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { OrderBook, MockERC20 } from "../typechain-types";
import { BigNumber } from "ethers";

describe("OrderBook", function () {
  let orderBook: OrderBook;
  let tokenA: MockERC20;
  let tokenB: MockERC20;
  let owner: SignerWithAddress;
  let maker: SignerWithAddress;
  let taker: SignerWithAddress;
  let feeCollector: SignerWithAddress;

  const MAKER_FEE = 10; // 0.1%
  const TAKER_FEE = 20; // 0.2%
  const FEE_DENOMINATOR = 10000;

  beforeEach(async function () {
    [owner, maker, taker, feeCollector] = await ethers.getSigners();

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20");
    tokenA = await MockToken.deploy("Token A", "TKA", 18);
    tokenB = await MockToken.deploy("Token B", "TKB", 18);
    await tokenA.deployed();
    await tokenB.deployed();

    // Deploy OrderBook
    const OrderBookFactory = await ethers.getContractFactory("OrderBook");
    orderBook = await OrderBookFactory.deploy();
    await orderBook.deployed();

    // Initialize OrderBook
    await orderBook.initialize(
      tokenA.address,
      tokenB.address,
      feeCollector.address,
      MAKER_FEE,
      TAKER_FEE
    );

    // Mint tokens to users
    const mintAmount = ethers.utils.parseEther("10000");
    await tokenA.mint(maker.address, mintAmount);
    await tokenB.mint(maker.address, mintAmount);
    await tokenA.mint(taker.address, mintAmount);
    await tokenB.mint(taker.address, mintAmount);

    // Approve OrderBook to spend tokens
    await tokenA.connect(maker).approve(orderBook.address, ethers.constants.MaxUint256);
    await tokenB.connect(maker).approve(orderBook.address, ethers.constants.MaxUint256);
    await tokenA.connect(taker).approve(orderBook.address, ethers.constants.MaxUint256);
    await tokenB.connect(taker).approve(orderBook.address, ethers.constants.MaxUint256);
  });

  describe("Order Placement", function () {
    it("Should place a buy limit order", async function () {
      const price = ethers.utils.parseEther("2000"); // 1 TokenA = 2000 TokenB
      const amount = ethers.utils.parseEther("1");

      await expect(
        orderBook.connect(maker).placeLimitOrder(
          true, // isBuy
          price,
          amount
        )
      ).to.emit(orderBook, "OrderPlaced")
        .withArgs(
          1, // orderId
          maker.address,
          true, // isBuy
          price,
          amount,
          0 // filled
        );

      const order = await orderBook.getOrder(1);
      expect(order.maker).to.equal(maker.address);
      expect(order.isBuy).to.be.true;
      expect(order.price).to.equal(price);
      expect(order.amount).to.equal(amount);
      expect(order.filled).to.equal(0);
      expect(order.status).to.equal(1); // Open
    });

    it("Should place a sell limit order", async function () {
      const price = ethers.utils.parseEther("2100");
      const amount = ethers.utils.parseEther("0.5");

      await expect(
        orderBook.connect(maker).placeLimitOrder(
          false, // isSell
          price,
          amount
        )
      ).to.emit(orderBook, "OrderPlaced");

      const order = await orderBook.getOrder(1);
      expect(order.isBuy).to.be.false;
    });

    it("Should reject order with zero amount", async function () {
      const price = ethers.utils.parseEther("2000");
      
      await expect(
        orderBook.connect(maker).placeLimitOrder(true, price, 0)
      ).to.be.revertedWith("Invalid amount");
    });

    it("Should reject order with zero price", async function () {
      const amount = ethers.utils.parseEther("1");
      
      await expect(
        orderBook.connect(maker).placeLimitOrder(true, 0, amount)
      ).to.be.revertedWith("Invalid price");
    });
  });

  describe("Order Matching", function () {
    it("Should match buy and sell orders at same price", async function () {
      const price = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");

      // Place buy order
      await orderBook.connect(maker).placeLimitOrder(true, price, amount);

      // Place matching sell order
      await expect(
        orderBook.connect(taker).placeLimitOrder(false, price, amount)
      ).to.emit(orderBook, "OrderMatched")
        .withArgs(
          1, // buyOrderId
          2, // sellOrderId
          price,
          amount
        );

      // Check orders are filled
      const buyOrder = await orderBook.getOrder(1);
      const sellOrder = await orderBook.getOrder(2);
      
      expect(buyOrder.filled).to.equal(amount);
      expect(buyOrder.status).to.equal(2); // Filled
      expect(sellOrder.filled).to.equal(amount);
      expect(sellOrder.status).to.equal(2); // Filled
    });

    it("Should partially fill orders", async function () {
      const price = ethers.utils.parseEther("2000");
      const buyAmount = ethers.utils.parseEther("2");
      const sellAmount = ethers.utils.parseEther("1");

      // Place large buy order
      await orderBook.connect(maker).placeLimitOrder(true, price, buyAmount);

      // Place smaller sell order
      await orderBook.connect(taker).placeLimitOrder(false, price, sellAmount);

      const buyOrder = await orderBook.getOrder(1);
      expect(buyOrder.filled).to.equal(sellAmount);
      expect(buyOrder.status).to.equal(1); // Still Open
    });

    it("Should match orders with price improvement", async function () {
      const buyPrice = ethers.utils.parseEther("2100");
      const sellPrice = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");

      // Place buy order at higher price
      await orderBook.connect(maker).placeLimitOrder(true, buyPrice, amount);

      // Place sell order at lower price (should match at buy price)
      await expect(
        orderBook.connect(taker).placeLimitOrder(false, sellPrice, amount)
      ).to.emit(orderBook, "OrderMatched")
        .withArgs(1, 2, buyPrice, amount); // Matches at maker price
    });
  });

  describe("Market Orders", function () {
    beforeEach(async function () {
      // Create order book depth
      const basePrice = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");

      // Buy orders
      await orderBook.connect(maker).placeLimitOrder(true, basePrice.sub(ethers.utils.parseEther("20")), amount);
      await orderBook.connect(maker).placeLimitOrder(true, basePrice.sub(ethers.utils.parseEther("10")), amount);
      await orderBook.connect(maker).placeLimitOrder(true, basePrice, amount);

      // Sell orders
      await orderBook.connect(maker).placeLimitOrder(false, basePrice.add(ethers.utils.parseEther("10")), amount);
      await orderBook.connect(maker).placeLimitOrder(false, basePrice.add(ethers.utils.parseEther("20")), amount);
    });

    it("Should execute market buy order", async function () {
      const amount = ethers.utils.parseEther("1.5");

      await expect(
        orderBook.connect(taker).placeMarketOrder(true, amount)
      ).to.emit(orderBook, "MarketOrderExecuted");

      // Should have consumed 1.5 ETH worth of sell orders
    });

    it("Should execute market sell order", async function () {
      const amount = ethers.utils.parseEther("2");

      await expect(
        orderBook.connect(taker).placeMarketOrder(false, amount)
      ).to.emit(orderBook, "MarketOrderExecuted");
    });

    it("Should reject market order with insufficient liquidity", async function () {
      const largeAmount = ethers.utils.parseEther("100");

      await expect(
        orderBook.connect(taker).placeMarketOrder(true, largeAmount)
      ).to.be.revertedWith("Insufficient liquidity");
    });
  });

  describe("Order Cancellation", function () {
    it("Should cancel own order", async function () {
      const price = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");

      await orderBook.connect(maker).placeLimitOrder(true, price, amount);

      await expect(orderBook.connect(maker).cancelOrder(1))
        .to.emit(orderBook, "OrderCancelled")
        .withArgs(1, maker.address);

      const order = await orderBook.getOrder(1);
      expect(order.status).to.equal(3); // Cancelled
    });

    it("Should not cancel other user's order", async function () {
      const price = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");

      await orderBook.connect(maker).placeLimitOrder(true, price, amount);

      await expect(
        orderBook.connect(taker).cancelOrder(1)
      ).to.be.revertedWith("Not order owner");
    });

    it("Should not cancel already filled order", async function () {
      const price = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");

      // Place and fill orders
      await orderBook.connect(maker).placeLimitOrder(true, price, amount);
      await orderBook.connect(taker).placeLimitOrder(false, price, amount);

      await expect(
        orderBook.connect(maker).cancelOrder(1)
      ).to.be.revertedWith("Order not open");
    });
  });

  describe("Fee Collection", function () {
    it("Should collect correct maker and taker fees", async function () {
      const price = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");

      const initialFeeBalance = await tokenB.balanceOf(feeCollector.address);

      // Place and match orders
      await orderBook.connect(maker).placeLimitOrder(true, price, amount);
      await orderBook.connect(taker).placeLimitOrder(false, price, amount);

      // Calculate expected fees
      const tradeValue = price.mul(amount).div(ethers.utils.parseEther("1"));
      const makerFeeAmount = tradeValue.mul(MAKER_FEE).div(FEE_DENOMINATOR);
      const takerFeeAmount = tradeValue.mul(TAKER_FEE).div(FEE_DENOMINATOR);
      const totalFees = makerFeeAmount.add(takerFeeAmount);

      const finalFeeBalance = await tokenB.balanceOf(feeCollector.address);
      expect(finalFeeBalance.sub(initialFeeBalance)).to.equal(totalFees);
    });
  });

  describe("Order Book Queries", function () {
    beforeEach(async function () {
      // Add multiple orders
      const basePrice = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");

      for (let i = 0; i < 5; i++) {
        await orderBook.connect(maker).placeLimitOrder(
          true,
          basePrice.sub(ethers.utils.parseEther((i * 10).toString())),
          amount
        );
        await orderBook.connect(maker).placeLimitOrder(
          false,
          basePrice.add(ethers.utils.parseEther(((i + 1) * 10).toString())),
          amount
        );
      }
    });

    it("Should get order book depth", async function () {
      const depth = await orderBook.getOrderBookDepth(10);
      
      expect(depth.buyOrders.length).to.equal(5);
      expect(depth.sellOrders.length).to.equal(5);
      
      // Verify buy orders are sorted by price descending
      for (let i = 1; i < depth.buyOrders.length; i++) {
        expect(depth.buyOrders[i - 1].price).to.be.gt(depth.buyOrders[i].price);
      }
      
      // Verify sell orders are sorted by price ascending
      for (let i = 1; i < depth.sellOrders.length; i++) {
        expect(depth.sellOrders[i - 1].price).to.be.lt(depth.sellOrders[i].price);
      }
    });

    it("Should get user's open orders", async function () {
      const userOrders = await orderBook.getUserOrders(maker.address);
      expect(userOrders.length).to.equal(10); // 5 buy + 5 sell
    });

    it("Should get best bid and ask", async function () {
      const bestBid = await orderBook.getBestBid();
      const bestAsk = await orderBook.getBestAsk();
      
      expect(bestBid.price).to.equal(ethers.utils.parseEther("2000"));
      expect(bestAsk.price).to.equal(ethers.utils.parseEther("2010"));
    });
  });

  describe("Stop Orders", function () {
    it("Should place stop-loss order", async function () {
      const stopPrice = ethers.utils.parseEther("1900");
      const limitPrice = ethers.utils.parseEther("1890");
      const amount = ethers.utils.parseEther("1");

      await expect(
        orderBook.connect(maker).placeStopOrder(
          false, // sell
          stopPrice,
          limitPrice,
          amount
        )
      ).to.emit(orderBook, "StopOrderPlaced");

      const stopOrder = await orderBook.getStopOrder(1);
      expect(stopOrder.stopPrice).to.equal(stopPrice);
      expect(stopOrder.limitPrice).to.equal(limitPrice);
      expect(stopOrder.triggered).to.be.false;
    });

    it("Should trigger stop order when price crosses threshold", async function () {
      const stopPrice = ethers.utils.parseEther("1900");
      const limitPrice = ethers.utils.parseEther("1890");
      const amount = ethers.utils.parseEther("1");

      // Place stop-loss sell order
      await orderBook.connect(maker).placeStopOrder(false, stopPrice, limitPrice, amount);

      // Simulate price drop by executing a trade below stop price
      await orderBook.connect(taker).placeLimitOrder(true, ethers.utils.parseEther("1895"), amount);
      await orderBook.connect(maker).placeLimitOrder(false, ethers.utils.parseEther("1895"), amount);

      // Check stop order was triggered
      const stopOrder = await orderBook.getStopOrder(1);
      expect(stopOrder.triggered).to.be.true;
    });
  });

  describe("Emergency Functions", function () {
    it("Should pause and unpause trading", async function () {
      await orderBook.connect(owner).pauseTrading();
      
      const price = ethers.utils.parseEther("2000");
      const amount = ethers.utils.parseEther("1");
      
      await expect(
        orderBook.connect(maker).placeLimitOrder(true, price, amount)
      ).to.be.revertedWith("Trading paused");
      
      await orderBook.connect(owner).resumeTrading();
      
      // Should work after resuming
      await expect(
        orderBook.connect(maker).placeLimitOrder(true, price, amount)
      ).to.emit(orderBook, "OrderPlaced");
    });
  });
});