/**
 * XOM Fee Protocol Service for DEX
 * 
 * Manages the 0.025 XOM reward system for DEX trading activities.
 * Tracks rewards for trades, liquidity provision, and market making.
 * Integrates with the Validator's reward distribution system.
 * 
 * @module services/XOMFeeProtocolService
 */

import { ethers } from 'ethers';

/**
 * DEX-specific reward types
 */
export enum DEXRewardType {
  SPOT_TRADE = 'SPOT_TRADE',
  LIMIT_ORDER = 'LIMIT_ORDER',
  MARKET_MAKING = 'MARKET_MAKING',
  LIQUIDITY_PROVIDE = 'LIQUIDITY_PROVIDE',
  LIQUIDITY_REMOVE = 'LIQUIDITY_REMOVE',
  SWAP = 'SWAP',
  PRIVACY_SWAP = 'PRIVACY_SWAP',
  CROSS_CHAIN_SWAP = 'CROSS_CHAIN_SWAP',
  ARBITRAGE = 'ARBITRAGE',
  VOLUME_MILESTONE = 'VOLUME_MILESTONE',
  REFERRAL_TRADE = 'REFERRAL_TRADE'
}

/**
 * Trading reward configuration
 */
interface TradingRewardConfig {
  /** Reward amount in XOM */
  amount: string;
  /** Description of the trading action */
  description: string;
  /** Daily limit for this reward type */
  dailyLimit: number;
  /** Cooldown period in seconds */
  cooldown: number;
  /** Minimum trade volume required (in USD) */
  minVolume?: number;
}

/**
 * Trading reward entry
 */
interface TradingReward {
  /** Unique reward ID */
  id: string;
  /** Trader address */
  trader: string;
  /** Reward type */
  type: DEXRewardType;
  /** Amount in XOM */
  amount: string;
  /** Trade volume that earned this reward */
  tradeVolume: string;
  /** Trading pair */
  pair: string;
  /** Timestamp when earned */
  timestamp: number;
  /** Transaction hash of the trade */
  tradeTxHash: string;
  /** Claim status */
  status: 'pending' | 'claiming' | 'claimed' | 'expired';
}

/**
 * Trading rewards summary
 */
interface TradingRewardsSummary {
  /** Total pending rewards */
  pendingAmount: string;
  /** Total claimed rewards */
  claimedAmount: string;
  /** Total trading volume (USD) */
  totalVolume: string;
  /** Number of trades */
  tradeCount: number;
  /** Rewards by type */
  byType: Map<DEXRewardType, {
    count: number;
    total: string;
    volume: string;
  }>;
  /** Recent rewards */
  recent: TradingReward[];
  /** Next claim available */
  nextClaimTime: number;
  /** Trading tier */
  tradingTier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
}

/**
 * Liquidity mining rewards
 */
interface LiquidityMiningRewards {
  /** Pool address */
  pool: string;
  /** LP token balance */
  lpBalance: string;
  /** Pending rewards */
  pendingRewards: string;
  /** APR percentage */
  apr: number;
  /** Total value locked */
  tvl: string;
  /** User's share percentage */
  sharePercentage: number;
}

/**
 * XOM Fee Protocol Service for DEX
 */
export class XOMFeeProtocolService {
  private provider: ethers.Provider;
  private signer?: ethers.Signer;
  private validatorEndpoint: string;
  private rewardsCache = new Map<string, TradingRewardsSummary>();
  private liquidityRewardsCache = new Map<string, LiquidityMiningRewards[]>();
  private updateInterval: NodeJS.Timeout | null = null;
  
  // Standard reward: 0.025 XOM
  private readonly STANDARD_REWARD = '0.025';
  
