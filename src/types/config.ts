/**
 * Configuration type definitions for Unified Validator DEX
 * 
 * ✅ Unified validator architecture with modest hardware requirements
 * ✅ IPFS distributed storage (no PostgreSQL/Redis)
 * ✅ Early on-chain settlement
 * ✅ 70% fee distribution to validators
 */

// Re-export from validator.ts for compatibility
export { ValidatorConfig, HardwareConfig, BlockchainConfig, DEXConfig as UnifiedDEXConfig } from './validator';

// Legacy DEXConfig for backward compatibility
export interface DEXConfig {
  // Server Configuration
  port: number;
  wsPort: number;
  environment: string;
  
  // Unified Validator Configuration
  validator: {
    networkId: string;
    nodeEndpoints: string[];
    consensusThreshold: number;
    bootstrapNodes: string[];
  };
  
  // IPFS Configuration (replaces centralized database)
  ipfs: {
    repo: string;
    swarmPort: number;
    apiPort: number;
    gatewayPort: number;
    bootstrapNodes: string[];
  };
  
  // OmniCoin Blockchain Configuration
  omnicoin: {
    contractAddress: string;
    stakingContractAddress: string;
    rpcUrl: string;
    chainId: number;
    minimumConversionAmount: string;
  };
  
  // OmniBazaar Integration
  omnibazaar: {
    walletApiUrl: string;
    marketplaceApiUrl: string;
    storageApiUrl: string;
    validatorApiUrl: string;
  };
  
  // Security Configuration
  security: {
    jwtSecret: string;
    encryptionKey: string;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
  };
  
  // Trading Configuration
  trading: {
    defaultSlippageTolerance: number;
    maxSlippageTolerance: number;
    autoConversionTimeout: number;
    orderExpirationTime: number;
    minimumTradeAmount: string;
  };
  
  // KYC Configuration
  kyc: {
    serviceUrl: string;
    apiKey: string;
    requiredLevel: number;
    autoVerification: boolean;
  };
}

// Unified Order (supporting all order types)
export interface UnifiedOrder {
  id: string;
  userId: string;
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LIMIT' | 'TRAILING_STOP' | 'OCO' | 'ICEBERG' | 'TWAP' | 'VWAP';
  side: 'BUY' | 'SELL';
  pair: string;
  quantity: string;
  price?: string;
  stopPrice?: string;
  limitPrice?: string;
  trailingAmount?: string;
  timeInForce: 'GTC' | 'DAY' | 'IOC' | 'FOK';
  leverage?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  filled: string;
  remaining: string;
  averagePrice?: string;
  fees: string;
  timestamp: number;
  updatedAt: number;
  
  // Decentralized storage metadata
  ipfsCID?: string;
  validatorSignatures: string[];
  replicationNodes: string[];
}

// Perpetual Order (for futures trading)
export interface PerpetualOrder {
  id: string;
  userId: string;
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LIMIT';
  side: 'LONG' | 'SHORT';
  contract: string;
  size: string;
  price?: string;
  stopPrice?: string;
  leverage: number;
  margin: string;
  reduceOnly: boolean;
  timeInForce: 'GTC' | 'DAY' | 'IOC' | 'FOK';
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  position?: Position;
  liquidationPrice?: string;
  unrealizedPnL?: string;
  fundingPayment?: string;
  timestamp: number;
}

// Position (for perpetual futures)
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

// Enhanced Portfolio with perpetual support
export interface Portfolio {
  userId: string;
  balances: Balance[];
  positions: Position[];
  openOrders: UnifiedOrder[];
  totalValue: string;
  unrealizedPnL: string;
  realizedPnL: string;
  availableMargin: string;
  usedMargin: string;
  marginRatio: number;
}

export interface Balance {
  asset: string;
  free: string;
  locked: string;
  total: string;
  usdValue?: string;
}

// Unified Trading Pair (supporting spot and perpetuals)
export interface TradingPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string; // Always XOM for OmniCoin-centric trading
  type: 'spot' | 'perpetual';
  status: 'TRADING' | 'HALT' | 'MAINTENANCE';
  minOrderSize: string;
  maxOrderSize: string;
  priceIncrement: string;
  quantityIncrement: string;
  makerFee: number;
  takerFee: number;
  maxLeverage?: number; // For perpetuals
  fundingInterval?: number; // For perpetuals
  
  // Validator consensus metadata
  ipfsMetadata?: string;
  validatorSignatures: string[];
}

