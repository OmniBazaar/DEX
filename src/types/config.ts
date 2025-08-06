/**
 * Configuration type definitions for Unified Validator DEX
 * 
 * ✅ Unified validator architecture with modest hardware requirements
 * ✅ IPFS distributed storage (no PostgreSQL/Redis)
 * ✅ Early on-chain settlement
 * ✅ 70% fee distribution to validators
 */

/**
 * Re-export core configuration types from validator.ts for compatibility
 */
export type { ValidatorConfig, HardwareConfig, BlockchainConfig, DEXConfig as UnifiedDEXConfig } from './validator';

/**
 * Legacy DEX configuration interface for backward compatibility
 * @deprecated Use ValidatorConfig from './validator' instead
 */
export interface DEXConfig {
  /** HTTP server port */
  port: number;
  /** WebSocket server port */
  wsPort: number;
  /** Runtime environment (development, production, etc.) */
  environment: string;
  
  /** Unified validator network configuration */
  validator: {
    /** Network identifier */
    networkId: string;
    /** Other validator node endpoints */
    nodeEndpoints: string[];
    /** BFT consensus threshold (0-1) */
    consensusThreshold: number;
    /** Bootstrap nodes for network discovery */
    bootstrapNodes: string[];
  };
  
  /** IPFS configuration (replaces centralized database) */
  ipfs: {
    /** IPFS repository path */
    repo: string;
    /** Swarm port for peer communication */
    swarmPort: number;
    /** API port for IPFS operations */
    apiPort: number;
    /** Gateway port for HTTP access */
    gatewayPort: number;
    /** Bootstrap nodes for IPFS network */
    bootstrapNodes: string[];
  };
  
  /** OmniCoin blockchain configuration */
  omnicoin: {
    /** Main OmniCoin contract address */
    contractAddress: string;
    /** Staking contract address */
    stakingContractAddress: string;
    /** RPC endpoint URL */
    rpcUrl: string;
    /** Chain ID for OmniCoin network */
    chainId: number;
    /** Minimum amount for auto-conversion */
    minimumConversionAmount: string;
  };
  
  /** OmniBazaar service integration URLs */
  omnibazaar: {
    /** Wallet service API URL */
    walletApiUrl: string;
    /** Marketplace service API URL */
    marketplaceApiUrl: string;
    /** Storage service API URL */
    storageApiUrl: string;
    /** Validator service API URL */
    validatorApiUrl: string;
  };
  
  /** Security and authentication configuration */
  security: {
    /** JWT signing secret */
    jwtSecret: string;
    /** Data encryption key */
    encryptionKey: string;
    /** Rate limit window in milliseconds */
    rateLimitWindowMs: number;
    /** Maximum requests per rate limit window */
    rateLimitMaxRequests: number;
  };
  
  /** Trading behavior configuration */
  trading: {
    /** Default slippage tolerance (0-1) */
    defaultSlippageTolerance: number;
    /** Maximum allowed slippage tolerance (0-1) */
    maxSlippageTolerance: number;
    /** Auto-conversion timeout in seconds */
    autoConversionTimeout: number;
    /** Order expiration time in seconds */
    orderExpirationTime: number;
    /** Minimum trade amount in base units */
    minimumTradeAmount: string;
  };
  
  /** Know Your Customer (KYC) configuration */
  kyc: {
    /** KYC service URL */
    serviceUrl: string;
    /** KYC service API key */
    apiKey: string;
    /** Required KYC level (1-5) */
    requiredLevel: number;
    /** Enable automatic verification */
    autoVerification: boolean;
  };
}

/**
 * Unified order interface supporting all order types (spot and perpetual)
 * Includes decentralized storage metadata for validator consensus
 */
