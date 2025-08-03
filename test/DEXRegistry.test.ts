import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DEXRegistry, PairFactory, FeeCollector } from "../typechain-types";

describe("DEXRegistry", function () {
  let dexRegistry: DEXRegistry;
  let pairFactory: PairFactory;
  let feeCollector: FeeCollector;
  let owner: SignerWithAddress;
  let operator: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, operator, user1, user2] = await ethers.getSigners();

    // Deploy contracts
    const FeeCollectorFactory = await ethers.getContractFactory("FeeCollector");
    feeCollector = await FeeCollectorFactory.deploy();
    await feeCollector.deployed();

    const PairFactoryFactory = await ethers.getContractFactory("PairFactory");
    pairFactory = await PairFactoryFactory.deploy();
    await pairFactory.deployed();

    const DEXRegistryFactory = await ethers.getContractFactory("DEXRegistry");
    dexRegistry = await DEXRegistryFactory.deploy();
    await dexRegistry.deployed();

    // Initialize contracts
    await dexRegistry.initialize(pairFactory.address, feeCollector.address);
  });

  describe("Initialization", function () {
    it("Should initialize with correct addresses", async function () {
      expect(await dexRegistry.pairFactory()).to.equal(pairFactory.address);
      expect(await dexRegistry.feeCollector()).to.equal(feeCollector.address);
      expect(await dexRegistry.owner()).to.equal(owner.address);
    });

    it("Should not allow re-initialization", async function () {
      await expect(
        dexRegistry.initialize(pairFactory.address, feeCollector.address)
      ).to.be.revertedWith("Already initialized");
    });
  });

  describe("Operator Management", function () {
    it("Should allow owner to add operators", async function () {
      await expect(dexRegistry.addOperator(operator.address))
        .to.emit(dexRegistry, "OperatorAdded")
        .withArgs(operator.address);
      
      expect(await dexRegistry.operators(operator.address)).to.be.true;
    });

    it("Should allow owner to remove operators", async function () {
      await dexRegistry.addOperator(operator.address);
      
      await expect(dexRegistry.removeOperator(operator.address))
        .to.emit(dexRegistry, "OperatorRemoved")
        .withArgs(operator.address);
      
      expect(await dexRegistry.operators(operator.address)).to.be.false;
    });

    it("Should not allow non-owner to manage operators", async function () {
      await expect(
        dexRegistry.connect(user1).addOperator(operator.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Trading Pair Registration", function () {
    let token1: string;
    let token2: string;

    beforeEach(async function () {
      // Deploy mock tokens
      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy("Token A", "TKA", 18);
      const tokenB = await MockToken.deploy("Token B", "TKB", 18);
      
      token1 = tokenA.address;
      token2 = tokenB.address;
    });

    it("Should register new trading pair", async function () {
      await dexRegistry.addOperator(operator.address);
      
      await expect(
        dexRegistry.connect(operator).registerTradingPair(token1, token2)
      ).to.emit(dexRegistry, "TradingPairRegistered");
      
      const pairs = await dexRegistry.getAllTradingPairs();
      expect(pairs.length).to.equal(1);
    });

    it("Should not allow duplicate pairs", async function () {
      await dexRegistry.addOperator(operator.address);
      await dexRegistry.connect(operator).registerTradingPair(token1, token2);
      
      await expect(
        dexRegistry.connect(operator).registerTradingPair(token1, token2)
      ).to.be.revertedWith("Pair already exists");
    });

    it("Should not allow same token pairs", async function () {
      await dexRegistry.addOperator(operator.address);
      
      await expect(
        dexRegistry.connect(operator).registerTradingPair(token1, token1)
      ).to.be.revertedWith("Tokens must be different");
    });
  });

  describe("Fee Management", function () {
    it("Should update maker fee", async function () {
      const newFee = 10; // 0.1%
      
      await expect(dexRegistry.setMakerFee(newFee))
        .to.emit(dexRegistry, "MakerFeeUpdated")
        .withArgs(newFee);
      
      expect(await dexRegistry.makerFee()).to.equal(newFee);
    });

    it("Should update taker fee", async function () {
      const newFee = 25; // 0.25%
      
      await expect(dexRegistry.setTakerFee(newFee))
        .to.emit(dexRegistry, "TakerFeeUpdated")
        .withArgs(newFee);
      
      expect(await dexRegistry.takerFee()).to.equal(newFee);
    });

    it("Should enforce maximum fee limit", async function () {
      const maxFee = 1000; // 10%
      
      await expect(
        dexRegistry.setMakerFee(maxFee + 1)
      ).to.be.revertedWith("Fee too high");
    });
  });

  describe("Emergency Functions", function () {
    it("Should pause and unpause trading", async function () {
      await expect(dexRegistry.pauseTrading())
        .to.emit(dexRegistry, "TradingPaused");
      
      expect(await dexRegistry.tradingPaused()).to.be.true;
      
      await expect(dexRegistry.resumeTrading())
        .to.emit(dexRegistry, "TradingResumed");
      
      expect(await dexRegistry.tradingPaused()).to.be.false;
    });

    it("Should only allow owner to pause", async function () {
      await expect(
        dexRegistry.connect(user1).pauseTrading()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("View Functions", function () {
    it("Should return correct fee configuration", async function () {
      const config = await dexRegistry.getFeeConfiguration();
      expect(config.makerFee).to.equal(10); // Default 0.1%
      expect(config.takerFee).to.equal(20); // Default 0.2%
      expect(config.feeCollector).to.equal(feeCollector.address);
    });

    it("Should check if address is operator", async function () {
      expect(await dexRegistry.isOperator(operator.address)).to.be.false;
      
      await dexRegistry.addOperator(operator.address);
      expect(await dexRegistry.isOperator(operator.address)).to.be.true;
    });
  });
});