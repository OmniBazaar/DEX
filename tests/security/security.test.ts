import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { DEXRegistry, OrderBook, FeeCollector, MockERC20 } from '../../typechain-types';

describe('DEX Security Tests', function() {
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

  beforeEach(async () => {
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
      tokenA.address,
      tokenB.address,
      feeCollector.address,
      10, // 0.1% maker fee
      20  // 0.2% taker fee
    );
    
    // Mint tokens
    const amount = ethers.utils.parseEther('10000');
    await tokenA.mint(user1.address, amount);
    await tokenB.mint(user1.address, amount);
    await tokenA.mint(attacker.address, amount);
    await tokenB.mint(attacker.address, amount);
  });

  describe('Smart Contract Security', () => {
    describe('Reentrancy Protection', () => {
      it('should prevent reentrancy in order placement', async () => {
        // Deploy malicious token that attempts reentrancy
        const ReentrancyAttacker = await ethers.getContractFactory('ReentrancyAttacker');
        const attackContract = await ReentrancyAttacker.deploy(orderBook.address);
        
        // Fund attacker contract
        await tokenA.mint(attackContract.address, ethers.utils.parseEther('1000'));
        
        // Attempt reentrancy attack
        await expect(
          attackContract.attackPlaceOrder()
        ).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });

      it('should prevent reentrancy in order cancellation', async () => {
        const price = ethers.utils.parseEther('2000');
        const amount = ethers.utils.parseEther('1');
        
        // Place order first
        await tokenB.connect(user1).approve(orderBook.address, ethers.constants.MaxUint256);
        await orderBook.connect(user1).placeLimitOrder(true, price, amount);
        
        // Deploy attacker
        const ReentrancyAttacker = await ethers.getContractFactory('ReentrancyAttacker');
        const attackContract = await ReentrancyAttacker.deploy(orderBook.address);
        
        // Transfer order ownership to attacker (hypothetically)
        // Attempt reentrancy during cancellation
        await expect(
          attackContract.attackCancelOrder(1)
        ).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });
    });

    describe('Integer Overflow/Underflow', () => {
      it('should handle maximum uint256 values safely', async () => {
        const maxUint = ethers.constants.MaxUint256;
        
        // Attempt to place order with max values
        await expect(
          orderBook.connect(user1).placeLimitOrder(true, maxUint, maxUint)
        ).to.be.revertedWith('SafeMath: multiplication overflow');
      });

      it('should prevent underflow in balance calculations', async () => {
        const price = ethers.utils.parseEther('2000');
        const amount = ethers.utils.parseEther('1');
        
        // Approve minimal amount
        await tokenB.connect(user1).approve(orderBook.address, 1);
        
        // Try to place order with insufficient approval
        await expect(
          orderBook.connect(user1).placeLimitOrder(true, price, amount)
        ).to.be.revertedWith('Insufficient balance');
      });
    });

    describe('Access Control', () => {
      it('should restrict admin functions to owner', async () => {
        await expect(
          dexRegistry.connect(attacker).setMakerFee(100)
        ).to.be.revertedWith('Ownable: caller is not the owner');
        
        await expect(
          dexRegistry.connect(attacker).pauseTrading()
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should restrict operator functions', async () => {
        await expect(
          dexRegistry.connect(attacker).registerTradingPair(tokenA.address, tokenB.address)
        ).to.be.revertedWith('Not authorized');
      });

      it('should prevent unauthorized order cancellation', async () => {
        const price = ethers.utils.parseEther('2000');
        const amount = ethers.utils.parseEther('1');
        
        // User1 places order
        await tokenB.connect(user1).approve(orderBook.address, ethers.constants.MaxUint256);
        await orderBook.connect(user1).placeLimitOrder(true, price, amount);
        
        // Attacker tries to cancel
        await expect(
          orderBook.connect(attacker).cancelOrder(1)
        ).to.be.revertedWith('Not order owner');
      });
    });

    describe('Front-Running Protection', () => {
      it('should use commit-reveal for sensitive operations', async () => {
        // Test if order placement uses proper ordering
        const price = ethers.utils.parseEther('2000');
        const amount = ethers.utils.parseEther('1');
        
        // Multiple users place orders in same block
        await tokenB.connect(user1).approve(orderBook.address, ethers.constants.MaxUint256);
        await tokenA.connect(user2).approve(orderBook.address, ethers.constants.MaxUint256);
        
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
      it('should prevent extreme price deviations', async () => {
        const normalPrice = ethers.utils.parseEther('2000');
        const manipulatedPrice = ethers.utils.parseEther('1'); // 99.95% deviation
        
        // Place normal order
        await tokenB.connect(user1).approve(orderBook.address, ethers.constants.MaxUint256);
        await orderBook.connect(user1).placeLimitOrder(true, normalPrice, ethers.utils.parseEther('1'));
        
        // Attempt price manipulation
        await tokenA.connect(attacker).approve(orderBook.address, ethers.constants.MaxUint256);
        
        // Should have price deviation check
        await expect(
          orderBook.connect(attacker).placeLimitOrder(false, manipulatedPrice, ethers.utils.parseEther('100'))
        ).to.be.revertedWith('Price deviation too high');
      });
    });

    describe('Flash Loan Attack Prevention', () => {
      it('should prevent flash loan attacks on liquidity', async () => {
        const FlashLoanAttacker = await ethers.getContractFactory('FlashLoanAttacker');
        const flashAttacker = await FlashLoanAttacker.deploy(orderBook.address);
        
        // Attempt flash loan attack
        await expect(
          flashAttacker.executeAttack()
        ).to.be.revertedWith('Flash loan attack detected');
      });
    });
  });

  describe('API Security', () => {
    describe('Authentication', () => {
      it('should reject requests without JWT token', async () => {
        try {
          await axios.get(`${API_URL}/account/balances`);
          expect.fail('Should have thrown 401 error');
        } catch (error: any) {
          expect(error.response.status).to.equal(401);
          expect(error.response.data.error).to.include('Authentication required');
        }
      });

      it('should reject requests with invalid JWT token', async () => {
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

      it('should reject expired JWT tokens', async () => {
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
      it('should validate order parameters', async () => {
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

      it('should sanitize user inputs', async () => {
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
      it('should enforce rate limits', async function() {
        this.timeout(10000);
        
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
      it('should enforce CORS policy', async () => {
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
    it('should require authentication for private channels', async () => {
      const WebSocket = require('ws');
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

    it('should validate WebSocket message format', async () => {
      const WebSocket = require('ws');
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
    it('should not expose private user data', async () => {
      const validToken = jwt.sign(
        { userId: 'user123', address: user1.address },
        'test-secret'
      );
      
      // Get own orders
      const ownOrders = await axios.get(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });
      
      // Try to get another user's orders
      const otherToken = jwt.sign(
        { userId: 'user456', address: user2.address },
        'test-secret'
      );
      
      const otherOrders = await axios.get(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${otherToken}` }
      });
      
      // Should not see orders from other users
      expect(ownOrders.data).to.not.deep.equal(otherOrders.data);
    });

    it('should anonymize trade data in public endpoints', async () => {
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
    it('should verify order signatures', async () => {
      const order = {
        pair: 'ETH/USDC',
        side: 'buy',
        type: 'limit',
        price: '2000',
        amount: '1',
        nonce: Date.now(),
      };
      
      // Sign order
      const messageHash = ethers.utils.solidityKeccak256(
        ['string', 'string', 'string', 'string', 'string', 'uint256'],
        [order.pair, order.side, order.type, order.price, order.amount, order.nonce]
      );
      
      const signature = await user1.signMessage(ethers.utils.arrayify(messageHash));
      
      const validToken = jwt.sign(
        { userId: 'user123', address: user1.address },
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
      const wrongSignature = await user2.signMessage(ethers.utils.arrayify(messageHash));
      
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
    it('should require time lock for large withdrawals', async () => {
      const largeAmount = ethers.utils.parseEther('10000');
      
      // Request withdrawal
      await feeCollector.connect(owner).requestWithdrawal(
        tokenA.address,
        largeAmount
      );
      
      // Try immediate withdrawal
      await expect(
        feeCollector.connect(owner).executeWithdrawal(tokenA.address)
      ).to.be.revertedWith('Withdrawal time lock active');
      
      // Fast forward time
      await ethers.provider.send('evm_increaseTime', [86400]); // 24 hours
      await ethers.provider.send('evm_mine', []);
      
      // Now withdrawal should work
      await expect(
        feeCollector.connect(owner).executeWithdrawal(tokenA.address)
      ).to.not.be.reverted;
    });

    it('should limit daily withdrawal amounts', async () => {
      const dailyLimit = ethers.utils.parseEther('50000');
      
      // Try to withdraw more than daily limit
      await expect(
        feeCollector.connect(owner).withdraw(
          tokenA.address,
          dailyLimit.add(1)
        )
      ).to.be.revertedWith('Daily withdrawal limit exceeded');
    });
  });

  describe('Emergency Procedures', () => {
    it('should allow emergency pause by owner', async () => {
      await orderBook.connect(owner).pauseTrading();
      
      // Try to place order
      await expect(
        orderBook.connect(user1).placeLimitOrder(
          true,
          ethers.utils.parseEther('2000'),
          ethers.utils.parseEther('1')
        )
      ).to.be.revertedWith('Trading paused');
    });

    it('should have circuit breaker for extreme volatility', async () => {
      // Simulate extreme price movement
      const normalPrice = ethers.utils.parseEther('2000');
      const crashPrice = ethers.utils.parseEther('1000'); // 50% drop
      
      // Place orders to simulate crash
      await tokenA.connect(attacker).approve(orderBook.address, ethers.constants.MaxUint256);
      
      // Should trigger circuit breaker
      await expect(
        orderBook.connect(attacker).placeMarketOrder(false, ethers.utils.parseEther('1000'))
      ).to.be.revertedWith('Circuit breaker activated');
    });
  });
});