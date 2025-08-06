/**
 * DEX Client Types
 * 
 * Type definitions for DEX client integrations
 */

import { OrderBookLevel } from './validator';

/**
 * Configuration for connecting to an Avalanche validator client
 */
export interface AvalancheValidatorClientConfig {
  /** URL endpoint for the validator service */
  validatorEndpoint: string;
  /** Optional WebSocket endpoint for real-time updates */
  wsEndpoint?: string;
  /** Optional API key for authentication */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts for failed requests (default: 3) */
  retryAttempts?: number;
}

/**
 * Health status information for validator services
 */
export interface HealthStatus {
  /** Status of individual services */
  services: {
    /** Order book service availability */
    orderBook: boolean;
    /** Trading service availability */
    trading: boolean;
    /** Storage service availability */
    storage: boolean;
    /** Chat service availability */
    chat: boolean;
  };
  /** System uptime in seconds */
  uptime: number;
  /** Current system version */
  version: string;
}

/**
 * Order book data with bids, asks, and price information
 */
export interface OrderBookData {
  /** Array of bid orders sorted by price descending */
  bids: OrderBookLevel[];
  /** Array of ask orders sorted by price ascending */
  asks: OrderBookLevel[];
  /** Current bid-ask spread */
  spread: string;
  /** Mid-market price between best bid and ask */
  midPrice: string;
}

/**
 * Request parameters for placing a new order
 */
export interface PlaceOrderRequest {
  /** Order type: BUY or SELL */
  type: 'BUY' | 'SELL';
  /** Trading pair (e.g., 'XOM/USDC') */
  tokenPair: string;
  /** Order price in quote currency */
  price: string;
  /** Order amount in base currency */
  amount: string;
  /** Address of the order maker */
  maker: string;
}

/**
 * Interface for interacting with Avalanche validator client
 * @example
 * ```typescript
 * const client = new AvalancheValidatorClient(config);
 * const health = await client.getHealth();
 * const orderBook = await client.getOrderBook('XOM/USDC', 10);
 * ```
 */
export interface AvalancheValidatorClient {
  /**
   * Get health status of all validator services
   * @returns Promise resolving to health status information
   */
  getHealth(): Promise<HealthStatus>;
  /**
   * Get order book data for a trading pair
   * @param tokenPair - Trading pair to get order book for
   * @param depth - Number of price levels to include
   * @returns Promise resolving to order book data
   */
  getOrderBook(tokenPair: string, depth: number): Promise<OrderBookData>;
  /**
   * Place a new order on the exchange
   * @param order - Order details to place
   * @returns Promise resolving to order ID
   * @throws {OrderError} If order parameters are invalid
   */
  placeOrder(order: PlaceOrderRequest): Promise<string>;
  /**
   * Close the client connection and cleanup resources
   * @returns Promise that resolves when client is closed
   */
  close(): Promise<void>;
}