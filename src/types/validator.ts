/**
 * Unified Validator Types and Interfaces
 * 
 * Comprehensive type definitions for the OmniBazaar Unified Validator DEX
 */

/**
 * Hardware configuration requirements for validator nodes
 */
export interface HardwareConfig {
  /** Available CPU cores (minimum 4) */
  cores: number;
  /** Available RAM in GB (minimum 8) */
  memory: number;
  /** Available storage in GB (minimum 100) */
  storage: number;
  /** Network bandwidth in Mbps (minimum 50) */
  bandwidth: number;
}

/**
 * Blockchain network configuration for validator connections
 */
export interface BlockchainConfig {
  /** Network identifier (e.g., 'omnibazaar-mainnet') */
  networkId: string;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Chain ID for OmniCoin network */
  chainId: number;
  /** Minimum stake required (e.g., '1000') */
  validatorStake: string;
  /** BFT consensus threshold (e.g., 0.67) */
  consensusThreshold: number;
}

/**
 * DEX trading configuration and parameters
 */
export interface DEXConfig {
  /** Supported trading pairs */
  tradingPairs: string[];
  /** Fee configuration */
  feeStructure: FeeStructure;
  /** Maximum leverage for perpetuals */
  maxLeverage: number;
  /** Liquidation threshold */
  liquidationThreshold: number;
}

/**
 * Fee structure configuration for different order types
 */
export interface FeeStructure {
  /** Spot maker fee (e.g., 0.001 = 0.1%) */
  spotMaker: number;
  /** Spot taker fee (e.g., 0.002 = 0.2%) */
  spotTaker: number;
  /** Perpetual maker fee (e.g., 0.0005 = 0.05%) */
  perpetualMaker: number;
  /** Perpetual taker fee (e.g., 0.0015 = 0.15%) */
  perpetualTaker: number;
  /** Auto-conversion fee (e.g., 0.003 = 0.3%) */
  autoConversion: number;
}

/**
 * IPFS node configuration for distributed storage
 */
export interface IPFSConfig {
  /** IPFS repository path */
  repo: string;
  /** Swarm port (default 4001) */
  swarmPort: number;
  /** API port (default 5001) */
  apiPort: number;
  /** Gateway port (default 8080) */
  gatewayPort: number;
  /** Bootstrap node addresses */
  bootstrapNodes: string[];
  /** Storage quota in GB */
  storageQuota: number;
}

/**
 * Chat service configuration and limits
 */
export interface ChatConfig {
  /** Maximum concurrent connections */
  maxConnections: number;
  /** Message retention in days */
  messageRetention: number;
  /** Enable end-to-end encryption */
  encryptionEnabled: boolean;
  /** Enable automatic moderation */
  moderationEnabled: boolean;
}

/**
 * Configuration for fee distribution among stakeholders
 */
export interface FeeDistributionConfig {
  /** Validator share (e.g., 0.70 = 70%) */
  validatorShare: number;
  /** Company share (e.g., 0.20 = 20%) */
  companyShare: number;
  /** Development fund share (e.g., 0.10 = 10%) */
  developmentShare: number;
  /** Distribution interval in seconds */
  distributionInterval: number;
}

/**
 * Network configuration for validator node communication
 */
export interface ValidatorNetworkConfig {
  /** Unique validator node identifier */
  nodeId: string;
  /** Other validator endpoints */
  networkEndpoints: string[];
  /** Heartbeat interval in seconds */
  heartbeatInterval: number;
  /** Minimum participation score */
  participationScoreThreshold: number;
}

/**
 * Security settings for authentication and rate limiting
 */
export interface SecurityConfig {
  /** JWT signing secret */
  jwtSecret: string;
  /** Data encryption key */
  encryptionKey: string;
  /** Rate limit window in milliseconds */
  rateLimitWindowMs: number;
  /** Maximum requests per window */
  rateLimitMaxRequests: number;
}

/**
 * OmniBazaar service integration endpoints
 */