export interface UnifiedOrder {
  /** Unique order identifier */
  id: string;
  /** User ID who placed the order */
  userId: string;
  /** Order type */
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LIMIT' | 'TRAILING_STOP' | 'OCO' | 'ICEBERG' | 'TWAP' | 'VWAP';
  /** Order side */
  side: 'BUY' | 'SELL';
  /** Trading pair (e.g., 'XOM/USDC') */
  pair: string;
  /** Order quantity in base asset */
  quantity: string;
  /** Limit price (for limit orders) */
  price?: string;
  /** Stop price (for stop orders) */
  stopPrice?: string;
  /** Limit price for stop-limit orders */
  limitPrice?: string;
  /** Trailing amount for trailing stop orders */
  trailingAmount?: string;
  /** Time in force specification */
  timeInForce: 'GTC' | 'DAY' | 'IOC' | 'FOK';
  /** Leverage multiplier (for margin trading) */
  leverage?: number;
  /** Whether order reduces position only */
  reduceOnly?: boolean;
  /** Whether order is post-only (maker only) */
  postOnly?: boolean;
  /** Current order status */
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  /** Amount already filled */
  filled: string;
  /** Amount remaining to be filled */
  remaining: string;
  /** Average fill price */
  averagePrice?: string;
  /** Total fees paid */
  fees: string;
  /** Order creation timestamp */
  timestamp: number;
  /** Last update timestamp */
  updatedAt: number;
  
  /** IPFS content identifier for decentralized storage */
  ipfsCID?: string;
  /** Validator signatures for consensus */
  validatorSignatures: string[];
  /** Nodes replicating this order data */
  replicationNodes: string[];
}

/**
 * Perpetual futures order interface
 * Specialized for derivatives and leveraged trading
 */
export interface PerpetualOrder {
  /** Unique order identifier */
  id: string;
  /** User ID who placed the order */
  userId: string;
  /** Order type for perpetuals */
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LIMIT';
  /** Position side */
  side: 'LONG' | 'SHORT';
  /** Perpetual contract symbol */
  contract: string;
  /** Contract size/quantity */
  size: string;
  /** Limit price (optional) */
  price?: string;
  /** Stop price for stop orders */
  stopPrice?: string;
  /** Leverage multiplier */
  leverage: number;
  /** Required margin */
  margin: string;
  /** Whether order reduces position only */
  reduceOnly: boolean;
  /** Time in force specification */
  timeInForce: 'GTC' | 'DAY' | 'IOC' | 'FOK';
  /** Current order status */
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  /** Associated position (if exists) */
  position?: Position;
  /** Liquidation price */
  liquidationPrice?: string;
  /** Unrealized profit/loss */
  unrealizedPnL?: string;
  /** Funding payment amount */
  fundingPayment?: string;
  /** Order creation timestamp */
  timestamp: number;
}

/**
 * Trading position for perpetual futures
 * Tracks open positions with P&L and margin requirements
 */
export interface Position {
  /** Perpetual contract symbol */
  contract: string;
  /** Position side */
  side: 'LONG' | 'SHORT';
  /** Position size */
  size: string;
  /** Average entry price */
  entryPrice: string;
  /** Current mark price */
  markPrice: string;
  /** Position leverage */
  leverage: number;
  /** Margin requirement */
  margin: string;
  /** Unrealized profit/loss */
  unrealizedPnL: string;
  /** Liquidation price threshold */
  liquidationPrice: string;
  /** Funding payment amount */
  fundingPayment: string;
  /** Last funding time */
  lastFundingTime: number;
}

/**
 * User portfolio with spot balances and perpetual positions
 * Provides comprehensive account overview
 */
export interface Portfolio {
  /** Portfolio owner user ID */
  userId: string;
  /** Spot asset balances */
  balances: Balance[];
  /** Perpetual positions */
  positions: Position[];
  /** Open orders across all markets */
  openOrders: UnifiedOrder[];
  /** Total portfolio value */
  totalValue: string;
  /** Unrealized profit/loss */
  unrealizedPnL: string;
  /** Realized profit/loss */
  realizedPnL: string;
  /** Available margin for new positions */
  availableMargin: string;
  /** Margin currently in use */
  usedMargin: string;
  /** Margin ratio (used/total) */
  marginRatio: number;
}

/**
 * Asset balance information
 */
export interface Balance {
  /** Asset symbol */
  asset: string;
  /** Available balance */
  free: string;
  /** Locked balance (in orders/positions) */
  locked: string;
  /** Total balance (free + locked) */
  total: string;
  /** USD equivalent value */
  usdValue?: string;
}

