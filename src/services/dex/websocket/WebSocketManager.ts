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
export type SubscriptionCallback<T = unknown> = (data: T) => void;

/**
 * Ticker update data
 */
export interface TickerUpdate {
  /** Trading pair identifier */
  pair: string;
  /** Last trade price */
  lastPrice: string;
  /** Best bid price */
  bidPrice: string;
  /** Best ask price */
  askPrice: string;
  /** 24-hour volume */
  volume24h: string;
  /** 24-hour high */
  high24h: string;
  /** 24-hour low */
  low24h: string;
  /** 24-hour price change */
  change24h: string;
  /** 24-hour percentage change */
  changePercent24h: string;
  /** Timestamp of the update */
  timestamp: string;
}

/**
 * Order book update data
 */
export interface OrderBookUpdate {
  /** Trading pair identifier */
  pair: string;
  /** Bid orders */
  bids: Array<{ price: string; amount: string }>;
  /** Ask orders */
  asks: Array<{ price: string; amount: string }>;
  /** Sequence number for ordering */
  sequence: number;
  /** Update type */
  type: 'snapshot' | 'update';
}

/**
 * Trade data
 */
export interface Trade {
  /** Trade identifier */
  id: string;
  /** Trading pair */
  pair: string;
  /** Execution price */
  price: string;
  /** Trade amount */
  amount: string;
  /** Trade side */
  side: 'buy' | 'sell';
  /** Timestamp of the trade */
  timestamp: string;
}

/**
 * Order update data
 */
export interface OrderUpdate {
  /** Order identifier */
  id: string;
  /** Order status */
  status: string;
  /** Filled amount */
  filled: string;
  /** Remaining amount */
  remaining: string;
  /** Timestamp of update */
  timestamp: string;
}

/**
 * Balance update data
 */
export interface BalanceUpdate {
  /** Currency symbol */
  currency: string;
  /** Available balance */
  available: string;
  /** Locked balance */
  locked: string;
  /** Total balance */
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
  private reconnectEnabled = true;

  /**
   * Creates a new WebSocket manager instance
   * @param url - Optional WebSocket URL
   */
  constructor(url?: string) {
    super();
    const envUrl = process.env['DEX_WS_URL'];
    this.url = url !== undefined && url !== '' ? url : (envUrl !== undefined && envUrl !== '' ? envUrl : 'ws://localhost:3001/ws');
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
        if (authToken !== undefined && authToken !== '') {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        this.ws = new WebSocket(this.url, { headers });

        // Track if we've resolved/rejected to avoid double handling
        let handled = false;

        const cleanup = (): void => {
          // Remove all listeners to prevent memory leaks
          this.ws?.removeAllListeners();
        };

        this.ws.on('open', () => {
          if (handled) return;
          handled = true;

          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit('connected');
          this.startPing();

          // Resubscribe to all active subscriptions
          this.resubscribe();

          resolve();
        });

        this.ws.on('message', (data: Buffer | string) => {
          try {
            const message = JSON.parse(data.toString()) as Record<string, unknown>;
            this.handleMessage(message);
          } catch (_error: unknown) {
            // Failed to parse WebSocket message - ignore malformed messages
          }
        });

        this.ws.on('close', () => {
          this.stopPing();
          this.emit('disconnected');

          if (!this.isReconnecting && this.reconnectEnabled) {
            this.reconnect();
          }
        });

        this.ws.on('error', (error) => {
          // During connection, reject the promise
          if (!handled) {
            handled = true;
            cleanup();
            reject(error);
          }
          // After connection, emit the error for listeners
          else {
            this.emit('error', error);
          }
        });

        // Add timeout for connection
        setTimeout(() => {
          if (!handled) {
            handled = true;
            cleanup();
            this.ws?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000); // 10 second timeout
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.reconnectEnabled = false;
    this.isReconnecting = false;
    this.stopPing();

    if (this.ws !== undefined) {
      this.ws.close();
      this.ws = undefined;
    }

    this.subscriptions.clear();
    this.removeAllListeners();
  }

  /**
   * Check if connected
   * @returns True if WebSocket is connected
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
  private send(message: Record<string, unknown>): void {
    if (this.ws !== undefined && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Handle incoming message
   * @param message - Received message
   */
  private handleMessage(message: Record<string, unknown>): void {
    const channel = message['channel'] as string | undefined;
    const data = message['data'];
    const type = message['type'] as string | undefined;

    if (channel !== undefined) {
      const callbacks = this.subscriptions.get(channel);
      if (callbacks !== undefined) {
        callbacks.forEach(callback => callback(data));
      }
    }

    // Also emit typed events
    if (type !== undefined) {
      this.emit(type, data);
    }
  }

  /**
   * Subscribe to channel
   * @param channel - Channel name
   * @param callback - Callback function
   */
  private subscribe<T>(channel: string, callback: SubscriptionCallback<T>): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    const callbacks = this.subscriptions.get(channel);
    if (callbacks !== undefined) {
      // Cast is safe because we control how callbacks are added and invoked
      callbacks.add(callback as SubscriptionCallback<unknown>);
    }
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
      if (this.ws !== undefined && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  /**
   * Reconnect to WebSocket server
   */
  private reconnect(): void {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      this.connect(this.authToken)
        .then(() => {
          // Reconnection successful
        })
        .catch((_error: unknown) => {
          // Reconnection failed, try again
          this.isReconnecting = false;
          void this.reconnect();
        });
    }, delay);
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager();

// Also export class for testing
export { WebSocketManager as WSManager };