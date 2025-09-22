/**
 * DEX Client
 *
 * Client for interacting with the OmniBazaar DEX API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * Trading pair information
 */
export interface TradingPair {
  /** Trading pair symbol (e.g., 'ETH/USDC') */
  symbol: string;
  /** Base asset symbol */
  baseAsset: string;
  /** Quote asset symbol */
  quoteAsset: string;
  /** Minimum order amount */
  minAmount: string;
  /** Maximum order amount */
  maxAmount: string;
  /** Price tick size */
  tickSize: string;
  /** Pair trading status */
  status: 'active' | 'inactive' | 'maintenance';
  /** Base asset decimals */
  baseDecimals?: number;
  /** Quote asset decimals */
  quoteDecimals?: number;
}

/**
 * Account balance information
 */
export interface Balance {
  /** Currency symbol */
  currency: string;
  /** Available balance */
  available: string;
  /** Locked balance in orders */
  locked: string;
  /** Total balance (available + locked) */
  total: string;
}

/**
 * Order request parameters
 */
export interface OrderRequest {
  /** Trading pair */
  pair: string;
  /** Order side */
  side: 'buy' | 'sell';
  /** Order type */
  type: 'limit' | 'market';
  /** Order price (required for limit orders) */
  price?: string;
  /** Order amount */
  amount: string;
  /** Post-only flag (maker only) */
  postOnly?: boolean;
  /** Time in force */
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

/**
 * Order information
 */
export interface Order {
  /** Order ID */
  id: string;
  /** Trading pair */
  pair: string;
  /** Order side */
  side: 'buy' | 'sell';
  /** Order type */
  type: 'limit' | 'market';
  /** Order status */
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';
  /** Order price */
  price: string;
  /** Order amount */
  amount: string;
  /** Filled amount */
  filled: string;
  /** Remaining amount */
  remaining: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Order book level
 */
export interface OrderBookLevel {
  /** Price level */
  price: string;
  /** Amount at this level */
  amount: string;
  /** Total amount up to this level */
  total: string;
}

/**
 * Order book snapshot
 */
export interface OrderBook {
  /** Trading pair */
  pair: string;
  /** Bid levels */
  bids: OrderBookLevel[];
  /** Ask levels */
  asks: OrderBookLevel[];
  /** Snapshot timestamp */
  timestamp: string;
}

/**
 * Ticker information
 */
export interface Ticker {
  /** Trading pair */
  pair: string;
  /** Last traded price */
  lastPrice: string;
  /** Best bid price */
  bidPrice: string;
  /** Best ask price */
  askPrice: string;
  /** 24h volume */
  volume24h: string;
  /** 24h high price */
  high24h: string;
  /** 24h low price */
  low24h: string;
  /** 24h price change */
  change24h: string;
  /** 24h price change percentage */
  changePercent24h: string;
  /** Update timestamp */
  timestamp: string;
}

/**
 * Swap quote request
 */
export interface SwapQuoteRequest {
  /** From token symbol */
  fromToken: string;
  /** To token symbol */
  toToken: string;
  /** Amount to swap */
  amount: string;
  /** Slippage tolerance (percentage) */
  slippage: number;
}

/**
 * Swap quote response
 */
export interface SwapQuote {
  /** From token */
  fromToken: string;
  /** To token */
  toToken: string;
  /** From amount */
  fromAmount: string;
  /** To amount */
  toAmount: string;
  /** Exchange rate */
  price: string;
  /** Price impact percentage */
  priceImpact: string;
  /** Minimum received amount */
  minimumReceived: string;
  /** Swap route */
  route: string[];
  /** Gas estimate */
  gas: string;
  /** Fee amount */
  fee: string;
  /** Quote expiry timestamp */
  expires: string;
  /** Quote ID */
  quoteId: string;
}

/**
 * DEX Client class for API interactions
 */
class DEXClient {
  private client: AxiosInstance;
  private authToken?: string;

  constructor(baseURL?: string) {
    this.client = axios.create({
      baseURL: baseURL || process.env.DEX_API_URL || 'http://localhost:3001/api/dex',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth
    this.client.interceptors.request.use((config) => {
      if (this.authToken) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.authToken = undefined;
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set authentication token
   * @param token - JWT auth token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Clear authentication token
   */
  clearAuthToken(): void {
    this.authToken = undefined;
  }

  /**
   * Get available trading pairs
   * @returns Array of trading pairs
   */
  async getTradingPairs(): Promise<TradingPair[]> {
    const response = await this.client.get<TradingPair[]>('/pairs');
    return response.data;
  }

  /**
   * Get account balances
   * @returns Array of balances
   */
  async getBalances(): Promise<Balance[]> {
    const response = await this.client.get<Balance[]>('/balances');
    return response.data;
  }

  /**
   * Place a new order
   * @param order - Order request parameters
   * @returns Created order
   */
  async placeOrder(order: OrderRequest): Promise<Order> {
    const response = await this.client.post<Order>('/orders', order);
    return response.data;
  }

  /**
   * Get open orders
   * @param pair - Optional trading pair filter
   * @returns Array of open orders
   */
  async getOpenOrders(pair?: string): Promise<Order[]> {
    const params = pair ? { pair } : undefined;
    const response = await this.client.get<Order[]>('/orders', { params });
    return response.data;
  }

  /**
   * Get order by ID
   * @param orderId - Order ID
   * @returns Order details
   */
  async getOrder(orderId: string): Promise<Order> {
    const response = await this.client.get<Order>(`/orders/${orderId}`);
    return response.data;
  }

  /**
   * Cancel order
   * @param orderId - Order ID to cancel
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.client.delete(`/orders/${orderId}`);
  }

  /**
   * Get order book for trading pair
   * @param pair - Trading pair
   * @param depth - Number of price levels
   * @returns Order book snapshot
   */
  async getOrderBook(pair: string, depth = 20): Promise<OrderBook> {
    const response = await this.client.get<OrderBook>(`/orderbook/${pair}`, {
      params: { depth },
    });
    return response.data;
  }

  /**
   * Get ticker information
   * @param pair - Trading pair
   * @returns Ticker data
   */
  async getTicker(pair: string): Promise<Ticker> {
    const response = await this.client.get<Ticker>(`/ticker/${pair}`);
    return response.data;
  }

  /**
   * Get swap quote
   * @param request - Swap quote request
   * @returns Swap quote
   */
  async getSwapQuote(request: SwapQuoteRequest): Promise<SwapQuote> {
    const response = await this.client.post<SwapQuote>('/swap/quote', request);
    return response.data;
  }
}

// Export singleton instance
export const dexClient = new DEXClient();

// Also export class for testing
export { DEXClient };