/**
 * Trading pair configuration supporting both spot and perpetual markets
 * OmniCoin-centric with XOM as quote asset
 */
export interface TradingPair {
  /** Trading pair symbol (e.g., 'ETH/XOM') */
  symbol: string;
  /** Base asset symbol */
  baseAsset: string;
  /** Quote asset symbol (always XOM for OmniCoin-centric trading) */
  quoteAsset: string;
  /** Market type */
  type: 'spot' | 'perpetual';
  /** Current trading status */
  status: 'TRADING' | 'HALT' | 'MAINTENANCE';
  /** Minimum order size */
  minOrderSize: string;
  /** Maximum order size */
  maxOrderSize: string;
  /** Price increment (tick size) */
  priceIncrement: string;
  /** Quantity increment (step size) */
  quantityIncrement: string;
  /** Maker fee rate */
  makerFee: number;
  /** Taker fee rate */
  takerFee: number;
  /** Maximum leverage (for perpetuals) */
  maxLeverage?: number;
  /** Funding interval in seconds (for perpetuals) */
  fundingInterval?: number;
  
  /** IPFS metadata hash for decentralized storage */
  ipfsMetadata?: string;
  /** Validator signatures for consensus */
  validatorSignatures: string[];
}

/**
 * Decentralized order book with validator consensus
 * Aggregates orders from multiple validator nodes
 */
export interface OrderBook {
  /** Trading pair symbol */
  pair: string;
  /** Buy orders sorted by price descending */
  bids: OrderBookLevel[];
  /** Sell orders sorted by price ascending */
  asks: OrderBookLevel[];
  /** Order book timestamp */
  timestamp: number;
  /** Sequence number for ordering */
  sequence: number;
  
  /** Source validator nodes */
  sourceNodes: string[];
  /** Whether validator consensus was reached */
  validatorConsensus: boolean;
  /** Consensus score (0-1 scale) */
  consensusScore: number;
}

/**
 * Single price level in the order book
 */
export interface OrderBookLevel {
  /** Price level */
  price: string;
  /** Total quantity at this price level */
  quantity: string;
  /** Number of orders at this level */
  orders?: number;
}

/**
 * Completed trade execution with decentralization proof
 * Stored on IPFS with validator signatures
 */
export interface Trade {
  /** Unique trade identifier */
  id: string;
  /** Associated order ID */
  orderId: string;
  /** Trading pair */
  pair: string;
  /** Trade side */
  side: 'BUY' | 'SELL';
  /** Trade quantity */
  quantity: string;
  /** Execution price */
  price: string;
  /** Quote asset quantity */
  quoteQuantity: string;
  /** Fee amount */
  fee: string;
  /** Asset used for fee payment */
  feeAsset: string;
  /** User ID */
  userId: string;
  /** Trade execution timestamp */
  timestamp: number;
  /** Whether buyer was the maker */
  isBuyerMaker: boolean;
  
  /** IPFS content ID for decentralized storage */
  ipfsCID: string;
  /** Validator signatures for proof */
  validatorSignatures: string[];
  /** On-chain transaction hash (if settled) */
  onChainTxHash?: string;
}

/**
 * Market data with validator consensus
 * Real-time pricing and volume information
 */
export interface MarketData {
  /** Trading pair symbol */
  pair: string;
  /** Last trade price */
  lastPrice: string;
  /** 24h price change */
  priceChange: string;
  /** 24h price change percentage */
  priceChangePercent: string;
  /** 24h high price */
  high24h: string;
  /** 24h low price */
  low24h: string;
  /** 24h base volume */
  volume24h: string;
  /** 24h quote volume */
  quoteVolume24h: string;
  /** Best bid price */
  bid: string;
  /** Best ask price */
  ask: string;
  /** Data timestamp */
  timestamp: number;
  
  /** Source validator nodes */
  sourceValidators: string[];
  /** Consensus score (0-1) */
  consensusScore: number;
}

/**
 * OHLCV candle data for charting
 * Time-series market data
 */
export interface Candle {
  /** Candle open time */
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
  /** Candle close time */
  closeTime: number;
  /** Quote asset volume */
  quoteVolume: string;
  /** Number of trades */
  trades: number;
  /** Base asset volume from buy orders */
  baseAssetVolume: string;
  /** Quote asset volume from buy orders */
  quoteAssetVolume: string;
}