export interface OmniBazaarConfig {
  /** Wallet service API URL */
  walletApiUrl: string;
  /** Marketplace service API URL */
  marketplaceApiUrl: string;
  /** Storage service API URL */
  storageApiUrl: string;
  /** KYC service API URL */
  kycServiceUrl: string;
}

/**
 * Main validator configuration combining all service settings
 */
export interface ValidatorConfig {
  /** HTTP server port */
  port: number;
  /** WebSocket server port */
  wsPort: number;
  /** Environment (development, staging, production) */
  environment: string;
  /** Hardware configuration requirements */
  hardware: HardwareConfig;
  /** Blockchain network configuration */
  blockchain: BlockchainConfig;
  /** DEX trading configuration */
  dex: DEXConfig;
  /** IPFS storage configuration */
  ipfs: IPFSConfig;
  /** Chat service configuration */
  chat: ChatConfig;
  /** Fee distribution settings */
  feeDistribution: FeeDistributionConfig;
  /** Validator network settings */
  validator: ValidatorNetworkConfig;
  /** Security and authentication settings */
  security: SecurityConfig;
  /** OmniBazaar service integration */
  omnibazaar: OmniBazaarConfig;
}

/**
 * Health status information for validator services
 */
export interface ServiceHealth {
  /** Current health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Service uptime in seconds */
  uptime: number;
  /** Last health check timestamp */
  lastCheck: number;
  /** Additional health details */
  details?: Record<string, unknown>;
}

/**
 * Resource usage metrics for system monitoring
 */
export interface ResourceUsage {
  /** CPU usage metrics */
  cpu: {
    /** CPU usage percentage */
    usage: number;
    /** Available cores */
    cores: number;
  };
  /** Memory usage metrics */
  memory: {
    /** Used memory in GB */
    used: number;
    /** Total memory in GB */
    total: number;
    /** Memory usage percentage */
    usage: number;
  };
  /** Storage usage metrics */
  storage: {
    /** Used storage in GB */
    used: number;
    /** Total storage in GB */
    total: number;
    /** Storage usage percentage */
    usage: number;
  };
  /** Network bandwidth usage */
  network: {
    /** Inbound bandwidth usage in Mbps */
    inbound: number;
    /** Outbound bandwidth usage in Mbps */
    outbound: number;
  };
}

/**
 * Supported order types in the DEX
 */
export type OrderType = 
  | 'MARKET' 
  | 'LIMIT' 
  | 'STOP_LOSS' 
  | 'STOP_LIMIT' 
  | 'TRAILING_STOP' 
  | 'OCO' 
  | 'ICEBERG' 
  | 'TWAP' 
  | 'VWAP';

/**
 * Order side direction for buy or sell
 */
export type OrderSide = 'BUY' | 'SELL';
/**
 * Order status lifecycle states
 */
export type OrderStatus = 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
/**
 * Time in force options for order execution
 */
export type TimeInForce = 'GTC' | 'DAY' | 'IOC' | 'FOK';

/**
 * Complete order structure for DEX trading
 */
