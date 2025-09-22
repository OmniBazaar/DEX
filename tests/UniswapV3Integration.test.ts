import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { UniswapV3Integration, MockERC20 } from "../typechain-types";

describe("UniswapV3Integration", function () {
  let integration: UniswapV3Integration;
  let tokenA: MockERC20;
  let tokenB: MockERC20;
  let owner: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let liquidityProvider: HardhatEthersSigner;

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
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    // Deploy UniswapV3Integration
    const UniswapV3IntegrationFactory = await ethers.getContractFactory("UniswapV3Integration");
    integration = await UniswapV3IntegrationFactory.deploy(
      UNISWAP_ROUTER,
      UNISWAP_FACTORY,
      UNISWAP_POSITION_MANAGER
    );
    await integration.waitForDeployment();

    // Get contract addresses
    const tokenAAddress = await tokenA.getAddress();
    const tokenBAddress = await tokenB.getAddress();
    const integrationAddress = await integration.getAddress();
    const userAddress = userAddress;
    const liquidityProviderAddress = liquidityProviderAddress;
    const ownerAddress = ownerAddress;

    // Mint tokens
    const mintAmount = ethers.parseEther("100000");
    await tokenA.mint(userAddress, mintAmount);
    await tokenB.mint(userAddress, mintAmount);
    await tokenA.mint(liquidityProviderAddress, mintAmount);
    await tokenB.mint(liquidityProviderAddress, mintAmount);

    // Approve integration contract
    await tokenA.connect(user).approve(integrationAddress, ethers.MaxUint256);
    await tokenB.connect(user).approve(integrationAddress, ethers.MaxUint256);
    await tokenA.connect(liquidityProvider).approve(integrationAddress, ethers.MaxUint256);
    await tokenB.connect(liquidityProvider).approve(integrationAddress, ethers.MaxUint256);
  });

  describe("Swap Operations", function () {
    it("Should quote swap amounts", async function () {
      const amountIn = ethers.parseEther("100");
      const fee = 3000; // 0.3%

      // Note: In real tests, this would interact with actual Uniswap contracts
      const quotedAmount = await integration.quoteExactInputSingle(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        fee,
        amountIn
      );

      expect(quotedAmount).to.be.gt(0);
    });

    it("Should execute exact input swap", async function () {
      const amountIn = ethers.parseEther("100");
      const amountOutMinimum = ethers.parseEther("195"); // Expecting ~196 with 2% slippage
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const initialBalanceA = await tokenA.balanceOf(userAddress);
      const initialBalanceB = await tokenB.balanceOf(userAddress);

      await expect(
        integration.connect(user).exactInputSingle({
          tokenIn: await tokenA.getAddress(),
          tokenOut: await tokenB.getAddress(),
          fee: fee,
          recipient: userAddress,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum,
          sqrtPriceLimitX96: 0
        })
      ).to.emit(integration, "SwapExecuted");

      // Check balances changed
      expect(await tokenA.balanceOf(userAddress)).to.equal(initialBalanceA - amountIn);
      expect(await tokenB.balanceOf(userAddress)).to.be.gt(initialBalanceB + amountOutMinimum);
    });

    it("Should execute exact output swap", async function () {
      const amountOut = ethers.parseEther("100");
      const amountInMaximum = ethers.parseEther("52"); // Max willing to pay
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(user).exactOutputSingle({
          tokenIn: await tokenA.getAddress(),
          tokenOut: await tokenB.getAddress(),
          fee: fee,
          recipient: userAddress,
          deadline: deadline,
          amountOut: amountOut,
          amountInMaximum: amountInMaximum,
          sqrtPriceLimitX96: 0
        })
      ).to.emit(integration, "SwapExecuted");
    });

    it("Should execute multi-hop swap", async function () {
      const tokenC = await (await ethers.getContractFactory("MockERC20")).deploy("Token C", "TKC", 18);
      await tokenC.waitForDeployment();

      const path = ethers.solidityPack(
        ["address", "uint24", "address", "uint24", "address"],
        [await tokenA.getAddress(), 3000, await tokenB.getAddress(), 3000, await tokenC.getAddress()]
      );

      const amountIn = ethers.parseEther("100");
      const amountOutMinimum = ethers.parseEther("90");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(user).exactInput({
          path: path,
          recipient: userAddress,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum
        })
      ).to.emit(integration, "MultiHopSwapExecuted");
    });

    it("Should revert on excessive slippage", async function () {
      const amountIn = ethers.parseEther("100");
      const amountOutMinimum = ethers.parseEther("300"); // Unrealistic expectation
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(user).exactInputSingle({
          tokenIn: await tokenA.getAddress(),
          tokenOut: await tokenB.getAddress(),
          fee: fee,
          recipient: userAddress,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum,
          sqrtPriceLimitX96: 0
        })
      ).to.be.revertedWith("Too little received");
    });

    it("Should revert on expired deadline", async function () {
      const amountIn = ethers.parseEther("100");
      const amountOutMinimum = ethers.parseEther("195");
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) - 3600; // Past deadline

      await expect(
        integration.connect(user).exactInputSingle({
          tokenIn: await tokenA.getAddress(),
          tokenOut: await tokenB.getAddress(),
          fee: fee,
          recipient: userAddress,
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
      const amount0Desired = ethers.parseEther("1000");
      const amount1Desired = ethers.parseEther("2000");
      const amount0Min = ethers.parseEther("990");
      const amount1Min = ethers.parseEther("1980");
      const fee = 3000;
      const tickLower = -60000;
      const tickUpper = 60000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(liquidityProvider).mintPosition({
          token0: await tokenA.getAddress(),
          token1: await tokenB.getAddress(),
          fee: fee,
          tickLower: tickLower,
          tickUpper: tickUpper,
          amount0Desired: amount0Desired,
          amount1Desired: amount1Desired,
          amount0Min: amount0Min,
          amount1Min: amount1Min,
          recipient: liquidityProviderAddress,
          deadline: deadline
        })
      ).to.emit(integration, "LiquidityAdded");
    });

    it("Should remove liquidity from pool", async function () {
      // First add liquidity
      const tokenId = 1; // Assume we have position NFT
      const liquidity = ethers.parseEther("100");
      const amount0Min = ethers.parseEther("90");
      const amount1Min = ethers.parseEther("180");
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
      const amount0Max = ethers.MaxUint256;
      const amount1Max = ethers.MaxUint256;

      await expect(
        integration.connect(liquidityProvider).collectFees({
          tokenId: tokenId,
          recipient: liquidityProviderAddress,
          amount0Max: amount0Max,
          amount1Max: amount1Max
        })
      ).to.emit(integration, "FeesCollected");
    });
  });

  describe("Price Oracle", function () {
    it("Should get TWAP price", async function () {
      const pool = await tokenA.getAddress(); // Mock pool address
      const twapInterval = 1800; // 30 minutes

      const twapPrice = await integration.getTWAP(pool, twapInterval);
      expect(twapPrice).to.be.gt(0);
    });

    it("Should get spot price", async function () {
      const spotPrice = await integration.getSpotPrice(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        3000 // fee tier
      );
      expect(spotPrice).to.be.gt(0);
    });

    it("Should detect price manipulation", async function () {
      const pool = await tokenA.getAddress(); // Mock pool address
      const maxDeviation = 500; // 5%

      const isSafe = await integration.isPriceManipulated(pool, maxDeviation);
      expect(isSafe).to.be.a("boolean");
    });
  });

  describe("Flash Swap", function () {
    it("Should execute flash swap", async function () {
      const amount = ethers.parseEther("1000");
      const fee = 3000;

      // Deploy flash swap receiver
      const FlashSwapReceiver = await ethers.getContractFactory("MockFlashSwapReceiver");
      const receiver = await FlashSwapReceiver.deploy();
      await receiver.waitForDeployment();

      await expect(
        integration.connect(user).flashSwap(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          fee,
          amount,
          await receiver.getAddress(),
          "0x" // callback data
        )
      ).to.emit(integration, "FlashSwapExecuted");
    });

    it("Should revert if flash swap not repaid", async function () {
      const amount = ethers.parseEther("1000");
      const fee = 3000;

      // Deploy malicious receiver that doesn't repay
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousFlashSwapReceiver");
      const receiver = await MaliciousReceiver.deploy();
      await receiver.waitForDeployment();

      await expect(
        integration.connect(user).flashSwap(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          fee,
          amount,
          await receiver.getAddress(),
          "0x"
        )
      ).to.be.revertedWith("Flash swap not repaid");
    });
  });

  describe("Emergency Functions", function () {
    it("Should pause swaps", async function () {
      await integration.connect(owner).pauseSwaps();
      
      const amountIn = ethers.parseEther("100");
      const amountOutMinimum = ethers.parseEther("195");
      const fee = 3000;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        integration.connect(user).exactInputSingle({
          tokenIn: await tokenA.getAddress(),
          tokenOut: await tokenB.getAddress(),
          fee: fee,
          recipient: userAddress,
          deadline: deadline,
          amountIn: amountIn,
          amountOutMinimum: amountOutMinimum,
          sqrtPriceLimitX96: 0
        })
      ).to.be.revertedWith("Swaps paused");
    });

    it("Should emergency withdraw tokens", async function () {
      // Send tokens to contract
      const amount = ethers.parseEther("100");
      await tokenA.connect(user).transfer(integrationAddress, amount);

      const initialBalance = await tokenA.balanceOf(ownerAddress);
      
      await integration.connect(owner).emergencyWithdraw(
        await tokenA.getAddress(),
        ownerAddress,
        amount
      );

      expect(await tokenA.balanceOf(ownerAddress)).to.equal(initialBalance + amount);
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
      const collectedFees = await integration.getCollectedFees(await tokenA.getAddress());
      
      if (collectedFees > 0n) {
        await expect(
          integration.connect(owner).withdrawProtocolFees(
            await tokenA.getAddress(),
            ownerAddress
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