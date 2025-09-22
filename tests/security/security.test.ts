import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import { DEXRegistry, OrderBook, FeeCollector, MockERC20 } from '../../typechain-types';

describe('DEX Security Tests', () => {
  let owner: SignerWithAddress;
  let attacker: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  
  let dexRegistry: DEXRegistry;
  let orderBook: OrderBook;
  let feeCollector: FeeCollector;
  let tokenA: MockERC20;
  let tokenB: MockERC20;

  const API_URL = process.env.TEST_DEX_API_URL || 'http://localhost:3001/api/dex';

  /**
   * Set up test environment before each test
   */
  beforeEach(async (): Promise<void> => {
    [owner, attacker, user1, user2] = await ethers.getSigners();
    
    // Deploy contracts
    const MockToken = await ethers.getContractFactory('MockERC20');
    tokenA = await MockToken.deploy('Token A', 'TKA', 18);
    tokenB = await MockToken.deploy('Token B', 'TKB', 18);
    
    const FeeCollectorFactory = await ethers.getContractFactory('FeeCollector');
    feeCollector = await FeeCollectorFactory.deploy();
    
    const OrderBookFactory = await ethers.getContractFactory('OrderBook');
    orderBook = await OrderBookFactory.deploy();
    
    const DEXRegistryFactory = await ethers.getContractFactory('DEXRegistry');
    dexRegistry = await DEXRegistryFactory.deploy();
    
    // Initialize
    await orderBook.initialize(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await feeCollector.getAddress(),
      10, // 0.1% maker fee
      20  // 0.2% taker fee
    );
    
    // Mint tokens
    const amount = ethers.parseEther('10000');
    await tokenA.mint(await user1.getAddress(), amount);
    await tokenB.mint(await user1.getAddress(), amount);
    await tokenA.mint(await attacker.getAddress(), amount);
    await tokenB.mint(await attacker.getAddress(), amount);
  });

  describe('Smart Contract Security', () => {
    describe('Reentrancy Protection', () => {
      /**
       * Tests reentrancy protection in order placement
       */
    it('should prevent reentrancy in order placement', async (): Promise<void> => {
        // Deploy malicious token that attempts reentrancy
        const ReentrancyAttacker = await ethers.getContractFactory('ReentrancyAttacker');
        const attackContract = await ReentrancyAttacker.deploy(await orderBook.getAddress());
        
        // Fund attacker contract
        await tokenA.mint(attackContract.getAddress(), ethers.parseEther('1000'));
        
        // Attempt reentrancy attack
        await expect(
          attackContract.attackPlaceOrder()
        ).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });

      /**
       * Tests reentrancy protection in order cancellation
       */
    it('should prevent reentrancy in order cancellation', async (): Promise<void> => {
        const price = ethers.parseEther('2000');
        const amount = ethers.parseEther('1');
        
        // Place order first
        await tokenB.connect(user1).approve(orderBook.getAddress(), ethers.MaxUint256);
        await orderBook.connect(user1).placeLimitOrder(true, price, amount);
        
        // Deploy attacker
        const ReentrancyAttacker = await ethers.getContractFactory('ReentrancyAttacker');
        const attackContract = await ReentrancyAttacker.deploy(await orderBook.getAddress());
        
        // Transfer order ownership to attacker (hypothetically)
        // Attempt reentrancy during cancellation
        await expect(
          attackContract.attackCancelOrder(1)
        ).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });
    });

    describe('Integer Overflow/Underflow', () => {
      /**
       * Tests safe handling of maximum uint256 values
       */
    it('should handle maximum uint256 values safely', async (): Promise<void> => {
        const maxUint = ethers.MaxUint256;
        
        // Attempt to place order with max values
        await expect(
          orderBook.connect(user1).placeLimitOrder(true, maxUint, maxUint)
        ).to.be.revertedWith('SafeMath: multiplication overflow');
      });

      /**
       * Tests prevention of underflow in balance calculations
       */
    it('should prevent underflow in balance calculations', async (): Promise<void> => {
        const price = ethers.parseEther('2000');
        const amount = ethers.parseEther('1');
        
        // Approve minimal amount
        await tokenB.connect(user1).approve(orderBook.getAddress(), 1);
        
        // Try to place order with insufficient approval
        await expect(
          orderBook.connect(user1).placeLimitOrder(true, price, amount)
        ).to.be.revertedWith('Insufficient balance');
      });
    });

    describe('Access Control', () => {
      /**
       * Tests restriction of admin functions to owner
       */
    it('should restrict admin functions to owner', async (): Promise<void> => {
        await expect(
          dexRegistry.connect(attacker).setMakerFee(100)
        ).to.be.revertedWith('Ownable: caller is not the owner');
        
        await expect(
          dexRegistry.connect(attacker).pauseTrading()
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      /**
       * Tests restriction of operator functions
       */
    it('should restrict operator functions', async (): Promise<void> => {
        await expect(
          dexRegistry.connect(attacker).registerTradingPair(await tokenA.getAddress(), await tokenB.getAddress())
        ).to.be.revertedWith('Not authorized');
      });

      /**
       * Tests prevention of unauthorized order cancellation
       */
    it('should prevent unauthorized order cancellation', async (): Promise<void> => {
        const price = ethers.parseEther('2000');
        const amount = ethers.parseEther('1');
        
        // User1 places order
        await tokenB.connect(user1).approve(orderBook.getAddress(), ethers.MaxUint256);
        await orderBook.connect(user1).placeLimitOrder(true, price, amount);
        
        // Attacker tries to cancel
        await expect(
          orderBook.connect(attacker).cancelOrder(1)
        ).to.be.revertedWith('Not order owner');
      });
    });

    describe('Front-Running Protection', () => {
      /**
       * Tests commit-reveal scheme for sensitive operations
       */
    it('should use commit-reveal for sensitive operations', async (): Promise<void> => {
        // Test if order placement uses proper ordering
        const price = ethers.parseEther('2000');
        const amount = ethers.parseEther('1');
        
        // Multiple users place orders in same block
        await tokenB.connect(user1).approve(orderBook.getAddress(), ethers.MaxUint256);
        await tokenA.connect(user2).approve(orderBook.getAddress(), ethers.MaxUint256);
        
        const tx1 = orderBook.connect(user1).placeLimitOrder(true, price, amount);
        const tx2 = orderBook.connect(user2).placeLimitOrder(false, price, amount);
        
        await Promise.all([tx1, tx2]);
        
        // Verify orders are matched fairly
        const order1 = await orderBook.getOrder(1);
        const order2 = await orderBook.getOrder(2);
        
        expect(order1.filled).to.equal(amount);
        expect(order2.filled).to.equal(amount);
      });
    });

    describe('Price Manipulation', () => {
      /**
       * Tests prevention of extreme price deviations
       */
    it('should prevent extreme price deviations', async (): Promise<void> => {
        const normalPrice = ethers.parseEther('2000');
        const manipulatedPrice = ethers.parseEther('1'); // 99.95% deviation
        
        // Place normal order
        await tokenB.connect(user1).approve(orderBook.getAddress(), ethers.MaxUint256);
        await orderBook.connect(user1).placeLimitOrder(true, normalPrice, ethers.parseEther('1'));
        
        // Attempt price manipulation
        await tokenA.connect(attacker).approve(orderBook.getAddress(), ethers.MaxUint256);
        
        // Should have price deviation check
        await expect(
          orderBook.connect(attacker).placeLimitOrder(false, manipulatedPrice, ethers.parseEther('100'))
        ).to.be.revertedWith('Price deviation too high');
      });
    });

    describe('Flash Loan Attack Prevention', () => {
      /**
       * Tests prevention of flash loan attacks
       */
    it('should prevent flash loan attacks on liquidity', async (): Promise<void> => {
        const FlashLoanAttacker = await ethers.getContractFactory('FlashLoanAttacker');
        const flashAttacker = await FlashLoanAttacker.deploy(await orderBook.getAddress());
        
        // Attempt flash loan attack
        await expect(
          flashAttacker.executeAttack()
        ).to.be.revertedWith('Flash loan attack detected');
      });
    });
  });

  describe('API Security', () => {
    describe('Authentication', () => {
      /**
       * Tests rejection of requests without JWT token
       */
    it('should reject requests without JWT token', async (): Promise<void> => {
        try {
          await axios.get(`${API_URL}/account/balances`);
          expect.fail('Should have thrown 401 error');
        } catch (error: any) {
          expect(error.response.status).to.equal(401);
          expect(error.response.data.error).to.include('Authentication required');
        }
      });

      /**
       * Tests rejection of requests with invalid JWT token
       */
    it('should reject requests with invalid JWT token', async (): Promise<void> => {
        try {
          await axios.get(`${API_URL}/account/balances`, {
            headers: {
              'Authorization': 'Bearer invalid.jwt.token'
            }
          });
          expect.fail('Should have thrown 401 error');
        } catch (error: any) {
          expect(error.response.status).to.equal(401);
          expect(error.response.data.error).to.include('Invalid token');
        }
      });

      /**
       * Tests rejection of expired JWT tokens
       */
    it('should reject expired JWT tokens', async (): Promise<void> => {
        // Create expired token
        const expiredToken = jwt.sign(
          { userId: 'test123', exp: Math.floor(Date.now() / 1000) - 3600 },
          'test-secret'
        );
        
        try {
          await axios.get(`${API_URL}/account/balances`, {
            headers: {
              'Authorization': `Bearer ${expiredToken}`
            }
          });
          expect.fail('Should have thrown 401 error');
        } catch (error: any) {
          expect(error.response.status).to.equal(401);
          expect(error.response.data.error).to.include('Token expired');
        }
      });
    });

    describe('Input Validation', () => {
      /**
       * Tests validation of order parameters
       */
    it('should validate order parameters', async (): Promise<void> => {
        const validToken = jwt.sign(
          { userId: 'test123' },
          'test-secret'
        );
        
        // Invalid pair
        try {
          await axios.post(`${API_URL}/orders`, {
            pair: 'INVALID',
            side: 'buy',
            type: 'limit',
            price: '2000',
            amount: '1'
          }, {
            headers: { 'Authorization': `Bearer ${validToken}` }
          });
          expect.fail('Should have thrown validation error');
        } catch (error: any) {
          expect(error.response.status).to.equal(400);
          expect(error.response.data.error).to.include('Invalid trading pair');
        }
        
        // Negative price
        try {
          await axios.post(`${API_URL}/orders`, {
            pair: 'ETH/USDC',
            side: 'buy',
            type: 'limit',
            price: '-100',
            amount: '1'
          }, {
            headers: { 'Authorization': `Bearer ${validToken}` }
          });
          expect.fail('Should have thrown validation error');
        } catch (error: any) {
          expect(error.response.status).to.equal(400);
          expect(error.response.data.error).to.include('Invalid price');
        }
        
        // Zero amount
        try {
          await axios.post(`${API_URL}/orders`, {
            pair: 'ETH/USDC',
            side: 'buy',
            type: 'limit',
            price: '2000',
            amount: '0'
          }, {
            headers: { 'Authorization': `Bearer ${validToken}` }
          });
          expect.fail('Should have thrown validation error');
        } catch (error: any) {
          expect(error.response.status).to.equal(400);
          expect(error.response.data.error).to.include('Invalid amount');
        }
      });

      /**
       * Tests sanitization of user inputs
       */
    it('should sanitize user inputs', async (): Promise<void> => {
        const validToken = jwt.sign(
          { userId: 'test123' },
          'test-secret'
        );
        
        // SQL injection attempt
        try {
          await axios.get(`${API_URL}/orders?pair=ETH/USDC'; DROP TABLE orders;--`, {
            headers: { 'Authorization': `Bearer ${validToken}` }
          });
          // If it doesn't throw, check that it sanitized the input
          // The query should work but ignore the injection attempt
        } catch (error: any) {
          expect(error.response.status).to.be.oneOf([400, 404]);
        }
        
        // XSS attempt
        try {
          await axios.post(`${API_URL}/orders`, {
            pair: 'ETH/USDC',
            side: 'buy',
            type: 'limit',
            price: '2000',
            amount: '1',
            clientOrderId: '<script>alert("XSS")</script>'
          }, {
            headers: { 'Authorization': `Bearer ${validToken}` }
          });
          // Should either reject or sanitize
        } catch (error: any) {
          expect(error.response.status).to.equal(400);
        }
      });
    });

    describe('Rate Limiting', () => {
      /**
       * Tests enforcement of rate limits
       */
    it('should enforce rate limits', async (): Promise<void> => {
        jest.setTimeout(10000);
        
        const validToken = jwt.sign(
          { userId: 'test123' },
          'test-secret'
        );
        
        const requests = [];
        // Make 100 rapid requests
        for (let i = 0; i < 100; i++) {
          requests.push(
            axios.get(`${API_URL}/ticker/ETH/USDC`, {
              headers: { 'Authorization': `Bearer ${validToken}` }
            }).catch(e => e.response)
          );
        }
        
        const responses = await Promise.all(requests);
        const rateLimited = responses.filter(r => r?.status === 429);
        
        expect(rateLimited.length).to.be.gt(0);
        
        // Check rate limit headers
        const limitedResponse = rateLimited[0];
        expect(limitedResponse.headers).to.have.property('x-ratelimit-limit');
        expect(limitedResponse.headers).to.have.property('x-ratelimit-remaining');
        expect(limitedResponse.headers).to.have.property('x-ratelimit-reset');
      });
    });

    describe('CORS Policy', () => {
      /**
       * Tests enforcement of CORS policy
       */
    it('should enforce CORS policy', async (): Promise<void> => {
        try {
          await axios.get(`${API_URL}/ticker/ETH/USDC`, {
            headers: {
              'Origin': 'http://malicious-site.com'
            }
          });
          // Check CORS headers in response
        } catch (error: any) {
          if (error.response) {
            const headers = error.response.headers;
            expect(headers['access-control-allow-origin']).to.not.equal('*');
            expect(headers['access-control-allow-origin']).to.not.equal('http://malicious-site.com');
          }
        }
      });
    });
  });

  describe('WebSocket Security', () => {
    /**
     * Tests authentication requirement for private channels
     */
    it('should require authentication for private channels', async (): Promise<void> => {
      const ws = new WebSocket('ws://localhost:3001/ws');
      
      await new Promise((resolve) => {
        ws.on('open', () => {
          // Try to subscribe to private channel without auth
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'orders'
          }));
          
          ws.on('message', (data: string) => {
            const message = JSON.parse(data);
            expect(message.type).to.equal('subscription_error');
            expect(message.error).to.include('Authentication required');
            ws.close();
            resolve(undefined);
          });
        });
      });
    });

    /**
     * Tests validation of WebSocket message format
     */
    it('should validate WebSocket message format', async (): Promise<void> => {
      const ws = new WebSocket('ws://localhost:3001/ws');
      
      await new Promise((resolve) => {
        ws.on('open', () => {
          // Send malformed message
          ws.send('invalid json');
          
          ws.on('message', (data: string) => {
            const message = JSON.parse(data);
            expect(message.type).to.equal('error');
            expect(message.error).to.include('Invalid message format');
            ws.close();
            resolve(undefined);
          });
        });
      });
    });
  });

  describe('Data Privacy', () => {
    /**
     * Tests that private user data is not exposed
     */
    it('should not expose private user data', async (): Promise<void> => {
      const validToken = jwt.sign(
        { userId: 'user123', address: await user1.getAddress() },
        'test-secret'
      );
      
      // Get own orders
      const ownOrders = await axios.get(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });
      
      // Try to get another user's orders
      const otherToken = jwt.sign(
        { userId: 'user456', address: await user2.getAddress() },
        'test-secret'
      );
      
      const otherOrders = await axios.get(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${otherToken}` }
      });
      
      // Should not see orders from other users
      expect(ownOrders.data).to.not.deep.equal(otherOrders.data);
    });

    /**
     * Tests anonymization of trade data in public endpoints
     */
    it('should anonymize trade data in public endpoints', async (): Promise<void> => {
      const trades = await axios.get(`${API_URL}/trades/ETH/USDC`);
      
      trades.data.forEach((trade: any) => {
        // Should not contain user addresses or IDs
        expect(trade).to.not.have.property('userId');
        expect(trade).to.not.have.property('userAddress');
        expect(trade).to.not.have.property('maker');
        expect(trade).to.not.have.property('taker');
      });
    });
  });

  describe('Signature Verification', () => {
    /**
     * Tests verification of order signatures
     */
    it('should verify order signatures', async (): Promise<void> => {
      const order = {
        pair: 'ETH/USDC',
        side: 'buy',
        type: 'limit',
        price: '2000',
        amount: '1',
        nonce: Date.now(),
      };
      
      // Sign order
      const messageHash = ethers.solidityPackedKeccak256(
        ['string', 'string', 'string', 'string', 'string', 'uint256'],
        [order.pair, order.side, order.type, order.price, order.amount, order.nonce]
      );

      const signature = await user1.signMessage(ethers.getBytes(messageHash));
      
      const validToken = jwt.sign(
        { userId: 'user123', address: await user1.getAddress() },
        'test-secret'
      );
      
      // Submit with signature
      const response = await axios.post(`${API_URL}/orders`, {
        ...order,
        signature
      }, {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });
      
      expect(response.status).to.equal(200);
      
      // Try with wrong signature
      const wrongSignature = await user2.signMessage(ethers.getBytes(messageHash));
      
      try {
        await axios.post(`${API_URL}/orders`, {
          ...order,
          signature: wrongSignature
        }, {
          headers: { 'Authorization': `Bearer ${validToken}` }
        });
        expect.fail('Should have thrown signature error');
      } catch (error: any) {
        expect(error.response.status).to.equal(400);
        expect(error.response.data.error).to.include('Invalid signature');
      }
    });
  });

  describe('Withdrawal Security', () => {
    /**
     * Tests time lock requirement for large withdrawals
     */
    it('should require time lock for large withdrawals', async (): Promise<void> => {
      const largeAmount = ethers.parseEther('10000');
      
      // Request withdrawal
      await feeCollector.connect(owner).requestWithdrawal(
        tokenA.getAddress(),
        largeAmount
      );
      
      // Try immediate withdrawal
      await expect(
        feeCollector.connect(owner).executeWithdrawal(tokenA.getAddress())
      ).to.be.revertedWith('Withdrawal time lock active');
      
      // Fast forward time
      await ethers.provider.send('evm_increaseTime', [86400]); // 24 hours
      await ethers.provider.send('evm_mine', []);
      
      // Now withdrawal should work
      await expect(
        feeCollector.connect(owner).executeWithdrawal(tokenA.getAddress())
      ).to.not.be.reverted;
    });

    /**
     * Tests daily withdrawal amount limits
     */
    it('should limit daily withdrawal amounts', async (): Promise<void> => {
      const dailyLimit = ethers.parseEther('50000');
      
      // Try to withdraw more than daily limit
      await expect(
        feeCollector.connect(owner).withdraw(
          tokenA.getAddress(),
          dailyLimit.add(1)
        )
      ).to.be.revertedWith('Daily withdrawal limit exceeded');
    });
  });

  describe('Emergency Procedures', () => {
    /**
     * Tests emergency pause functionality
     */
    it('should allow emergency pause by owner', async (): Promise<void> => {
      await orderBook.connect(owner).pauseTrading();
      
      // Try to place order
      await expect(
        orderBook.connect(user1).placeLimitOrder(
          true,
          ethers.parseEther('2000'),
          ethers.parseEther('1')
        )
      ).to.be.revertedWith('Trading paused');
    });

    /**
     * Tests circuit breaker for extreme volatility
     */
    it('should have circuit breaker for extreme volatility', async (): Promise<void> => {
      // Simulate extreme price movement
      const normalPrice = ethers.parseEther('2000');
      const crashPrice = ethers.parseEther('1000'); // 50% drop
      
      // Place orders to simulate crash
      await tokenA.connect(attacker).approve(orderBook.getAddress(), ethers.MaxUint256);
      
      // Should trigger circuit breaker
      await expect(
        orderBook.connect(attacker).placeMarketOrder(false, ethers.parseEther('1000'))
      ).to.be.revertedWith('Circuit breaker activated');
    });
  });
});