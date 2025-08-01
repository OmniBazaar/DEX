/**
 * DEX Validator Integration Tests
 * 
 * Tests the integration between DEX module and Avalanche validator services
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

// Mock the validator client
jest.mock('../../Validator/src/client');

describe('DEX Validator Integration', () => {
  let mockClient: jest.Mocked<AvalancheValidatorClient>;
  let dexService: ValidatorDEXService;
  let app: express.Application;
  let wsService: ValidatorWebSocketService;
  let ioServer: SocketIOServer;
  
  const mockConfig = {
    validatorEndpoint: 'http://localhost:4000',
    wsEndpoint: 'ws://localhost:4000/graphql',
    apiKey: 'test-api-key',
    networkId: 'test-network',
    tradingPairs: ['XOM/USDC', 'XOM/ETH'],
    feeStructure: {
      maker: 0.001,
      taker: 0.002
    },
    timeout: 30000,
    retryAttempts: 3
  };
  
  beforeEach(() => {
    // Create mock client
    mockClient = {
      getHealth: jest.fn().mockResolvedValue({
        services: {
          orderBook: true,
          storage: true,
          chat: true
        }
      }),
      placeOrder: jest.fn().mockResolvedValue('order-123'),
      getOrderBook: jest.fn().mockResolvedValue({
        bids: [
          { price: '100', amount: '10', total: '1000', orderCount: 1 }
        ],
        asks: [
          { price: '101', amount: '5', total: '505', orderCount: 1 }
        ],
        spread: '1',
        midPrice: '100.5'
      }),
      close: jest.fn()
    } as any;
    
    // Mock the client factory
    (AvalancheValidatorClient as any).mockImplementation(() => mockClient);
    
    // Create service instance
    dexService = new ValidatorDEXService(mockConfig);
    
    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/dex', createValidatorDEXRoutes());
    
    // Create WebSocket server for testing
    ioServer = new SocketIOServer();
    wsService = new ValidatorWebSocketService(ioServer);
  });
  
  afterEach(async () => {
    await dexService.close();
    ioServer.close();
    jest.clearAllMocks();
  });
  
  describe('ValidatorDEXService', () => {
    it('should initialize successfully', async () => {
      await expect(dexService.initialize()).resolves.not.toThrow();
      expect(mockClient.getHealth).toHaveBeenCalled();
    });
    
    it('should place order through validator', async () => {
      await dexService.initialize();
      
      const orderData = {
        type: 'BUY' as const,
        tokenPair: 'XOM/USDC',
        price: '100',
        amount: '10',
        maker: '0x1234567890123456789012345678901234567890'
      };
      
      const order = await dexService.placeOrder(orderData);
      
      expect(order).toMatchObject({
        orderId: 'order-123',
        type: 'BUY',
        tokenPair: 'XOM/USDC',
        price: '100',
        amount: '10',
        status: 'OPEN',
        maker: orderData.maker
      });
      
      expect(mockClient.placeOrder).toHaveBeenCalledWith(orderData);
    });
    
    it('should get order book from validator', async () => {
      await dexService.initialize();
      
      const orderBook = await dexService.getOrderBook('XOM/USDC', 20);
      
      expect(orderBook).toMatchObject({
        tokenPair: 'XOM/USDC',
        bids: expect.any(Array),
        asks: expect.any(Array),
        spread: '1',
        midPrice: '100.5'
      });
      
      expect(mockClient.getOrderBook).toHaveBeenCalledWith('XOM/USDC', 20);
    });
    
    it('should calculate fees correctly', () => {
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
    
    it('should validate order parameters', async () => {
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
    beforeEach(async () => {
      await dexService.initialize();
    });
    
    it('GET /api/dex/pairs should return trading pairs', async () => {
      const response = await request(app)
        .get('/api/dex/pairs')
        .expect(200);
      
      expect(response.body).toEqual({
        success: true,
        data: ['XOM/USDC', 'XOM/ETH']
      });
    });
    
    it('GET /api/dex/orderbook/:pair should return order book', async () => {
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
    
    it('POST /api/dex/orders should place order', async () => {
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
    
    it('POST /api/dex/fees/calculate should calculate fees', async () => {
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
    
    it('should handle errors properly', async () => {
      mockClient.getOrderBook.mockRejectedValueOnce(new Error('Validator error'));
      
      const response = await request(app)
        .get('/api/dex/orderbook/XOM-USDC')
        .expect(500);
      
      expect(response.body).toMatchObject({
        success: false,
        error: 'Failed to get order book',
        message: 'Validator error'
      });
    });
  });
  
  describe('ValidatorWebSocket', () => {
    let clientSocket: ClientSocket;
    
    beforeEach((done) => {
      ioServer.listen(3001);
      clientSocket = ioClient('http://localhost:3001');
      clientSocket.on('connect', done);
    });
    
    afterEach(() => {
      clientSocket.close();
    });
    
    it('should handle order book subscription', (done) => {
      clientSocket.emit('subscribe:orderbook', ['XOM/USDC']);
      
      clientSocket.on('subscribed', (data) => {
        expect(data).toEqual({
          type: 'orderbook',
          pairs: ['XOM/USDC']
        });
        done();
      });
    });
    
    it('should handle order placement via WebSocket', (done) => {
      const orderData = {
        type: 'BUY',
        tokenPair: 'XOM/USDC',
        price: '100',
        amount: '10',
        maker: '0x1234567890123456789012345678901234567890'
      };
      
      clientSocket.emit('place:order', orderData, (response: any) => {
        expect(response.success).toBe(true);
        expect(response.order).toMatchObject({
          type: 'BUY',
          tokenPair: 'XOM/USDC'
        });
        done();
      });
    });
    
    it('should track connected clients', () => {
      expect(wsService.getConnectedClientsCount()).toBe(1);
    });
  });
  
  describe('Integration Flow', () => {
    it('should handle complete order flow', async () => {
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
    
    it('should integrate with fee distribution', async () => {
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
  it('should handle validator connection failure', async () => {
    const mockClient = {
      getHealth: jest.fn().mockResolvedValue({
        services: { orderBook: false }
      })
    } as any;
    
    (AvalancheValidatorClient as any).mockImplementation(() => mockClient);
    
    const service = new ValidatorDEXService(mockConfig);
    await expect(service.initialize()).rejects.toThrow('Order book service is not available');
  });
  
  it('should handle uninitialized service calls', () => {
    const service = new ValidatorDEXService(mockConfig);
    
    expect(() => service.getTradingPairs()).not.toThrow();
    
    expect(service.placeOrder({
      type: 'BUY',
      tokenPair: 'XOM/USDC',
      price: '100',
      amount: '10',
      maker: '0x1234567890123456789012345678901234567890'
    })).rejects.toThrow('DEX service not initialized');
  });
});