/**
 * Auto-conversion result from other tokens to XOM
 * Facilitates seamless OmniCoin-centric trading
 */
export interface ConversionResult {
  /** Whether conversion was successful */
  success: boolean;
  /** Conversion transaction ID */
  id: string;
  /** Source token symbol */
  fromToken: string;
  /** Source token amount */
  fromAmount: string;
  /** Destination token (always XOM) */
  toToken: string;
  /** Converted XOM amount */
  toAmount: string;
  /** Conversion rate */
  conversionRate: string;
  /** Total fees paid */
  fees: string;
  /** Actual slippage incurred */
  actualSlippage: number;
  /** Conversion timestamp */
  timestamp: number;
  
  /** Whether validators approved the conversion */
  validatorApproval: boolean;
  /** IPFS record hash */
  ipfsRecord?: string;
}

/**
 * Fee structure and distribution information
 * 70% to validators, 20% company, 10% development
 */
export interface FeeInfo {
  /** Spot maker fee rate */
  spotMaker: number;
  /** Spot taker fee rate */
  spotTaker: number;
  /** Perpetual maker fee rate */
  perpetualMaker: number;
  /** Perpetual taker fee rate */
  perpetualTaker: number;
  /** Auto-conversion fee rate */
  autoConversion: number;
  /** Total fees generated */
  feesGenerated: string;
  /** Fee discounts by user tier */
  feeDiscounts: Record<string, number>;
  /** Next fee distribution time */
  nextDistribution: number;
}

/**
 * Validator network health and consensus status
 */
export interface ValidatorNetworkStatus {
  /** Network identifier */
  networkId: string;
  /** Total number of validator nodes */
  totalValidators: number;
  /** Currently active validators */
  activeValidators: number;
  /** Consensus health score (0-100) */
  consensusHealth: number;
  /** Average network latency in ms */
  averageLatency: number;
  /** Last consensus timestamp */
  lastConsensusTime: number;
  /** Connected node addresses */
  connectedNodes: string[];
}

/**
 * IPFS network status and storage metrics
 */
export interface IPFSNetworkStatus {
  /** IPFS node identifier */
  nodeId: string;
  /** Number of connected peers */
  connectedPeers: number;
  /** Repository size in bytes */
  repoSize: number;
  /** Available storage in bytes */
  availableStorage: number;
  /** Upload bandwidth usage */
  uploadBandwidth: number;
  /** Download bandwidth usage */
  downloadBandwidth: number;
  /** Number of pinned objects */
  pinnedObjects: number;
}

/**
 * Health status for system components
 */
export interface HealthStatus {
  /** Component health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Uptime in seconds */
  uptime: number;
  /** Last health check timestamp */
  lastCheck: number;
  /** Additional health details */
  details?: Record<string, unknown>;
}

/**
 * Chat message in the P2P network
 */
export interface ChatMessage {
  /** Message unique identifier */
  id: string;
  /** Channel or room ID */
  channel: string;
  /** Sender user ID */
  sender: string;
  /** Message content */
  content: string;
  /** Whether message is encrypted */
  encrypted: boolean;
  /** Message timestamp */
  timestamp: number;
  /** Type of message */
  messageType: 'text' | 'image' | 'file' | 'trade' | 'system';
  /** Reply to message ID */
  replyTo?: string;
}

/**
 * Chat channel configuration
 */
export interface ChatChannel {
  /** Channel unique identifier */
  id: string;
  /** Channel display name */
  name: string;
  /** Channel type */
  type: 'public' | 'private' | 'trading' | 'direct';
  /** List of participant user IDs */
  participants: string[];
  /** Channel configuration */
  settings: {
    /** Whether messages are encrypted */
    encrypted: boolean;
    /** Whether to persist message history */
    persistent: boolean;
    /** Whether channel is moderated */
    moderated: boolean;
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
  /** Uploader user ID */
  uploadedBy: string;
  /** Upload timestamp */
  uploadedAt: number;
  /** Whether file is publicly accessible */
  public: boolean;
  /** Whether file is encrypted */
  encrypted: boolean;
  /** Number of replicas */
  replicas: number;
}

/**
 * Base error class for unified DEX operations
 */
export class UnifiedDEXError extends Error {
  /**
   * Creates a new UnifiedDEXError
   * @param message - Error message
   * @param code - Error code
   * @param statusCode - HTTP status code (default: 500)
   */
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'UnifiedDEXError';
  }
}