export interface Order {
  /** Unique order identifier */
  id: string;
  /** Order type (market, limit, etc.) */
  type: OrderType;
  /** Order side (buy or sell) */
  side: OrderSide;
  /** Trading pair symbol */
  pair: string;
  /** Order quantity */
  quantity: string;
  /** Order price (for limit orders) */
  price?: string;
  /** Stop price (for stop orders) */
  stopPrice?: string;
  /** Time in force policy */
  timeInForce: TimeInForce;
  /** Leverage multiplier (for margin/perpetual) */
  leverage?: number;
  /** Reduce-only flag for position reduction */
  reduceOnly?: boolean;
  /** Post-only flag for maker orders */
  postOnly?: boolean;
  /** User identifier */
  userId: string;
  /** Current order status */
  status: OrderStatus;
  /** Filled quantity */
  filled: string;
  /** Remaining quantity */
  remaining: string;
  /** Average fill price */
  averagePrice?: string;
  /** Total fees paid */
  fees: string;
  /** Order creation timestamp */
  timestamp: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Executed trade record with complete transaction details
 */
export interface Trade {
  /** Unique trade identifier */
  id: string;
  /** Associated order identifier */
  orderId: string;
  /** Trading pair symbol */
  pair: string;
  /** Trade side (buy or sell) */
  side: OrderSide;
  /** Trade quantity */
  quantity: string;
  /** Trade execution price */
  price: string;
  /** Quote asset quantity */
  quoteQuantity: string;
  /** Trade fee amount */
  fee: string;
  /** Asset used to pay fee */
  feeAsset: string;
  /** User identifier */
  userId: string;
  /** Trade execution timestamp */
  timestamp: number;
  /** Whether buyer was the maker */
  isBuyerMaker: boolean;
}

/**
 * Perpetual contract specification and current market data
 */
export interface PerpetualContract {
  /** Contract symbol (e.g., BTCUSDT) */
  symbol: string;
  /** Base asset symbol */
  baseAsset: string;
  /** Quote asset symbol */
  quoteAsset: string;
  /** Current mark price */
  markPrice: number;
  /** Current index price */
  indexPrice: number;
  /** Last funding rate applied */
  lastFundingRate: number;
  /** Next funding time timestamp */
  nextFundingTime: number;
  /** Current interest rate */
  interestRate: number;
  /** Premium index value */
  premiumIndex: number;
  /** Maximum leverage allowed */
  maxLeverage: number;
  /** Minimum order size */
  minOrderSize: string;
  /** Contract trading status */
  status: 'TRADING' | 'HALT' | 'MAINTENANCE';
}

/**
 * Trading position in perpetual contracts
 */
export interface Position {
  /** Contract symbol */
  contract: string;
  /** Position side (long or short) */
  side: 'LONG' | 'SHORT';
  /** Position size */
  size: string;
  /** Average entry price */
  entryPrice: string;
  /** Current mark price */
  markPrice: string;
  /** Current leverage */
  leverage: number;
  /** Initial margin required */
  margin: string;
  /** Unrealized profit/loss */
  unrealizedPnL: string;
  /** Liquidation price threshold */
  liquidationPrice: string;
  /** Funding payment amount */
  fundingPayment: string;
  /** Last funding payment timestamp */
  lastFundingTime: number;
}

/**
 * Asset balance information for user portfolios
 */
export interface Balance {
  /** Asset symbol */
  asset: string;
  /** Available balance */
  free: string;
  /** Locked balance */
  locked: string;
  /** Total balance */
  total: string;
}

/**
 * Complete user portfolio with balances and positions
 */
export interface Portfolio {
  /** Asset balances */
  balances: Balance[];
  /** Open positions */
  positions: Position[];
  /** Open orders */
  openOrders: Order[];
  /** Total portfolio value */
  totalValue: string;
  /** Total unrealized PnL */
  unrealizedPnL: string;
  /** Available margin for new positions */
  availableMargin: string;
  /** Margin used in positions */
  usedMargin: string;
  /** Current margin ratio */
  marginRatio: number;
}

/**
 * Single price level in the order book
 */
export interface OrderBookLevel {
  /** Price level */
  price: string;
  /** Quantity at this price level */
  quantity: string;
}

/**
 * Complete order book snapshot at a point in time
 */
export interface OrderBookSnapshot {
  /** Trading pair symbol */
  pair: string;
  /** Buy orders (bids) */
  bids: OrderBookLevel[];
  /** Sell orders (asks) */
  asks: OrderBookLevel[];
  /** Snapshot timestamp */
  timestamp: number;
  /** Sequence number for ordering */
  sequence: number;
}

/**
 * 24-hour ticker statistics for a trading pair
 */
export interface Ticker {
  /** Trading pair symbol */
  symbol: string;
  /** Last trade price */
  lastPrice: string;
  /** 24h price change */
  priceChange: string;
  /** 24h price change percentage */
  priceChangePercent: string;
  /** 24h highest price */
  high24h: string;
  /** 24h lowest price */
  low24h: string;
  /** 24h base asset volume */
  volume24h: string;
  /** 24h quote asset volume */
  quoteVolume24h: string;
  /** Opening price */
  openPrice: string;
  /** Closing price */
  closePrice: string;
  /** First trade ID in period */
  firstTradeId: string;
  /** Last trade ID in period */
  lastTradeId: string;
  /** Number of trades in period */
  tradeCount: number;
  /** Statistics timestamp */
  timestamp: number;
}

/**
 * OHLC candlestick data for chart visualization
 */
export interface Candle {
  /** Candle opening timestamp */
  openTime: number;
  /** Opening price */
  open: string;
  /** Highest price */
  high: string;
  /** Lowest price */
  low: string;
  /** Closing price */
  close: string;
  /** Base asset volume */
  volume: string;
  /** Candle closing timestamp */
  closeTime: number;
  /** Quote asset volume */
  quoteVolume: string;
  /** Number of trades */
  trades: number;
  /** Taker buy base volume */
  baseAssetVolume: string;
  /** Taker buy quote volume */
  quoteAssetVolume: string;
}

/**
 * Fee distribution record for a specific period
 */
export interface FeeDistribution {
  /** Total fees collected */
  totalFees: string;
  /** Fees allocated to validators */
  validatorFees: string;
  /** Fees allocated to company */
  companyFees: string;
  /** Fees allocated to development */
  developmentFees: string;
  /** Distribution period */
  period: {
    /** Period start timestamp */
    start: number;
    /** Period end timestamp */
    end: number;
  };
  /** Fee recipients list */
  recipients: {
    /** Validator identifier */
    validatorId: string;
    /** Fee amount received */
    amount: string;
    /** Share percentage */
    share: number;
  }[];
}

/**
 * Economic metrics and earnings for a validator
 */
export interface ValidatorEconomics {
  /** Monthly revenue earned */
  monthlyRevenue: string;
  /** Total fees generated */
  totalFeesGenerated: string;
  /** Validator's share of fees */
  validatorShare: string;
  /** Current participation score */
  participationScore: number;
  /** Node uptime percentage */
  uptime: number;
  /** Next distribution timestamp */
  nextDistribution: number;
}

/**
 * Network-wide statistics and metrics
 */
export interface NetworkStats {
  /** Total number of validators */
  totalValidators: number;
  /** Number of active validators */
  activeValidators: number;
  /** Total amount staked */
  totalStaked: string;
  /** Network hashrate */
  networkHashrate: string;
  /** Average block time in seconds */
  averageBlockTime: number;
  /** Total transactions in 24h */
  totalTransactions24h: number;
  /** Total trading volume in 24h */
  totalVolume24h: string;
  /** Total fees collected in 24h */
  totalFees24h: string;
}

/**
 * Chat message structure for P2P communication
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Channel identifier */
  channel: string;
  /** Sender user identifier */
  sender: string;
  /** Message content */
  content: string;
  /** Whether message is encrypted */
  encrypted: boolean;
  /** Message timestamp */
  timestamp: number;
  /** Whether message was edited */
  edited?: boolean;
  /** Edit timestamp */
  editedAt?: number;
  /** Message being replied to */
  replyTo?: string;
  /** Type of message content */
  messageType: 'text' | 'image' | 'file' | 'trade' | 'system';
}