// Order Book with validator consensus
export interface OrderBook {
  pair: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  sequence: number;
  
  // Decentralization metadata
  sourceNodes: string[];
  validatorConsensus: boolean;
  consensusScore: number; // 0-1 scale
}

export interface OrderBookLevel {
  price: string;
  quantity: string;
  orders?: number; // Number of orders at this level
}

// Trade execution result
export interface Trade {
  id: string;
  orderId: string;
  pair: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  quoteQuantity: string;
  fee: string;
  feeAsset: string;
  userId: string;
  timestamp: number;
  isBuyerMaker: boolean;
  
  // Decentralization proof
  ipfsCID: string;
  validatorSignatures: string[];
  onChainTxHash?: string;
}

// Market data with validator consensus
export interface MarketData {
  pair: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  quoteVolume24h: string;
  bid: string;
  ask: string;
  timestamp: number;
  
  // Consensus metadata
  sourceValidators: string[];
  consensusScore: number;
}

// Candle/OHLCV data
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

// Auto-conversion result
export interface ConversionResult {
  success: boolean;
  id: string;
  fromToken: string;
  fromAmount: string;
  toToken: string; // Always XOM
  toAmount: string;
  conversionRate: string;
  fees: string;
  actualSlippage: number;
  timestamp: number;
  
  // Validator approval
  validatorApproval: boolean;
  ipfsRecord?: string;
}

// Fee information
export interface FeeInfo {
  spotMaker: number;
  spotTaker: number;
  perpetualMaker: number;
  perpetualTaker: number;
  autoConversion: number;
  feesGenerated: string;
  feeDiscounts: any;
  nextDistribution: number;
}

// Validator network status
export interface ValidatorNetworkStatus {
  networkId: string;
  totalValidators: number;
  activeValidators: number;
  consensusHealth: number;
  averageLatency: number;
  lastConsensusTime: number;
  connectedNodes: string[];
}

// IPFS network status
export interface IPFSNetworkStatus {
  nodeId: string;
  connectedPeers: number;
  repoSize: number;
  availableStorage: number;
  uploadBandwidth: number;
  downloadBandwidth: number;
  pinnedObjects: number;
}

// Health status for components
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastCheck: number;
  details?: Record<string, any>;
}

// Chat message
export interface ChatMessage {
  id: string;
  channel: string;
  sender: string;
  content: string;
  encrypted: boolean;
  timestamp: number;
  messageType: 'text' | 'image' | 'file' | 'trade' | 'system';
  replyTo?: string;
}

// Chat channel
export interface ChatChannel {
  id: string;
  name: string;
  type: 'public' | 'private' | 'trading' | 'direct';
  participants: string[];
  settings: {
    encrypted: boolean;
    persistent: boolean;
    moderated: boolean;
  };
  createdAt: number;
  lastActivity: number;
}

// IPFS file storage
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

// Error types
export class UnifiedDEXError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'UnifiedDEXError';
  }
}

export class OrderError extends UnifiedDEXError {
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

export class ConsensusError extends UnifiedDEXError {
  constructor(message: string) {
    super(message, 'CONSENSUS_FAILED', 503);
    this.name = 'ConsensusError';
  }
}

export class IPFSError extends UnifiedDEXError {
  constructor(message: string) {
    super(message, 'IPFS_ERROR', 503);
    this.name = 'IPFSError';
  }
}

// Legacy exports for backward compatibility
export const DecentralizedOrder = UnifiedOrder;
export const DecentralizedTrade = Trade;
export type DecentralizedOrderBook = OrderBook;
export const DecentralizedDEXError = UnifiedDEXError;
export const DEXError = UnifiedDEXError;

// Token definition
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
  isNative?: boolean;
}

// KYC status
export interface KYCStatus {
  userId: string;
  level: number;
  status: 'pending' | 'verified' | 'rejected';
  documents: string[];
  verificationDate?: Date;
  expirationDate?: Date;
}

// Marketplace integration
export interface MarketplaceIntegrationParams {
  listingId: string;
  buyerAddress: string;
  paymentToken: string;
  paymentAmount: string;
  autoConvert: boolean;
}

// Auto-conversion parameters
export interface AutoConversionParams {
  fromToken: string;
  toToken: string; // Always XOM
  amount: string;
  slippageTolerance: number;
  deadline: number;
  userAddress: string;
} 