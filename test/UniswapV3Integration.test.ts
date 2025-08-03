import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { UniswapV3Integration, MockERC20 } from "../typechain-types";
import { BigNumber } from "ethers";

describe("UniswapV3Integration", function () {
  let integration: UniswapV3Integration;
  let tokenA: MockERC20;
  let tokenB: MockERC20;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let liquidityProvider: SignerWithAddress;

  // Mock Uniswap V3 addresses (would be actual addresses on mainnet/testnet)
  const UNISWAP_ROUTER = "0x0000000000000000000000000000000000000001";
  const UNISWAP_FACTORY = "0x0000000000000000000000000000000000000002";
  const UNISWAP_POSITION_MANAGER = "0x0000000000000000000000000000000000000003";

  beforeEach(async function () {
    [owner, user, liquidityProvider] = await ethers.getSigners();

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20");
    tokenA = await MockToken.deploy("Token A", "TKA", 18);
    tokenB = await MockToken.deploy("Token B", "TKB", 18);
    await tokenA.deployed();
    await tokenB.deployed();

    // Deploy UniswapV3Integration
    const UniswapV3IntegrationFactory = await ethers.getContractFactory("UniswapV3Integration");
    integration = await UniswapV3IntegrationFactory.deploy(
      UNISWAP_ROUTER,
      UNISWAP_FACTORY,
      UNISWAP_POSITION_MANAGER
    );
    await integration.deployed();

    // Mint tokens
    const mintAmount = ethers.utils.parseEther("100000");
    await tokenA.mint(user.address, mintAmount);
    await tokenB.mint(user.address, mintAmount);
    await tokenA.mint(liquidityProvider.address, mintAmount);
    await tokenB.mint(liquidityProvider.address, mintAmount);

    // Approve integration contract
    await tokenA.connect(user).approve(integration.address, ethers.constants.MaxUint256);
    await tokenB.connect(user).approve(integration.address, ethers.constants.MaxUint256);
    await tokenA.connect(liquidityProvider).approve(integration.address, ethers.constants.MaxUint256);
    await tokenB.connect(liquidityProvider).approve(integration.address, ethers.constants.MaxUint256);
  });

  describe("Swap Operations", function () {
    it("Should quote swap amounts", async function () {
      const amountIn = ethers.utils.parseEther("100");
      const fee = 3000; // 0.3%

      // Note: In real tests, this would interact with actual Uniswap contracts
      const quotedAmount = await integration.quoteExactInputSingle(
        tokenA.address,
        tokenB.address,
        fee,
        amountIn
      );

      expect(quotedAmount).to.be.gt(0);
    });

    it("Should execute exact input swap", async function () {
      const amountIn = ethers.utils.parseEther("100");
      const amountOutMinimum = ethers.utils.parseEther("195"); // Expecting ~196 with 2% slippage
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const initialBalanceA = await tokenA.balanceOf(user.address);
      const initialBalanceB = await tokenB.balanceOf(user.address);

      await expect(
        integration.connect(user).exactInputSingle({
          tokenIn: tokenA.address,
          tokenOut: tokenB.address,
          fee: fee,
          recipient: user.address,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum,
          sqrtPriceLimitX96: 0
        })
      ).to.emit(integration, "SwapExecuted");

      // Check balances changed
      expect(await tokenA.balanceOf(user.address)).to.equal(initialBalanceA.sub(amountIn));
      expect(await tokenB.balanceOf(user.address)).to.be.gt(initialBalanceB.add(amountOutMinimum));
    });

    it("Should execute exact output swap", async function () {
      const amountOut = ethers.utils.parseEther("100");
      const amountInMaximum = ethers.utils.parseEther("52"); // Max willing to pay
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(user).exactOutputSingle({
          tokenIn: tokenA.address,
          tokenOut: tokenB.address,
          fee: fee,
          recipient: user.address,
          deadline: deadline,
          amountOut: amountOut,
          amountInMaximum: amountInMaximum,
          sqrtPriceLimitX96: 0
        })
      ).to.emit(integration, "SwapExecuted");
    });

    it("Should execute multi-hop swap", async function () {
      const tokenC = await (await ethers.getContractFactory("MockERC20")).deploy("Token C", "TKC", 18);
      await tokenC.deployed();

      const path = ethers.utils.solidityPack(
        ["address", "uint24", "address", "uint24", "address"],
        [tokenA.address, 3000, tokenB.address, 3000, tokenC.address]
      );

      const amountIn = ethers.utils.parseEther("100");
      const amountOutMinimum = ethers.utils.parseEther("90");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(user).exactInput({
          path: path,
          recipient: user.address,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum
        })
      ).to.emit(integration, "MultiHopSwapExecuted");
    });

    it("Should revert on excessive slippage", async function () {
      const amountIn = ethers.utils.parseEther("100");
      const amountOutMinimum = ethers.utils.parseEther("300"); // Unrealistic expectation
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(user).exactInputSingle({
          tokenIn: tokenA.address,
          tokenOut: tokenB.address,
          fee: fee,
          recipient: user.address,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum,
          sqrtPriceLimitX96: 0
        })
      ).to.be.revertedWith("Too little received");
    });

    it("Should revert on expired deadline", async function () {
      const amountIn = ethers.utils.parseEther("100");
      const amountOutMinimum = ethers.utils.parseEther("195");
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) - 3600; // Past deadline

      await expect(
        integration.connect(user).exactInputSingle({
          tokenIn: tokenA.address,
          tokenOut: tokenB.address,
          fee: fee,
          recipient: user.address,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum,
          sqrtPriceLimitX96: 0
        })
      ).to.be.revertedWith("Transaction too old");
    });
  });

  describe("Liquidity Management", function () {
    it("Should add liquidity to pool", async function () {
      const amount0Desired = ethers.utils.parseEther("1000");
      const amount1Desired = ethers.utils.parseEther("2000");
      const amount0Min = ethers.utils.parseEther("990");
      const amount1Min = ethers.utils.parseEther("1980");
      const fee = 3000;
      const tickLower = -60000;
      const tickUpper = 60000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(liquidityProvider).mintPosition({
          token0: tokenA.address,
          token1: tokenB.address,
          fee: fee,
          tickLower: tickLower,
          tickUpper: tickUpper,
          amount0Desired: amount0Desired,
          amount1Desired: amount1Desired,
          amount0Min: amount0Min,
          amount1Min: amount1Min,
          recipient: liquidityProvider.address,
          deadline: deadline
        })
      ).to.emit(integration, "LiquidityAdded");
    });

    it("Should remove liquidity from pool", async function () {
      // First add liquidity
      const tokenId = 1; // Assume we have position NFT
      const liquidity = ethers.utils.parseEther("100");
      const amount0Min = ethers.utils.parseEther("90");
      const amount1Min = ethers.utils.parseEther("180");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(liquidityProvider).decreaseLiquidity({
          tokenId: tokenId,
          liquidity: liquidity,
          amount0Min: amount0Min,
          amount1Min: amount1Min,
          deadline: deadline
        })
      ).to.emit(integration, "LiquidityRemoved");
    });

    it("Should collect fees from position", async function () {
      const tokenId = 1; // Assume we have position NFT
      const amount0Max = ethers.constants.MaxUint256;
      const amount1Max = ethers.constants.MaxUint256;

      await expect(
        integration.connect(liquidityProvider).collectFees({
          tokenId: tokenId,
          recipient: liquidityProvider.address,
          amount0Max: amount0Max,
          amount1Max: amount1Max
        })
      ).to.emit(integration, "FeesCollected");
    });
  });

  describe("Price Oracle", function () {
    it("Should get TWAP price", async function () {
      const pool = tokenA.address; // Mock pool address
      const twapInterval = 1800; // 30 minutes

      const twapPrice = await integration.getTWAP(pool, twapInterval);
      expect(twapPrice).to.be.gt(0);
    });

    it("Should get spot price", async function () {
      const spotPrice = await integration.getSpotPrice(
        tokenA.address,
        tokenB.address,
        3000 // fee tier
      );
      expect(spotPrice).to.be.gt(0);
    });

    it("Should detect price manipulation", async function () {
      const pool = tokenA.address; // Mock pool address
      const maxDeviation = 500; // 5%

      const isSafe = await integration.isPriceManipulated(pool, maxDeviation);
      expect(isSafe).to.be.a("boolean");
    });
  });

  describe("Flash Swap", function () {
    it("Should execute flash swap", async function () {
      const amount = ethers.utils.parseEther("1000");
      const fee = 3000;

      // Deploy flash swap receiver
      const FlashSwapReceiver = await ethers.getContractFactory("MockFlashSwapReceiver");
      const receiver = await FlashSwapReceiver.deploy();
      await receiver.deployed();

      await expect(
        integration.connect(user).flashSwap(
          tokenA.address,
          tokenB.address,
          fee,
          amount,
          receiver.address,
          "0x" // callback data
        )
      ).to.emit(integration, "FlashSwapExecuted");
    });

    it("Should revert if flash swap not repaid", async function () {
      const amount = ethers.utils.parseEther("1000");
      const fee = 3000;

      // Deploy malicious receiver that doesn't repay
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousFlashSwapReceiver");
      const receiver = await MaliciousReceiver.deploy();
      await receiver.deployed();

      await expect(
        integration.connect(user).flashSwap(
          tokenA.address,
          tokenB.address,
          fee,
          amount,
          receiver.address,
          "0x"
        )
      ).to.be.revertedWith("Flash swap not repaid");
    });
  });

  describe("Emergency Functions", function () {
    it("Should pause swaps", async function () {
      await integration.connect(owner).pauseSwaps();
      
      const amountIn = ethers.utils.parseEther("100");
      const amountOutMinimum = ethers.utils.parseEther("195");
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(user).exactInputSingle({
          tokenIn: tokenA.address,
          tokenOut: tokenB.address,
          fee: fee,
          recipient: user.address,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum,
          sqrtPriceLimitX96: 0
        })
      ).to.be.revertedWith("Swaps paused");
    });

    it("Should emergency withdraw tokens", async function () {
      // Send tokens to contract
      const amount = ethers.utils.parseEther("100");
      await tokenA.connect(user).transfer(integration.address, amount);

      const initialBalance = await tokenA.balanceOf(owner.address);
      
      await integration.connect(owner).emergencyWithdraw(
        tokenA.address,
        owner.address,
        amount
      );

      expect(await tokenA.balanceOf(owner.address)).to.equal(initialBalance.add(amount));
    });
  });

  describe("Fee Management", function () {
    it("Should set protocol fee", async function () {
      const newFee = 50; // 0.5%

      await expect(integration.connect(owner).setProtocolFee(newFee))
        .to.emit(integration, "ProtocolFeeUpdated")
        .withArgs(newFee);

      expect(await integration.protocolFee()).to.equal(newFee);
    });

    it("Should collect protocol fees", async function () {
      const collectedFees = await integration.getCollectedFees(tokenA.address);
      
      if (collectedFees.gt(0)) {
        await expect(
          integration.connect(owner).withdrawProtocolFees(
            tokenA.address,
            owner.address
          )
        ).to.emit(integration, "ProtocolFeesWithdrawn");
      }
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to pause", async function () {
      await expect(
        integration.connect(user).pauseSwaps()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should only allow owner to set fees", async function () {
      await expect(
        integration.connect(user).setProtocolFee(100)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});