/**
 * WebSocket Manager
 *
 * Manages WebSocket connections for real-time DEX updates
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

/**
 * WebSocket message types
 */
export type MessageType = 'ticker' | 'orderbook' | 'trades' | 'orders' | 'balances';

/**
 * WebSocket subscription callback
 */
export type SubscriptionCallback<T = any> = (data: T) => void;

/**
 * Ticker update data
 */
export interface TickerUpdate {
  pair: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  volume24h: string;
  high24h: string;
  low24h: string;
  change24h: string;
  changePercent24h: string;
  timestamp: string;
}

/**
 * Order book update data
 */
export interface OrderBookUpdate {
  pair: string;
  bids: Array<{ price: string; amount: string }>;
  asks: Array<{ price: string; amount: string }>;
  sequence: number;
  type: 'snapshot' | 'update';
}

/**
 * Trade data
 */
export interface Trade {
  id: string;
  pair: string;
  price: string;
  amount: string;
  side: 'buy' | 'sell';
  timestamp: string;
}

/**
 * Order update data
 */
export interface OrderUpdate {
  id: string;
  status: string;
  filled: string;
  remaining: string;
  timestamp: string;
}

/**
 * Balance update data
 */
export interface BalanceUpdate {
  currency: string;
  available: string;
  locked: string;
  total: string;
}

/**
 * WebSocket Manager class
 */
export class WebSocketManager extends EventEmitter {
  private ws?: WebSocket;
  private url: string;
  private authToken?: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions = new Map<string, Set<SubscriptionCallback>>();
  private pingInterval?: NodeJS.Timeout;
  private isReconnecting = false;

  constructor(url?: string) {
    super();
    this.url = url || process.env.DEX_WS_URL || 'ws://localhost:3001/ws';
  }

  /**
   * Connect to WebSocket server
   * @param authToken - Optional authentication token
   */
  async connect(authToken?: string): Promise<void> {
    this.authToken = authToken;

    return new Promise((resolve, reject) => {
      try {
        const headers: Record<string, string> = {};
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`;
        }

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit('connected');
          this.startPing();

          // Resubscribe to all active subscriptions
          this.resubscribe();

          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        });

        this.ws.on('close', () => {
          this.stopPing();
          this.emit('disconnected');

          if (!this.isReconnecting) {
            this.reconnect();
          }
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isReconnecting = false;
    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.subscriptions.clear();
    this.removeAllListeners();
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to ticker updates
   * @param pair - Trading pair
   * @param callback - Update callback
   */
  subscribeTicker(pair: string, callback: SubscriptionCallback<TickerUpdate>): void {
    const channel = `ticker:${pair}`;
    this.subscribe(channel, callback);

    if (this.isConnected) {
      this.send({
        type: 'subscribe',
        channel: 'ticker',
        pair,
      });
    }
  }

  /**
   * Subscribe to order book updates
   * @param pair - Trading pair
   * @param callback - Update callback
   */
  subscribeOrderBook(pair: string, callback: SubscriptionCallback<OrderBookUpdate>): void {
    const channel = `orderbook:${pair}`;
    this.subscribe(channel, callback);

    if (this.isConnected) {
      this.send({
        type: 'subscribe',
        channel: 'orderbook',
        pair,
      });
    }
  }

  /**
   * Subscribe to trades
   * @param pair - Trading pair
   * @param callback - Update callback
   */
  subscribeTrades(pair: string, callback: SubscriptionCallback<Trade[]>): void {
    const channel = `trades:${pair}`;
    this.subscribe(channel, callback);

    if (this.isConnected) {
      this.send({
        type: 'subscribe',
        channel: 'trades',
        pair,
      });
    }
  }

  /**
   * Subscribe to order updates
   * @param callback - Update callback
   */
  subscribeOrders(callback: SubscriptionCallback<OrderUpdate>): void {
    const channel = 'orders';
    this.subscribe(channel, callback);

    if (this.isConnected) {
      this.send({
        type: 'subscribe',
        channel: 'orders',
      });
    }
  }

  /**
   * Subscribe to balance updates
   * @param callback - Update callback
   */
  subscribeBalances(callback: SubscriptionCallback<BalanceUpdate[]>): void {
    const channel = 'balances';
    this.subscribe(channel, callback);

    if (this.isConnected) {
      this.send({
        type: 'subscribe',
        channel: 'balances',
      });
    }
  }

  /**
   * Unsubscribe from channel
   * @param channel - Channel to unsubscribe from
   */
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);

    if (this.isConnected) {
      // Parse channel type and pair
      const [type, pair] = channel.split(':');
      this.send({
        type: 'unsubscribe',
        channel: type,
        pair,
      });
    }
  }

  /**
   * Send message to server
   * @param message - Message to send
   */
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Handle incoming message
   * @param message - Received message
   */
  private handleMessage(message: any): void {
    const { channel, data } = message;

    if (channel) {
      const callbacks = this.subscriptions.get(channel);
      if (callbacks) {
        callbacks.forEach(callback => callback(data));
      }
    }

    // Also emit typed events
    if (message.type) {
      this.emit(message.type, data);
    }
  }

  /**
   * Subscribe to channel
   * @param channel - Channel name
   * @param callback - Callback function
   */
  private subscribe(channel: string, callback: SubscriptionCallback): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(callback);
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  private resubscribe(): void {
    for (const channel of this.subscriptions.keys()) {
      const [type, pair] = channel.split(':');
      this.send({
        type: 'subscribe',
        channel: type,
        pair,
      });
    }
  }

  /**
   * Start ping interval
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  /**
   * Reconnect to WebSocket server
   */
  private async reconnect(): Promise<void> {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(async () => {
      try {
        await this.connect(this.authToken);
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.isReconnecting = false;
        this.reconnect();
      }
    }, delay);
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager();

// Also export class for testing
export { WebSocketManager as WSManager };