/**
 * Error class for order-related operations
 */
export class OrderError extends UnifiedDEXError {
  /**
   * Creates a new OrderError
   * @param message - Error message
   * @param code - Error code (default: 'ORDER_ERROR')
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
   * Creates a new InsufficientBalanceError
   * @param asset - Asset symbol
   * @param required - Required amount
   * @param available - Available amount
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
   * Creates a new InvalidPairError
   * @param pair - Invalid trading pair
   */
  constructor(pair: string) {
    super(`Invalid trading pair: ${pair}`, 'INVALID_PAIR');
    this.name = 'InvalidPairError';
  }
}

/**
 * Error thrown when validator consensus fails
 */
export class ConsensusError extends UnifiedDEXError {
  /**
   * Creates a new ConsensusError
   * @param message - Error message
   */
  constructor(message: string) {
    super(message, 'CONSENSUS_FAILED', 503);
    this.name = 'ConsensusError';
  }
}

/**
 * Error thrown for IPFS storage operations
 */
export class IPFSError extends UnifiedDEXError {
  /**
   * Creates a new IPFSError
   * @param message - Error message
   */
  constructor(message: string) {
    super(message, 'IPFS_ERROR', 503);
    this.name = 'IPFSError';
  }
}

/**
 * Legacy type aliases for backward compatibility
 * @deprecated Use the corresponding Unified types instead
 */
export type DecentralizedOrder = UnifiedOrder;

/**
 * Legacy type alias for Trade
 * @deprecated Use Trade instead
 */
export type DecentralizedTrade = Trade;

/**
 * Legacy type alias for OrderBook
 * @deprecated Use OrderBook instead
 */
export type DecentralizedOrderBook = OrderBook;

/**
 * Legacy error class alias
 * @deprecated Use UnifiedDEXError instead
 */
export const DecentralizedDEXError = UnifiedDEXError;

/**
 * Legacy error class alias
 * @deprecated Use UnifiedDEXError instead
 */
export const DEXError = UnifiedDEXError;

/**
 * Token metadata and configuration
 */
export interface Token {
  /** Token contract address */
  address: string;
  /** Token symbol */
  symbol: string;
  /** Token full name */
  name: string;
  /** Number of decimal places */
  decimals: number;
  /** Blockchain chain ID */
  chainId: number;
  /** Token logo URI */
  logoURI?: string;
  /** Whether token is native to the chain */
  isNative?: boolean;
}

/**
 * Know Your Customer verification status
 */
export interface KYCStatus {
  /** User identifier */
  userId: string;
  /** KYC verification level (1-5) */
  level: number;
  /** Current verification status */
  status: 'pending' | 'verified' | 'rejected';
  /** Submitted document hashes */
  documents: string[];
  /** Verification completion date */
  verificationDate?: Date;
  /** Verification expiration date */
  expirationDate?: Date;
}

/**
 * Parameters for marketplace payment integration
 * Facilitates seamless payment processing in OmniBazaar
 */
export interface MarketplaceIntegrationParams {
  /** Marketplace listing identifier */
  listingId: string;
  /** Buyer's wallet address */
  buyerAddress: string;
  /** Token used for payment */
  paymentToken: string;
  /** Payment amount */
  paymentAmount: string;
  /** Whether to auto-convert to XOM */
  autoConvert: boolean;
}

/**
 * Parameters for automatic token conversion to XOM
 * Enables OmniCoin-centric trading ecosystem
 */
export interface AutoConversionParams {
  /** Source token to convert from */
  fromToken: string;
  /** Destination token (always XOM) */
  toToken: string;
  /** Amount to convert */
  amount: string;
  /** Maximum acceptable slippage (0-1) */
  slippageTolerance: number;
  /** Conversion deadline timestamp */
  deadline: number;
  /** User's wallet address */
  userAddress: string;
} 