/**
 * Chat channel configuration and participant management
 */
export interface ChatChannel {
  /** Unique channel identifier */
  id: string;
  /** Channel display name */
  name: string;
  /** Channel type */
  type: 'public' | 'private' | 'trading' | 'direct';
  /** Channel description */
  description?: string;
  /** List of participant user IDs */
  participants: string[];
  /** List of moderator user IDs */
  moderators: string[];
  /** Channel configuration */
  settings: {
    /** Whether messages are encrypted */
    encrypted: boolean;
    /** Whether messages are stored */
    persistent: boolean;
    /** Whether channel is moderated */
    moderated: boolean;
    /** Maximum participants allowed */
    maxParticipants?: number;
  };
  /** Channel creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
}

/**
 * IPFS file metadata and storage information
 */
export interface IPFSFile {
  /** IPFS content hash */
  hash: string;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** MIME content type */
  contentType: string;
  /** User who uploaded the file */
  uploadedBy: string;
  /** Upload timestamp */
  uploadedAt: number;
  /** Whether file is publicly accessible */
  public: boolean;
  /** Whether file is encrypted */
  encrypted: boolean;
  /** Number of storage replicas */
  replicas: number;
}

/**
 * Storage quota and usage statistics
 */
export interface StorageQuota {
  /** Storage space used in bytes */
  used: number;
  /** Total storage quota in bytes */
  total: number;
  /** Available storage space in bytes */
  available: number;
  /** Number of files stored */
  files: number;
  /** Bandwidth usage statistics */
  bandwidth: {
    /** Bandwidth used in bytes */
    used: number;
    /** Bandwidth limit in bytes */
    limit: number;
  };
}

/**
 * Validator network event for monitoring and logging
 */
export interface ValidatorEvent {
  /** Event type */
  type: 'validator-joined' | 'validator-left' | 'consensus-reached' | 'block-produced' | 'fees-distributed';
  /** Validator identifier */
  validatorId: string;
  /** Event timestamp */
  timestamp: number;
  /** Additional event data */
  data: Record<string, unknown>;
}

/**
 * Standard API response wrapper with success/error handling
 * @template T - Type of the response data
 */
export interface APIResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data payload */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Additional response message */
  message?: string;
  /** Response timestamp */
  timestamp: number;
}

