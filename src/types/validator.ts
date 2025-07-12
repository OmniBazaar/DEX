/**
 * Unified Validator Types and Interfaces
 * 
 * Comprehensive type definitions for the OmniBazaar Unified Validator DEX
 */

// Hardware Configuration
export interface HardwareConfig {
  cores: number;              // Available CPU cores (minimum 4)
  memory: number;             // Available RAM in GB (minimum 8)
  storage: number;            // Available storage in GB (minimum 100)
  bandwidth: number;          // Network bandwidth in Mbps (minimum 50)
}

// Blockchain Configuration
export interface BlockchainConfig {
  networkId: string;          // Network identifier (e.g., 'omnibazaar-mainnet')
  rpcUrl: string;             // RPC endpoint URL
  chainId: number;            // Chain ID for OmniCoin network
  validatorStake: string;     // Minimum stake required (e.g., '1000')
  consensusThreshold: number; // BFT consensus threshold (e.g., 0.67)
}

// DEX Configuration
export interface DEXConfig {
  tradingPairs: string[];     // Supported trading pairs
  feeStructure: FeeStructure; // Fee configuration
  maxLeverage: number;        // Maximum leverage for perpetuals
  liquidationThreshold: number; // Liquidation threshold
}

export interface FeeStructure {
  spotMaker: number;          // Spot maker fee (e.g., 0.001 = 0.1%)
  spotTaker: number;          // Spot taker fee (e.g., 0.002 = 0.2%)
  perpetualMaker: number;     // Perpetual maker fee (e.g., 0.0005 = 0.05%)
  perpetualTaker: number;     // Perpetual taker fee (e.g., 0.0015 = 0.15%)
  autoConversion: number;     // Auto-conversion fee (e.g., 0.003 = 0.3%)
}

// IPFS Configuration
export interface IPFSConfig {
  repo: string;               // IPFS repository path
  swarmPort: number;          // Swarm port (default 4001)
  apiPort: number;            // API port (default 5001)
  gatewayPort: number;        // Gateway port (default 8080)
  bootstrapNodes: string[];   // Bootstrap node addresses
  storageQuota: number;       // Storage quota in GB
}

// Chat Configuration
export interface ChatConfig {
  maxConnections: number;     // Maximum concurrent connections
  messageRetention: number;   // Message retention in days
  encryptionEnabled: boolean; // Enable end-to-end encryption
  moderationEnabled: boolean; // Enable automatic moderation
}

// Fee Distribution Configuration
export interface FeeDistributionConfig {
  validatorShare: number;     // Validator share (e.g., 0.70 = 70%)
  companyShare: number;       // Company share (e.g., 0.20 = 20%)
  developmentShare: number;   // Development fund share (e.g., 0.10 = 10%)
  distributionInterval: number; // Distribution interval in seconds
}

// Validator Network Configuration
export interface ValidatorNetworkConfig {
  nodeId: string;             // Unique validator node identifier
  networkEndpoints: string[]; // Other validator endpoints
  heartbeatInterval: number;  // Heartbeat interval in seconds
  participationScoreThreshold: number; // Minimum participation score
}

// Security Configuration
export interface SecurityConfig {
  jwtSecret: string;          // JWT signing secret
  encryptionKey: string;      // Data encryption key
  rateLimitWindowMs: number;  // Rate limit window in milliseconds
  rateLimitMaxRequests: number; // Maximum requests per window
}

// OmniBazaar Integration Configuration
export interface OmniBazaarConfig {
  walletApiUrl: string;       // Wallet service API URL
  marketplaceApiUrl: string;  // Marketplace service API URL
  storageApiUrl: string;      // Storage service API URL
  kycServiceUrl: string;      // KYC service API URL
}

// Main Validator Configuration
export interface ValidatorConfig {
  port: number;
  wsPort: number;
  environment: string;
  hardware: HardwareConfig;
  blockchain: BlockchainConfig;
  dex: DEXConfig;
  ipfs: IPFSConfig;
  chat: ChatConfig;
  feeDistribution: FeeDistributionConfig;
  validator: ValidatorNetworkConfig;
  security: SecurityConfig;
  omnibazaar: OmniBazaarConfig;
}

// Service Status Interfaces
export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastCheck: number;
  details?: Record<string, any>;
}

export interface ResourceUsage {
  cpu: {
    usage: number;            // CPU usage percentage
    cores: number;            // Available cores
  };
  memory: {
    used: number;             // Used memory in GB
    total: number;            // Total memory in GB
    usage: number;            // Memory usage percentage
  };
  storage: {
    used: number;             // Used storage in GB
    total: number;            // Total storage in GB
    usage: number;            // Storage usage percentage
  };
  network: {
    inbound: number;          // Inbound bandwidth usage in Mbps
    outbound: number;         // Outbound bandwidth usage in Mbps
  };
}

// Trading Types
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

export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
export type TimeInForce = 'GTC' | 'DAY' | 'IOC' | 'FOK';

