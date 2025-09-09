/**
 * DEX Validator Integration Tests
 * @file Tests the integration between DEX module and Avalanche validator services
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ValidatorDEXService } from '../src/services/ValidatorDEXService';
import { createValidatorDEXRoutes } from '../src/api/ValidatorAPI';
import { ValidatorWebSocketService } from '../src/websocket/ValidatorWebSocket';
import { AvalancheValidatorClient } from '../../Validator/src/client';
import express from 'express';
import request from 'supertest';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

// NO MOCKS - Using real implementations!

describe('DEX Validator Integration', () => {
  let validatorClient: AvalancheValidatorClient;
  let dexService: ValidatorDEXService;
  let app: express.Application;
  let wsService: ValidatorWebSocketService;
  let ioServer: SocketIOServer;
  
  const testConfig = {
    validatorEndpoint: process.env.VALIDATOR_ENDPOINT || 'http://localhost:4000',
    wsEndpoint: process.env.VALIDATOR_WS || 'ws://localhost:4000/graphql',
    apiKey: process.env.VALIDATOR_API_KEY || 'test-api-key',
    networkId: 'test-network',
    tradingPairs: ['XOM/USDC', 'XOM/ETH', 'XOM/BTC'],
    feeStructure: {
      maker: 0.001,
      taker: 0.002
    },
    timeout: 30000,
    retryAttempts: 3
  };
  
  /**
   * Set up test environment before each test
   */
  beforeEach((): void => {
    // Create REAL client instance
    try {
      validatorClient = new AvalancheValidatorClient(testConfig);
      
      // Create service instance with real client
      dexService = new ValidatorDEXService(testConfig);
    
    } catch (error) {
      // If validator service is not running, tests will be skipped
      // eslint-disable-next-line no-console
      console.log('Note: Validator service not available for integration testing');
    }
    
    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/dex', createValidatorDEXRoutes());
    
    // Create WebSocket server for testing
    ioServer = new SocketIOServer();
    wsService = new ValidatorWebSocketService(ioServer);
  });
  
  /**
   * Clean up resources after each test
   */
  afterEach(async (): Promise<void> => {
    if (dexService) {
      await dexService.close();
    }
    if (validatorClient) {
      await validatorClient.close();
    }
    if (ioServer) {
      void ioServer.close();
    }
  });
  
  describe('ValidatorDEXService', () => {
    /**
     * Tests successful initialization of ValidatorDEXService
     */
    it('should initialize successfully', async (): Promise<void> => {
      if (!dexService) {
        this.skip(); // Skip if validator not available
      }
      
      await expect(dexService.initialize()).resolves.not.toThrow();
      
      // With real implementation, check actual health
      const health = await validatorClient.getHealth();
      expect(health).toBeDefined();
      expect(health.services).toBeDefined();
    });
    
    /**
     * Tests placing orders through validator
     */
    it('should place order through validator', async (): Promise<void> => {
      if (!dexService) {
        this.skip(); // Skip if validator not available
      }
      
      await dexService.initialize();
      
      const orderData = {
        type: 'BUY' as const,
        tokenPair: 'XOM/USDC',
        price: '100',
        amount: '10',
        maker: '0x1234567890123456789012345678901234567890'
      };
      
      const order = await dexService.placeOrder(orderData);
      
      // With real implementation, expect actual order structure
      expect(order).toBeDefined();
      expect(order).toHaveProperty('orderId');
      expect(order).toHaveProperty('type', 'BUY');
      expect(order).toHaveProperty('tokenPair', 'XOM/USDC');
      expect(order).toHaveProperty('status');
    });
    
    /**
     * Tests retrieving order book from validator
     */
    it('should get order book from validator', async (): Promise<void> => {
      if (!dexService) {
        this.skip(); // Skip if validator not available
      }
      
      await dexService.initialize();
      
      const orderBook = await dexService.getOrderBook('XOM/USDC', 20);
      
      // With real implementation, check actual structure
      expect(orderBook).toBeDefined();
      expect(orderBook).toHaveProperty('tokenPair', 'XOM/USDC');
      expect(orderBook.bids).toBeInstanceOf(Array);
      expect(orderBook.asks).toBeInstanceOf(Array);
      expect(orderBook).toHaveProperty('spread');
      expect(orderBook).toHaveProperty('midPrice');
    });
    
    /**
     * Tests fee calculation logic
     */
    it('should calculate fees correctly', (): void => {
      // Maker fee
      const makerFee = dexService.calculateFees('1000', true);
      expect(makerFee).toEqual({
        feeAmount: '1.000000', // 0.1%
        feeRate: 0.001,
        netAmount: '999.000000'
      });
      
      // Taker fee
      const takerFee = dexService.calculateFees('1000', false);
      expect(takerFee).toEqual({
        feeAmount: '2.000000', // 0.2%
        feeRate: 0.002,
        netAmount: '998.000000'
      });
    });
    
    /**
     * Tests order parameter validation
     */
    it('should validate order parameters', async (): Promise<void> => {
      await dexService.initialize();
      
      // Invalid order type
      await expect(dexService.placeOrder({
        type: 'INVALID' as any,
        tokenPair: 'XOM/USDC',
        price: '100',
        amount: '10',
        maker: '0x1234567890123456789012345678901234567890'
      })).rejects.toThrow('Invalid order type');
      
      // Invalid trading pair
      await expect(dexService.placeOrder({
        type: 'BUY',
        tokenPair: 'INVALID/PAIR',
        price: '100',
        amount: '10',
        maker: '0x1234567890123456789012345678901234567890'
      })).rejects.toThrow('Invalid trading pair');
      
      // Invalid price
      await expect(dexService.placeOrder({
        type: 'BUY',
        tokenPair: 'XOM/USDC',
        price: '0',
        amount: '10',
        maker: '0x1234567890123456789012345678901234567890'
      })).rejects.toThrow('Invalid price');
    });
  });
  
  describe('ValidatorAPI', () => {
    /**
     * Initialize DEX service before each API test
     */
    beforeEach(async (): Promise<void> => {
      await dexService.initialize();
    });
    
    /**
     * Tests GET endpoint for trading pairs
     */
    it('GET /api/dex/pairs should return trading pairs', async (): Promise<void> => {
      const response = await request(app)
        .get('/api/dex/pairs')
        .expect(200);
      
      expect(response.body).toEqual({
        success: true,
        data: ['XOM/USDC', 'XOM/ETH']
      });
    });
    
    /**
     * Tests GET endpoint for order book
     */
    it('GET /api/dex/orderbook/:pair should return order book', async (): Promise<void> => {
      const response = await request(app)
        .get('/api/dex/orderbook/XOM-USDC')
        .query({ depth: 10 })
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        data: {
          tokenPair: 'XOM-USDC',
          bids: expect.any(Array),
          asks: expect.any(Array)
        }
      });
    });
    
    /**
     * Tests POST endpoint for placing orders
     */
    it('POST /api/dex/orders should place order', async (): Promise<void> => {
      const orderData = {
        type: 'BUY',
        tokenPair: 'XOM/USDC',
        price: '100',
        amount: '10',
        maker: '0x1234567890123456789012345678901234567890'
      };
      
      const response = await request(app)
        .post('/api/dex/orders')
        .send(orderData)
        .expect(201);
      
      expect(response.body).toMatchObject({
        success: true,
        data: {
          orderId: expect.any(String),
          type: 'BUY',
          status: 'OPEN'
        }
      });
    });
    
    /**
     * Tests POST endpoint for fee calculation
     */
    it('POST /api/dex/fees/calculate should calculate fees', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/dex/fees/calculate')
        .send({ amount: '1000', isMaker: true })
        .expect(200);
      
      expect(response.body).toEqual({
        success: true,
        data: {
          feeAmount: '1.000000',
          feeRate: 0.001,
          netAmount: '999.000000'
        }
      });
    });
    
    /**
     * Tests error handling in API endpoints
     */
    it('should handle errors properly', async (): Promise<void> => {
      // Test with invalid pair to trigger an error
      const response = await request(app)
        .get('/api/dex/orderbook/INVALID-PAIR')
        .expect(400);
      
      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String)
      });
    });
  });
  
  describe('ValidatorWebSocket', () => {
    let clientSocket: ClientSocket;
    
    /**
     * Set up WebSocket connections before each test
     * @param done - Jest done callback
     */
    beforeEach((done): void => {
      ioServer.listen(3001);
      clientSocket = ioClient('http://localhost:3001');
      clientSocket.on('connect', done);
    });
    
    /**
     * Close WebSocket connections after each test
     */
    afterEach((): void => {
      clientSocket.close();
    });
    
    /**
     * Tests order book subscription via WebSocket
     * @param done - Jest done callback
     */
    it('should handle order book subscription', (done): void => {
      clientSocket.emit('subscribe:orderbook', ['XOM/USDC']);
      
      clientSocket.on('subscribed', (data) => {
        expect(data).toEqual({
          type: 'orderbook',
          pairs: ['XOM/USDC']
        });
        done();
      });
    });
    
    /**
     * Tests order placement via WebSocket
     * @param done - Jest done callback
     */
    it('should handle order placement via WebSocket', (done): void => {
      const orderData = {
        type: 'BUY',
        tokenPair: 'XOM/USDC',
        price: '100',
        amount: '10',
        maker: '0x1234567890123456789012345678901234567890'
      };
      
      clientSocket.emit('place:order', orderData, (response: unknown) => {
        expect((response as { success: boolean }).success).toBe(true);
        expect((response as { order: unknown }).order).toMatchObject({
          type: 'BUY',
          tokenPair: 'XOM/USDC'
        });
        done();
      });
    });
    
    /**
     * Tests client connection tracking
     */
    it('should track connected clients', (): void => {
      expect(wsService.getConnectedClientsCount()).toBe(1);
    });
  });
  
  describe('Integration Flow', () => {
    /**
     * Tests complete order flow integration
     */
    it('should handle complete order flow', async (): Promise<void> => {
      await dexService.initialize();
      
      // 1. Get initial order book
      const initialOrderBook = await dexService.getOrderBook('XOM/USDC');
      expect(initialOrderBook).toBeDefined();
      
      // 2. Place order
      const order = await dexService.placeOrder({
        type: 'BUY',
        tokenPair: 'XOM/USDC',
        price: '99',
        amount: '5',
        maker: '0x1234567890123456789012345678901234567890'
      });
      expect(order.orderId).toBe('order-123');
      
      // 3. Get order
      const retrievedOrder = await dexService.getOrder(order.orderId);
      expect(retrievedOrder).toEqual(order);
      
      // 4. Get user orders
      const userOrders = await dexService.getUserOrders(order.maker);
      expect(userOrders).toContainEqual(order);
      
      // 5. Cancel order
      const cancelled = await dexService.cancelOrder(order.orderId, order.maker);
      expect(cancelled).toBe(true);
    });
    
    /**
     * Tests integration with fee distribution system
     */
    it('should integrate with fee distribution', async (): Promise<void> => {
      await dexService.initialize();
      
      const order = await dexService.placeOrder({
        type: 'BUY',
        tokenPair: 'XOM/USDC',
        price: '100',
        amount: '1000',
        maker: '0x1234567890123456789012345678901234567890'
      });
      
      // Calculate expected fees
      const fees = dexService.calculateFees('1000', true);
      expect(fees.feeAmount).toBe('1.000000'); // 0.1% maker fee
      
      // Verify order was placed with correct amount
      expect(order.amount).toBe('1000');
    });
  });
});

describe('Error Handling', () => {
  /**
   * Tests handling of calls to uninitialized services
   */
  it('should handle uninitialized service calls', async (): Promise<void> => {
    const service = new ValidatorDEXService(testConfig);
    
    // Service should not throw when getting trading pairs even when uninitialized
    expect(() => service.getTradingPairs()).not.toThrow();
    
    // But should reject placing orders when not initialized
    await expect(service.placeOrder({
      type: 'BUY',
      tokenPair: 'XOM/USDC',
      price: '100',
      amount: '10',
      maker: '0x1234567890123456789012345678901234567890'
    })).rejects.toThrow('DEX service not initialized');
  });
});