  // Trading reward configurations
  private readonly tradingRewardConfigs: Map<DEXRewardType, TradingRewardConfig> = new Map([
    [DEXRewardType.SPOT_TRADE, {
      amount: this.STANDARD_REWARD,
      description: 'Execute a spot trade',
      dailyLimit: 200,
      cooldown: 30,
      minVolume: 10 // $10 minimum
    }],
    [DEXRewardType.LIMIT_ORDER, {
      amount: '0.03', // Slightly higher for limit orders
      description: 'Place and fill a limit order',
      dailyLimit: 100,
      cooldown: 60,
      minVolume: 25
    }],
    [DEXRewardType.MARKET_MAKING, {
      amount: '0.1', // 4x reward for market makers
      description: 'Provide liquidity on order book',
      dailyLimit: 50,
      cooldown: 300,
      minVolume: 100
    }],
    [DEXRewardType.LIQUIDITY_PROVIDE, {
      amount: '0.05', // 2x reward for LPs
      description: 'Add liquidity to a pool',
      dailyLimit: 20,
      cooldown: 600,
      minVolume: 50
    }],
    [DEXRewardType.SWAP, {
      amount: this.STANDARD_REWARD,
      description: 'Execute a token swap',
      dailyLimit: 150,
      cooldown: 30,
      minVolume: 5
    }],
    [DEXRewardType.PRIVACY_SWAP, {
      amount: '0.05', // Bonus for privacy adoption
      description: 'Execute a privacy swap with pXOM',
      dailyLimit: 100,
      cooldown: 60,
      minVolume: 10
    }],
    [DEXRewardType.CROSS_CHAIN_SWAP, {
      amount: '0.075', // 3x for cross-chain
      description: 'Execute a cross-chain swap',
      dailyLimit: 30,
      cooldown: 300,
      minVolume: 50
    }],
    [DEXRewardType.ARBITRAGE, {
      amount: '0.2', // High reward for arbitrageurs
      description: 'Execute profitable arbitrage',
      dailyLimit: 10,
      cooldown: 1800,
      minVolume: 500
    }],
    [DEXRewardType.VOLUME_MILESTONE, {
      amount: '1.0', // Milestone bonus
      description: 'Reach daily volume milestone',
      dailyLimit: 1,
      cooldown: 86400, // 24 hours
      minVolume: 10000
    }],
    [DEXRewardType.REFERRAL_TRADE, {
      amount: '0.05', // Referral bonus
      description: 'Trade from referral',
      dailyLimit: 50,
      cooldown: 120,
      minVolume: 20
    }]
  ]);
  
  // Trading tiers based on volume
  private readonly TRADING_TIERS = {
    bronze: { minVolume: 0, feeDiscount: 0 },
    silver: { minVolume: 10000, feeDiscount: 0.05 }, // 5% fee discount
    gold: { minVolume: 50000, feeDiscount: 0.10 },
    platinum: { minVolume: 250000, feeDiscount: 0.15 },
    diamond: { minVolume: 1000000, feeDiscount: 0.20 } // 20% fee discount
  };
  