export interface Order {
  id: string;
  type: OrderType;
  side: OrderSide;
  pair: string;
  quantity: string;
  price?: string;
  stopPrice?: string;
  timeInForce: TimeInForce;
  leverage?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  userId: string;
  status: OrderStatus;
  filled: string;
  remaining: string;
  averagePrice?: string;
  fees: string;
  timestamp: number;
  updatedAt: number;
}

export interface Trade {
  id: string;
  orderId: string;
  pair: string;
  side: OrderSide;
  quantity: string;
  price: string;
  quoteQuantity: string;
  fee: string;
  feeAsset: string;
  userId: string;
  timestamp: number;
  isBuyerMaker: boolean;
}

// Perpetual Trading Types
export interface PerpetualContract {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  markPrice: number;
  indexPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
  interestRate: number;
  premiumIndex: number;
  maxLeverage: number;
  minOrderSize: string;
  status: 'TRADING' | 'HALT' | 'MAINTENANCE';
}

export interface Position {
  contract: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  markPrice: string;
  leverage: number;
  margin: string;
  unrealizedPnL: string;
  liquidationPrice: string;
  fundingPayment: string;
  lastFundingTime: number;
}

// Portfolio Types
export interface Balance {
  asset: string;
  free: string;
  locked: string;
  total: string;
}

export interface Portfolio {
  balances: Balance[];
  positions: Position[];
  openOrders: Order[];
  totalValue: string;
  unrealizedPnL: string;
  availableMargin: string;
  usedMargin: string;
  marginRatio: number;
}

// Market Data Types
export interface OrderBookLevel {
  price: string;
  quantity: string;
}

export interface OrderBookSnapshot {
  pair: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  sequence: number;
}

export interface Ticker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  quoteVolume24h: string;
  openPrice: string;
  closePrice: string;
  firstTradeId: string;
  lastTradeId: string;
  tradeCount: number;
  timestamp: number;
}

export interface Candle {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
  baseAssetVolume: string;
  quoteAssetVolume: string;
}

// Fee Distribution Types
export interface FeeDistribution {
  totalFees: string;
  validatorFees: string;
  companyFees: string;
  developmentFees: string;
  period: {
    start: number;
    end: number;
  };
  recipients: {
    validatorId: string;
    amount: string;
    share: number;
  }[];
}

export interface ValidatorEconomics {
  monthlyRevenue: string;
  totalFeesGenerated: string;
  validatorShare: string;
  participationScore: number;
  uptime: number;
  nextDistribution: number;
}

// Network Statistics
export interface NetworkStats {
  totalValidators: number;
  activeValidators: number;
  totalStaked: string;
  networkHashrate: string;
  averageBlockTime: number;
  totalTransactions24h: number;
  totalVolume24h: string;
  totalFees24h: string;
}

// Chat Types
export interface ChatMessage {
  id: string;
  channel: string;
  sender: string;
  content: string;
  encrypted: boolean;
  timestamp: number;
  edited?: boolean;
  editedAt?: number;
  replyTo?: string;
  messageType: 'text' | 'image' | 'file' | 'trade' | 'system';
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'public' | 'private' | 'trading' | 'direct';
  description?: string;
  participants: string[];
  moderators: string[];
  settings: {
    encrypted: boolean;
    persistent: boolean;
    moderated: boolean;
    maxParticipants?: number;
  };
  createdAt: number;
  lastActivity: number;
}

// IPFS Storage Types
export interface IPFSFile {
  hash: string;
  filename: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  uploadedAt: number;
  public: boolean;
  encrypted: boolean;
  replicas: number;
}

export interface StorageQuota {
  used: number;
  total: number;
  available: number;
  files: number;
  bandwidth: {
    used: number;
    limit: number;
  };
}

// Validator Events
export interface ValidatorEvent {
  type: 'validator-joined' | 'validator-left' | 'consensus-reached' | 'block-produced' | 'fees-distributed';
  validatorId: string;
  timestamp: number;
  data: Record<string, any>;
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  total: number;
  limit: number;
  offset: number;
}

// Error Types
export class ValidatorError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ValidatorError';
  }
}

export class OrderError extends ValidatorError {
  constructor(message: string, code: string = 'ORDER_ERROR') {
    super(message, code, 400);
    this.name = 'OrderError';
  }
}

export class InsufficientBalanceError extends OrderError {
  constructor(asset: string, required: string, available: string) {
    super(
      `Insufficient ${asset} balance. Required: ${required}, Available: ${available}`,
      'INSUFFICIENT_BALANCE'
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class InvalidPairError extends OrderError {
  constructor(pair: string) {
    super(`Invalid trading pair: ${pair}`, 'INVALID_PAIR');
    this.name = 'InvalidPairError';
  }
}

export class MarketClosedError extends OrderError {
  constructor(pair: string) {
    super(`Market closed for pair: ${pair}`, 'MARKET_CLOSED');
    this.name = 'MarketClosedError';
  }
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type Timestamp = number;
export type Hash = string;
export type Address = string;
export type BigNumberString = string; 