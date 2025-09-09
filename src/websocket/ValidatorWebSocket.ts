/**
 * ValidatorWebSocket - WebSocket integration for real-time DEX updates
 * 
 * Provides real-time order book, trade, and order status updates
 * through the Avalanche validator's WebSocket connection.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { validatorDEX, type OrderBook, type Trade } from '../services/ValidatorDEXService';
import { logger } from '../utils/logger';

/**
 * WebSocket room configuration for subscriptions
 */
export interface WebSocketRoom {
  /** Room type for organizing subscriptions */
  type: 'orderbook' | 'trades' | 'orders';
  /** Trading pair for market data rooms */
  pair?: string;
  /** User ID for order update rooms */
  userId?: string;
}

/**
 * Order data structure for WebSocket order placement
 */
export interface OrderData {
  /** Order type - buy or sell */
  type: 'BUY' | 'SELL';
  /** Trading pair symbol */
  tokenPair: string;
  /** Order price */
  price: string;
  /** Order amount */
  amount: string;
  /** Order execution type */
  orderType: 'MARKET' | 'LIMIT';
  /** Optional maker address */
  maker?: string;
}

/**
 * Market update data structure for broadcasts
 */
export interface MarketUpdateData {
  /** Current market price */
  price?: string;
  /** Trading volume */
  volume?: string;
  /** Order book data */
  orderBook?: OrderBook;
  /** Recent trades */
  trades?: Trade[];
  /** Market ticker information */
  ticker?: {
    /** Trading pair symbol */
    symbol: string;
    /** Current price */
    price: string;
    /** Price change */
    change: string;
    /** Trading volume */
    volume: string;
  };
}

/**
 * Order cancellation data structure
 */
interface OrderCancellationData {
  /** Order ID to cancel */
  orderId: string;
  /** Maker address */
  maker: string;
}

/**
 * ValidatorWebSocketService - Manages real-time WebSocket connections for DEX
 * Provides order book updates, trade notifications, and order status updates
 * through Socket.IO WebSocket connections to the validator network.
 */
export class ValidatorWebSocketService {
  private io: SocketIOServer;
  private subscriptions: Map<string, () => void> = new Map();
  private connectedClients: Map<string, Set<string>> = new Map(); // socketId -> rooms
  
