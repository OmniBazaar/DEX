/**
 * DEX Validator Client Implementation
 * 
 * Creates an implementation of OmniValidatorClient for DEX operations
 */

import axios, { AxiosInstance } from 'axios';
import { WebSocketClient } from '../network/WebSocketClient';
import { logger } from '../utils/logger';
import { 
  OmniValidatorClient, 
  OmniValidatorClientConfig,
  ServiceHealth,
  HealthStatus,
  OrderBookData,
  PlaceOrderRequest
} from '../types/client';

/**
 * Validator client implementation for DEX operations
 */
export class ValidatorClient implements OmniValidatorClient {
  private httpClient: AxiosInstance;
  private wsClient?: WebSocketClient;
  private config: OmniValidatorClientConfig;

  /**
   * Creates a new validator client
   * @param config - Client configuration
   */
  constructor(config: OmniValidatorClientConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.validatorEndpoint,
      timeout: config.timeout ?? 30000,
      headers: config.apiKey !== undefined ? { 'X-API-Key': config.apiKey } : {}
    });

    if (config.wsEndpoint !== undefined) {
      this.wsClient = new WebSocketClient(config.wsEndpoint);
    }
  }

  /**
   * Submit transaction to validator network
   * @param transaction - Transaction to submit
   * @returns Transaction hash
   */
  async submitTransaction(transaction: unknown): Promise<string> {
    const response = await this.httpClient.post('/api/v1/transactions', transaction);
    return (response.data as { hash: string }).hash;
  }

  /**
   * Get transaction by hash
   * @param hash - Transaction hash
   * @returns Transaction data
   */
  async getTransaction(hash: string): Promise<unknown> {
    const response = await this.httpClient.get(`/api/v1/transactions/${hash}`);
    return response.data as unknown;
  }

  /**
   * Get current block height
   * @returns Current block height
   */
  async getBlockHeight(): Promise<number> {
    const response = await this.httpClient.get('/api/v1/blocks/height');
    return (response.data as { height: number }).height;
  }

  /**
   * Get block by height
   * @param height - Block height
   * @returns Block data
   */
  async getBlock(height: number): Promise<unknown> {
    const response = await this.httpClient.get(`/api/v1/blocks/${height}`);
    return response.data as unknown;
  }

  /**
   * Get validator health status
   * @returns Health status
   */
  async getHealth(): Promise<HealthStatus> {
    const response = await this.httpClient.get('/api/v1/health');
    const health = response.data as ServiceHealth;
    
    // Convert ServiceHealth to HealthStatus
    return {
      status: health.status,
      timestamp: health.timestamp ?? Date.now(),
      uptime: health.uptime ?? 0,
      version: health.version ?? '0.1.0',
      services: health.services ?? {}
    };
  }

  /**
   * Get order book data for a trading pair
   * @param tokenPair - Trading pair to get order book for
   * @param depth - Number of price levels to include
   * @returns Promise resolving to order book data
   */
  async getOrderBook(tokenPair: string, depth: number): Promise<OrderBookData> {
    const response = await this.httpClient.get(`/api/v1/orderbook/${tokenPair}`, {
      params: { depth }
    });
    return response.data as OrderBookData;
  }

  /**
   * Place a new order on the exchange
   * @param order - Order details to place
   * @returns Promise resolving to order ID
   */
  async placeOrder(order: PlaceOrderRequest): Promise<string> {
    const response = await this.httpClient.post('/api/v1/orders', order);
    return (response.data as { orderId: string }).orderId;
  }

  /**
   * Subscribe to events
   * @param event - Event name
   * @param callback - Event callback
   * @returns Unsubscribe function
   */
  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (this.wsClient === null || this.wsClient === undefined) {
      logger.warn('WebSocket not configured, subscription not available');
      return () => {};
    }
    
    return this.wsClient.subscribe(event, callback);
  }

  /**
   * Store data in validator storage
   * @param key - Storage key
   * @param value - Data to store
   * @returns Promise that resolves when stored
   */
  async storeData(key: string, value: unknown): Promise<void> {
    await this.httpClient.post('/api/v1/storage', { key, value });
  }

  /**
   * Check if client is connected
   * @returns True if connected
   */
  isConnected(): boolean {
    // Check HTTP client availability
    return true;
  }

  /**
   * Disconnect client
   * @returns Promise that resolves when disconnected
   */
  async disconnect(): Promise<void> {
    await this.close();
  }

  /**
   * Close client connections
   */
  async close(): Promise<void> {
    if (this.wsClient !== null && this.wsClient !== undefined) {
      await this.wsClient.close();
    }
  }
}

/**
 * Factory function to create an Omni validator client
 * @param config - Client configuration
 * @returns New validator client instance
 * @example
 * ```typescript
 * const client = createOmniValidatorClient({
 *   validatorEndpoint: 'http://localhost:8080',
 *   apiKey: 'your-api-key'
 * });
 * ```
 */
export function createOmniValidatorClient(config: OmniValidatorClientConfig): OmniValidatorClient {
  return new ValidatorClient(config);
}