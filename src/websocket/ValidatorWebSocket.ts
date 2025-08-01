/**
 * ValidatorWebSocket - WebSocket integration for real-time DEX updates
 * 
 * Provides real-time order book, trade, and order status updates
 * through the Avalanche validator's WebSocket connection.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { validatorDEX, type OrderBook, type Trade, type Order } from '../services/ValidatorDEXService';
import { logger } from '../utils/logger';

export interface WebSocketRoom {
  type: 'orderbook' | 'trades' | 'orders';
  pair?: string;
  userId?: string;
}

export class ValidatorWebSocketService {
  private io: SocketIOServer;
  private subscriptions: Map<string, () => void> = new Map();
  private connectedClients: Map<string, Set<string>> = new Map(); // socketId -> rooms
  
  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupSocketHandlers();
  }
  
  /**
   * Set up Socket.IO event handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info('DEX WebSocket client connected', { socketId: socket.id });
      
      // Initialize client room set
      this.connectedClients.set(socket.id, new Set());
      
      // Handle subscription to order book updates
      socket.on('subscribe:orderbook', async (pairs: string[]) => {
        try {
          for (const pair of pairs) {
            const room = `orderbook:${pair}`;
            socket.join(room);
            this.connectedClients.get(socket.id)?.add(room);
            
            // Start subscription if not already active
            if (!this.subscriptions.has(room)) {
              this.startOrderBookSubscription(pair);
            }
            
            // Send initial order book
            const orderBook = await validatorDEX.getOrderBook(pair);
            socket.emit('orderbook:snapshot', { pair, orderBook });
          }
          
          socket.emit('subscribed', { type: 'orderbook', pairs });
        } catch (error) {
          logger.error('Failed to subscribe to order book:', error);
          socket.emit('error', {
            type: 'subscription_failed',
            message: 'Failed to subscribe to order book'
          });
        }
      });
      
      // Handle unsubscription from order book
      socket.on('unsubscribe:orderbook', (pairs: string[]) => {
        for (const pair of pairs) {
          const room = `orderbook:${pair}`;
          socket.leave(room);
          this.connectedClients.get(socket.id)?.delete(room);
          
          // Check if room is empty and stop subscription
          this.checkAndStopSubscription(room);
        }
        
        socket.emit('unsubscribed', { type: 'orderbook', pairs });
      });
      
      // Handle subscription to trade updates
      socket.on('subscribe:trades', (pairs: string[]) => {
        for (const pair of pairs) {
          const room = `trades:${pair}`;
          socket.join(room);
          this.connectedClients.get(socket.id)?.add(room);
          
          // Start subscription if not already active
          if (!this.subscriptions.has(room)) {
            this.startTradeSubscription(pair);
          }
        }
        
        socket.emit('subscribed', { type: 'trades', pairs });
      });
      
      // Handle subscription to user's order updates
      socket.on('subscribe:orders', (userId: string) => {
        const room = `orders:${userId}`;
        socket.join(room);
        this.connectedClients.get(socket.id)?.add(room);
        
        socket.emit('subscribed', { type: 'orders', userId });
      });
      
      // Handle order placement through WebSocket
      socket.on('place:order', async (orderData: any, callback: Function) => {
        try {
          const order = await validatorDEX.placeOrder(orderData);
          
          // Notify user of order placement
          const userRoom = `orders:${order.maker}`;
          this.io.to(userRoom).emit('order:placed', order);
          
          // Update order book subscribers
          const orderBookRoom = `orderbook:${order.tokenPair}`;
          const orderBook = await validatorDEX.getOrderBook(order.tokenPair);
          this.io.to(orderBookRoom).emit('orderbook:update', {
            pair: order.tokenPair,
            orderBook
          });
          
          callback({ success: true, order });
        } catch (error) {
          logger.error('Failed to place order via WebSocket:', error);
          callback({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to place order'
          });
        }
      });
      
      // Handle order cancellation
      socket.on('cancel:order', async (data: { orderId: string, maker: string }, callback: Function) => {
        try {
          const success = await validatorDEX.cancelOrder(data.orderId, data.maker);
          
          if (success) {
            // Notify user of cancellation
            const userRoom = `orders:${data.maker}`;
            this.io.to(userRoom).emit('order:cancelled', { orderId: data.orderId });
          }
          
          callback({ success });
        } catch (error) {
          logger.error('Failed to cancel order via WebSocket:', error);
          callback({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel order'
          });
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('DEX WebSocket client disconnected', { socketId: socket.id });
        
        // Clean up subscriptions
        const rooms = this.connectedClients.get(socket.id);
        if (rooms) {
          rooms.forEach(room => {
            socket.leave(room);
            this.checkAndStopSubscription(room);
          });
          this.connectedClients.delete(socket.id);
        }
      });
    });
  }
  
  /**
   * Start order book subscription for a trading pair
   */
  private startOrderBookSubscription(pair: string): void {
    const room = `orderbook:${pair}`;
    
    const unsubscribe = validatorDEX.subscribeToOrderBook(pair, (orderBook: OrderBook) => {
      // Emit update to all clients in the room
      this.io.to(room).emit('orderbook:update', {
        pair,
        orderBook,
        timestamp: Date.now()
      });
    });
    
    this.subscriptions.set(room, unsubscribe);
    logger.info('Started order book subscription', { pair });
  }
  
  /**
   * Start trade subscription for a trading pair
   */
  private startTradeSubscription(pair: string): void {
    const room = `trades:${pair}`;
    
    const unsubscribe = validatorDEX.subscribeToTrades(pair, (trade: Trade) => {
      // Emit trade to all clients in the room
      this.io.to(room).emit('trade:executed', {
        pair,
        trade,
        timestamp: Date.now()
      });
      
      // Also notify the maker and taker
      this.io.to(`orders:${trade.maker}`).emit('order:filled', {
        orderId: trade.tradeId,
        trade
      });
      this.io.to(`orders:${trade.taker}`).emit('order:filled', {
        orderId: trade.tradeId,
        trade
      });
    });
    
    this.subscriptions.set(room, unsubscribe);
    logger.info('Started trade subscription', { pair });
  }
  
  /**
   * Check if a subscription should be stopped
   */
  private checkAndStopSubscription(room: string): void {
    // Check if any clients are still in the room
    const clients = this.io.sockets.adapter.rooms.get(room);
    
    if (!clients || clients.size === 0) {
      // Stop subscription
      const unsubscribe = this.subscriptions.get(room);
      if (unsubscribe) {
        unsubscribe();
        this.subscriptions.delete(room);
        logger.info('Stopped subscription', { room });
      }
    }
  }
  
  /**
   * Broadcast market update to all clients
   */
  public broadcastMarketUpdate(pair: string, data: any): void {
    this.io.emit('market:update', {
      pair,
      data,
      timestamp: Date.now()
    });
  }
  
  /**
   * Broadcast system message
   */
  public broadcastSystemMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    this.io.emit('system:message', {
      message,
      type,
      timestamp: Date.now()
    });
  }
  
  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
  
  /**
   * Get active subscriptions count
   */
  public getActiveSubscriptionsCount(): number {
    return this.subscriptions.size;
  }
  
  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Unsubscribe all
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
    this.connectedClients.clear();
    
    logger.info('ValidatorWebSocketService cleaned up');
  }
}

export default ValidatorWebSocketService;