  constructor(
    provider: ethers.Provider,
    signer?: ethers.Signer,
    validatorEndpoint?: string
  ) {
    this.provider = provider;
    this.signer = signer;
    this.validatorEndpoint = validatorEndpoint || 'http://localhost:3001/api/dex-rewards';
  }
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    // Start periodic reward updates
    this.startRewardUpdates();
    console.log('DEX XOM Fee Protocol Service initialized');
  }
  
  /**
   * Track a trading action for rewards
   */
  async trackTradingAction(
    trader: string,
    type: DEXRewardType,
    tradeData: {
      volume: number;
      pair: string;
      txHash: string;
      profit?: number;
      referrer?: string;
    }
  ): Promise<TradingReward | null> {
    try {
      // Check minimum volume requirement
      const config = this.tradingRewardConfigs.get(type)!;
      if (config.minVolume && tradeData.volume < config.minVolume) {
        console.log(`Trade volume ${tradeData.volume} below minimum ${config.minVolume}`);
        return null;
      }
      
      // Check if eligible for reward
      const isEligible = await this.checkTradingEligibility(trader, type);
      if (!isEligible) {
        console.log(`Trader ${trader} not eligible for ${type} reward`);
        return null;
      }
      
      // Calculate reward amount (may include bonuses)
      const rewardAmount = await this.calculateTradingReward(
        type, 
        tradeData.volume,
        tradeData.profit
      );
      
      // Create trading reward
      const reward: TradingReward = {
        id: `dex_reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        trader,
        type,
        amount: rewardAmount,
        tradeVolume: tradeData.volume.toString(),
        pair: tradeData.pair,
        timestamp: Date.now(),
        tradeTxHash: tradeData.txHash,
        status: 'pending'
      };
      
      // Submit to validator
      const response = await fetch(`${this.validatorEndpoint}/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reward,
          tradeData
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to track trading reward');
      }
      
      // Clear cache to force refresh
      this.rewardsCache.delete(trader);
      
      console.log(`Trading reward earned: ${rewardAmount} XOM for ${type}`);
      return reward;
      
    } catch (error) {
      console.error('Error tracking trading action:', error);
      return null;
    }
  }
  
  /**
   * Calculate trading reward amount with bonuses
   */
  private async calculateTradingReward(
    type: DEXRewardType,
    volume: number,
    profit?: number
  ): Promise<string> {
    const config = this.tradingRewardConfigs.get(type)!;
    let baseReward = parseFloat(config.amount);
    
    // Volume-based multiplier (up to 2x for high volume)
    const volumeMultiplier = Math.min(2, 1 + (volume / 10000));
    
    // Profit-based bonus for arbitrage
    if (type === DEXRewardType.ARBITRAGE && profit) {
      const profitBonus = Math.min(0.5, profit * 0.001); // 0.1% of profit, max 0.5 XOM
      baseReward += profitBonus;
    }
    
    const finalReward = baseReward * volumeMultiplier;
    return finalReward.toFixed(3);
  }
  
  /**
   * Check trading eligibility
   */
  private async checkTradingEligibility(
    trader: string,
    type: DEXRewardType
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.validatorEndpoint}/eligibility/${trader}/${type}`
      );
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      return data.eligible;
      
    } catch (error) {
      console.error('Error checking trading eligibility:', error);
      return false;
    }
  }
  
  /**
   * Get trading rewards summary
   */
  async getTradingRewardsSummary(trader: string): Promise<TradingRewardsSummary> {
    // Check cache first
    const cached = this.rewardsCache.get(trader);
    if (cached && Date.now() - cached.nextClaimTime < 60000) {
      return cached;
    }
    
    try {
      const response = await fetch(`${this.validatorEndpoint}/summary/${trader}`);
      if (!response.ok) {
        throw new Error('Failed to fetch trading rewards summary');
      }
      
      const data = await response.json();
      const summary = this.processTradingRewardsData(data);
      
      // Update cache
      this.rewardsCache.set(trader, summary);
      
      return summary;
    } catch (error) {
      console.error('Error fetching trading rewards:', error);
      return this.getEmptyTradingRewardsSummary();
    }
  }
  
  /**
   * Process trading rewards data
   */
  private processTradingRewardsData(data: any): TradingRewardsSummary {
    const byType = new Map<DEXRewardType, any>();
    
    for (const [type, stats] of Object.entries(data.byType || {})) {
      byType.set(type as DEXRewardType, stats);
    }
    
    // Determine trading tier based on volume
    const totalVolume = parseFloat(data.totalVolume || '0');
    let tradingTier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' = 'bronze';
    
    if (totalVolume >= this.TRADING_TIERS.diamond.minVolume) tradingTier = 'diamond';
    else if (totalVolume >= this.TRADING_TIERS.platinum.minVolume) tradingTier = 'platinum';
    else if (totalVolume >= this.TRADING_TIERS.gold.minVolume) tradingTier = 'gold';
    else if (totalVolume >= this.TRADING_TIERS.silver.minVolume) tradingTier = 'silver';
    
    return {
      pendingAmount: data.pendingAmount || '0',
      claimedAmount: data.claimedAmount || '0',
      totalVolume: data.totalVolume || '0',
      tradeCount: data.tradeCount || 0,
      byType,
      recent: data.recent || [],
      nextClaimTime: data.nextClaimTime || Date.now(),
      tradingTier
    };
  }
  
  /**
   * Get empty trading rewards summary
   */
  private getEmptyTradingRewardsSummary(): TradingRewardsSummary {
    return {
      pendingAmount: '0',
      claimedAmount: '0',
      totalVolume: '0',
      tradeCount: 0,
      byType: new Map(),
      recent: [],
      nextClaimTime: Date.now(),
      tradingTier: 'bronze'
    };
  }
  
  /**
   * Get liquidity mining rewards
   */
  async getLiquidityMiningRewards(provider: string): Promise<LiquidityMiningRewards[]> {
    // Check cache
    const cached = this.liquidityRewardsCache.get(provider);
    if (cached) return cached;
    
    try {
      const response = await fetch(`${this.validatorEndpoint}/liquidity/${provider}`);
      if (!response.ok) {
        throw new Error('Failed to fetch liquidity rewards');
      }
      
      const rewards = await response.json();
      this.liquidityRewardsCache.set(provider, rewards);
      
      return rewards;
    } catch (error) {
      console.error('Error fetching liquidity rewards:', error);
      return [];
    }
  }
  
  /**
   * Claim trading rewards
   */
  async claimTradingRewards(trader: string): Promise<{
    success: boolean;
    txHash?: string;
    amount?: string;
    error?: string;
  }> {
    if (!this.signer) {
      return {
        success: false,
        error: 'No signer available'
      };
    }
    
    try {
      // Get pending rewards
      const summary = await this.getTradingRewardsSummary(trader);
      
      if (parseFloat(summary.pendingAmount) === 0) {
        return {
          success: false,
          error: 'No pending rewards to claim'
        };
      }
      
      if (Date.now() < summary.nextClaimTime) {
        const waitTime = Math.ceil((summary.nextClaimTime - Date.now()) / 1000);
        return {
          success: false,
          error: `Please wait ${waitTime} seconds before claiming`
        };
      }
      
      // Submit claim request
      const response = await fetch(`${this.validatorEndpoint}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          trader,
          amount: summary.pendingAmount,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to claim rewards');
      }
      
      const data = await response.json();
      
      // Clear cache
      this.rewardsCache.delete(trader);
      this.liquidityRewardsCache.delete(trader);
      
      return {
        success: true,
        txHash: data.txHash,
        amount: summary.pendingAmount
      };
      
    } catch (error) {
      console.error('Error claiming trading rewards:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Get trading history with rewards
   */
  async getTradingHistory(
    trader: string,
    limit = 100
  ): Promise<TradingReward[]> {
    try {
      const response = await fetch(
        `${this.validatorEndpoint}/history/${trader}?limit=${limit}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch trading history');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching trading history:', error);
      return [];
    }
  }
  
  /**
   * Get trading leaderboard
   */
  async getTradingLeaderboard(
    period: 'daily' | 'weekly' | 'monthly' = 'weekly'
  ): Promise<Array<{
    trader: string;
    totalVolume: string;
    totalEarned: string;
    tradeCount: number;
    tradingTier: string;
    rank: number;
  }>> {
    try {
      const response = await fetch(
        `${this.validatorEndpoint}/leaderboard?period=${period}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching trading leaderboard:', error);
      return [];
    }
  }
  
  /**
   * Get fee discount for trader based on tier
   */
  getFeeDiscount(trader: string): number {
    const cached = this.rewardsCache.get(trader);
    if (!cached) return 0;
    
    return this.TRADING_TIERS[cached.tradingTier].feeDiscount;
  }
  
  /**
   * Get reward configuration
   */
  getRewardConfig(type: DEXRewardType): TradingRewardConfig | undefined {
    return this.tradingRewardConfigs.get(type);
  }
  
  /**
   * Get all reward types
   */
  getAllRewardTypes(): Array<{
    type: DEXRewardType;
    config: TradingRewardConfig;
  }> {
    return Array.from(this.tradingRewardConfigs.entries()).map(([type, config]) => ({
      type,
      config
    }));
  }
  
  /**
   * Calculate estimated daily earnings for a trader
   */
  calculateEstimatedEarnings(
    avgDailyVolume: number,
    tradesPerDay: number
  ): string {
    // Base trading rewards
    const tradeRewards = tradesPerDay * parseFloat(this.STANDARD_REWARD);
    
    // Volume bonus (up to 2x)
    const volumeMultiplier = Math.min(2, 1 + (avgDailyVolume / 10000));
    
    // Add potential liquidity rewards
    const liquidityBonus = avgDailyVolume > 1000 ? 0.5 : 0;
    
    const totalEstimate = (tradeRewards * volumeMultiplier) + liquidityBonus;
    return totalEstimate.toFixed(3);
  }
  
  /**
   * Start periodic reward updates
   */
  private startRewardUpdates(): void {
    // Update rewards every minute
    this.updateInterval = setInterval(async () => {
      for (const trader of this.rewardsCache.keys()) {
        try {
          await this.getTradingRewardsSummary(trader);
        } catch (error) {
          console.error(`Error updating rewards for ${trader}:`, error);
        }
      }
    }, 60 * 1000);
  }
  
  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.rewardsCache.clear();
    this.liquidityRewardsCache.clear();
  }
  
  /**
   * Format reward amount for display
   */
  formatReward(amount: string): string {
    return `${parseFloat(amount).toFixed(3)} XOM`;
  }
  
  /**
   * Format trading tier for display
   */
  formatTradingTier(tier: string): {
    display: string;
    color: string;
    discount: string;
  } {
    const tierColors = {
      bronze: '#CD7F32',
      silver: '#C0C0C0',
      gold: '#FFD700',
      platinum: '#E5E4E2',
      diamond: '#B9F2FF'
    };
    
    const discount = this.TRADING_TIERS[tier as keyof typeof this.TRADING_TIERS].feeDiscount;
    
    return {
      display: tier.charAt(0).toUpperCase() + tier.slice(1),
      color: tierColors[tier as keyof typeof tierColors] || '#000000',
      discount: `${(discount * 100).toFixed(0)}% fee discount`
    };
  }
}

export default XOMFeeProtocolService;