  /**
   * Creates a new ValidatorWebSocketService instance
   * @param io - Socket.IO server instance for WebSocket management
   */
  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupSocketHandlers();
  }
  
  /**
   * Set up Socket.IO event handlers
   * Configures all WebSocket event listeners for client connections
   * @returns void
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info('DEX WebSocket client connected', { socketId: socket.id });
      
      // Initialize client room set
      this.connectedClients.set(socket.id, new Set());
      
      // Handle subscription to order book updates
      socket.on('subscribe:orderbook', (pairs: string[]): void => {
        void Promise.resolve().then(async () => {
          try {
            for (const pair of pairs) {
              const room = `orderbook:${pair}`;
              void socket.join(room);
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
        }).catch((error) => {
          logger.error('Failed to subscribe to order book:', error);
          socket.emit('error', {
            type: 'subscription_failed',
            message: 'Failed to subscribe to order book'
          });
        });
      });
      
      // Handle unsubscription from order book
      socket.on('unsubscribe:orderbook', (pairs: string[]): void => {
        for (const pair of pairs) {
          const room = `orderbook:${pair}`;
          void socket.leave(room);
          this.connectedClients.get(socket.id)?.delete(room);
          
          // Check if room is empty and stop subscription
          this.checkAndStopSubscription(room);
        }
        
        socket.emit('unsubscribed', { type: 'orderbook', pairs });
      });
      
      // Handle subscription to trade updates
      socket.on('subscribe:trades', (pairs: string[]): void => {
        for (const pair of pairs) {
          const room = `trades:${pair}`;
          void socket.join(room);
          this.connectedClients.get(socket.id)?.add(room);
          
          // Start subscription if not already active
          if (!this.subscriptions.has(room)) {
            this.startTradeSubscription(pair);
          }
        }
        
        socket.emit('subscribed', { type: 'trades', pairs });
      });
      
      // Handle subscription to user's order updates
      socket.on('subscribe:orders', (userId: string): void => {
        const room = `orders:${userId}`;
        void socket.join(room);
        this.connectedClients.get(socket.id)?.add(room);
        
        socket.emit('subscribed', { type: 'orders', userId });
      });
      
      // Handle order placement through WebSocket
      socket.on('place:order', (orderData: OrderData, callback: (result: unknown) => void): void => {
        void Promise.resolve().then(async () => {
          try {
            const order = await validatorDEX.placeOrder({
              ...orderData,
              maker: orderData.maker ?? 'unknown'
            });
            
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
        }).catch((error) => {
          logger.error('Failed to place order via WebSocket:', error);
          callback({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to place order'
          });
        });
      });
      
      // Handle order cancellation
      socket.on('cancel:order', (data: OrderCancellationData, callback: (result: unknown) => void): void => {
        void Promise.resolve().then(async () => {
          try {
            const success = await validatorDEX.cancelOrder(data.orderId, data.maker);
            
            if (success === true) {
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
        }).catch((error) => {
          logger.error('Failed to cancel order via WebSocket:', error);
          callback({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel order'
          });
        });
      });
      
      // Handle disconnection
      socket.on('disconnect', (): void => {
        logger.info('DEX WebSocket client disconnected', { socketId: socket.id });
        
        // Clean up subscriptions
        const rooms = this.connectedClients.get(socket.id);
        if (rooms !== null && rooms !== undefined) {
          rooms.forEach(room => {
            void socket.leave(room);
            this.checkAndStopSubscription(room);
          });
          this.connectedClients.delete(socket.id);
        }
      });
    });
  }
  
  /**
   * Start order book subscription for a trading pair
   * Sets up real-time order book updates for the specified trading pair
   * @param pair - Trading pair to subscribe to
   * @returns void
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
   * Sets up real-time trade notifications for the specified trading pair
   * @param pair - Trading pair to subscribe to
   * @returns void
   */
  private startTradeSubscription(pair: string): void {
    const room = `trades:${pair}`;
    
    const unsubscribe: () => void = validatorDEX.subscribeToTrades(pair, (trade: Trade) => {
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
   * Stops subscription if no clients remain in the room
   * @param room - Room name to check
   * @returns void
   */
  private checkAndStopSubscription(room: string): void {
    // Check if any clients are still in the room
    const clients = this.io.sockets.adapter.rooms.get(room);
    
    if (clients === null || clients === undefined || clients.size === 0) {
      // Stop subscription
      const unsubscribe = this.subscriptions.get(room);
      if (unsubscribe !== null && unsubscribe !== undefined) {
        unsubscribe();
        this.subscriptions.delete(room);
        logger.info('Stopped subscription', { room });
      }
    }
  }
  
  /**
   * Broadcast market update to all clients
   * Sends market data updates to all connected WebSocket clients
   * @param pair - Trading pair for the market update
   * @param data - Market update data to broadcast
   * @returns void
   */
  public broadcastMarketUpdate(pair: string, data: MarketUpdateData): void {
    this.io.emit('market:update', {
      pair,
      data,
      timestamp: Date.now()
    });
  }
  
  /**
   * Broadcast system message
   * Sends system-wide messages to all connected clients
   * @param message - System message to broadcast
   * @param type - Message type for client categorization
   * @returns void
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
   * Returns the current number of connected WebSocket clients
   * @returns Number of connected clients
   */
  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
  
  /**
   * Get active subscriptions count
   * Returns the current number of active subscriptions
   * @returns Number of active subscriptions
   */
  public getActiveSubscriptionsCount(): number {
    return this.subscriptions.size;
  }
  
  /**
   * Cleanup resources
   * Cleans up all subscriptions and client connections
   * @returns void
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