/**
 * Paginated API response with total count and pagination info
 * @template T - Type of the paginated items
 */
export interface PaginatedResponse<T> extends APIResponse<T[]> {
  /** Total number of items */
  total: number;
  /** Maximum items per page */
  limit: number;
  /** Number of items to skip */
  offset: number;
}

/**
 * Base validator error class with status codes
 */
export class ValidatorError extends Error {
  /**
   * Creates a new ValidatorError
   * @param message - Error message describing the issue
   * @param code - Error code for categorization
   * @param statusCode - HTTP status code (default 500)
   */
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ValidatorError';
  }
}

/**
 * Order-specific error for trading operations
 */
export class OrderError extends ValidatorError {
  /**
   * Creates a new OrderError
   * @param message - Error message describing the order issue
   * @param code - Error code (default 'ORDER_ERROR')
   */
  constructor(message: string, code: string = 'ORDER_ERROR') {
    super(message, code, 400);
    this.name = 'OrderError';
  }
}

/**
 * Error thrown when user has insufficient balance for an operation
 */
export class InsufficientBalanceError extends OrderError {
  /**
   * Creates an error for insufficient balance
   * @param asset - Asset symbol that is insufficient
   * @param required - Required amount for the operation
   * @param available - Available amount in the account
   */
  constructor(asset: string, required: string, available: string) {
    super(
      `Insufficient ${asset} balance. Required: ${required}, Available: ${available}`,
      'INSUFFICIENT_BALANCE'
    );
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Error thrown for invalid trading pairs
 */
export class InvalidPairError extends OrderError {
  /**
   * Creates an error for invalid trading pair
   * @param pair - Invalid trading pair symbol
   */
  constructor(pair: string) {
    super(`Invalid trading pair: ${pair}`, 'INVALID_PAIR');
    this.name = 'InvalidPairError';
  }
}

/**
 * Error thrown when attempting to trade on closed markets
 */
export class MarketClosedError extends OrderError {
  /**
   * Creates an error for closed market
   * @param pair - Trading pair that is closed
   */
  constructor(pair: string) {
    super(`Market closed for pair: ${pair}`, 'MARKET_CLOSED');
    this.name = 'MarketClosedError';
  }
}

/**
 * Utility type to make all properties optional recursively
 * @template T - Type to make partially optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Utility type to make specific fields required while keeping others optional
 * @template T - Base type
 * @template K - Keys to make required
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Unix timestamp in milliseconds
 */
export type Timestamp = number;
/**
 * Cryptographic hash string (typically hex-encoded)
 */
export type Hash = string;
/**
 * Blockchain address string
 */
export type Address = string;
/**
 * Large number represented as string to avoid precision loss
 */
export type BigNumberString = string; 