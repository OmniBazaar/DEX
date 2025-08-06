/**
 * KYC Service for DEX
 * 
 * Provides tiered access to DEX features based on KYC verification level.
 * Enables compliant trading with progressive limits and advanced features.
 * Integrates with Sumsub testnet for identity verification.
 * 
 * Features:
 * - Tiered trading limits based on KYC level
 * - Access to advanced trading features (margin, futures)
 * - Compliance with regulatory requirements
 * - Institutional trading accounts
 * - Privacy-preserving options for verified users
 * 
 * @module services/KYCService
 */

import { ethers } from 'ethers';

/**
 * DEX KYC tiers
 */
export enum DEXKYCTier {
  TIER_0 = 0, // View-only, no trading
  TIER_1 = 1, // Basic spot trading
  TIER_2 = 2, // Increased limits, all spot pairs
  TIER_3 = 3, // Margin trading, advanced features
  TIER_4 = 4  // Institutional, unlimited
}

/**
 * Trading features by tier
 */
export interface TradingFeatures {
  /** Can trade spot */
  spotTrading: boolean;
  /** Can trade margin */
  marginTrading: boolean;
  /** Can trade futures */
  futuresTrading: boolean;
  /** Can trade privacy pairs (pXOM) */
  privacyTrading: boolean;
  /** Can provide liquidity */
  liquidityProvision: boolean;
  /** Can use limit orders */
  limitOrders: boolean;
  /** Can use stop orders */
  stopOrders: boolean;
  /** Can use OCO orders */
  ocoOrders: boolean;
  /** Can use API trading */
  apiTrading: boolean;
  /** Maximum leverage */
  maxLeverage: number;
}

/**
 * Trading limits
 */
export interface TradingLimits {
  /** Daily trading volume limit in USD */
  dailyVolumeLimit: string;
  /** Monthly trading volume limit */
  monthlyVolumeLimit: string;
  /** Single order limit */
  orderLimit: string;
  /** Maximum open orders */
  maxOpenOrders: number;
  /** Maximum positions */
  maxPositions: number;
  /** Withdrawal limit daily */
  dailyWithdrawalLimit: string;
}

/**
 * Trader KYC status
 */
export interface TraderKYCStatus {
  /** Trader address */
  address: string;
  /** Current KYC tier */
  currentTier: DEXKYCTier;
  /** Is verified */
  isVerified: boolean;
  /** Is institutional */
  isInstitutional: boolean;
  /** Trading features enabled */
  features: TradingFeatures;
  /** Trading limits */
  limits: TradingLimits;
  /** Fee tier (discount percentage) */
  feeTier: number;
  /** VIP status */
  vipStatus: 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
  /** Compliance status */
  compliance: {
    canTradeUS: boolean;
    canTradeEU: boolean;
    canTradeRestricted: boolean;
    sanctionsCheck: boolean;
    lastCheckDate: number;
  };
  /** Market maker status */
  marketMaker: {
    isMarketMaker: boolean;
    makerRebate: number; // Percentage rebate
    tier: 'none' | 'basic' | 'professional' | 'institutional';
  };
  /** Verification expiry */
  expiryDate?: number;
  /** Last updated */
  lastUpdated: number;
}

/**
 * Trading pair restrictions
 */
export interface PairRestrictions {
  /** Pair symbol */
  pair: string;
  /** Minimum KYC tier required */
  minTier: DEXKYCTier;
  /** Geographic restrictions */
  geoRestrictions: string[]; // Country codes
  /** Required verifications */
  requiredVerifications: string[];
  /** Is privacy pair */
  isPrivacyPair: boolean;
  /** Is institutional only */
  institutionalOnly: boolean;
}

/**
 * DEX KYC Service
 */
export class DEXKYCService {
  private provider: ethers.Provider;
  private validatorEndpoint: string;
  private traderCache = new Map<string, TraderKYCStatus>();
  private pairRestrictions = new Map<string, PairRestrictions>();
  
  // Trading features by tier
  private readonly TIER_FEATURES: Record<DEXKYCTier, TradingFeatures> = {
    [DEXKYCTier.TIER_0]: {
      spotTrading: false,
      marginTrading: false,
      futuresTrading: false,
      privacyTrading: false,
      liquidityProvision: false,
      limitOrders: false,
      stopOrders: false,
      ocoOrders: false,
      apiTrading: false,
      maxLeverage: 0
    },
    [DEXKYCTier.TIER_1]: {
      spotTrading: true,
      marginTrading: false,
      futuresTrading: false,
      privacyTrading: false,
      liquidityProvision: true,
      limitOrders: true,
      stopOrders: false,
      ocoOrders: false,
      apiTrading: false,
      maxLeverage: 1
    },
    [DEXKYCTier.TIER_2]: {
      spotTrading: true,
      marginTrading: false,
      futuresTrading: false,
      privacyTrading: true,
      liquidityProvision: true,
      limitOrders: true,
      stopOrders: true,
      ocoOrders: true,
      apiTrading: false,
      maxLeverage: 1
    },
    [DEXKYCTier.TIER_3]: {
      spotTrading: true,
      marginTrading: true,
      futuresTrading: true,
      privacyTrading: true,
      liquidityProvision: true,
      limitOrders: true,
      stopOrders: true,
      ocoOrders: true,
      apiTrading: true,
      maxLeverage: 10
    },
    [DEXKYCTier.TIER_4]: {
      spotTrading: true,
      marginTrading: true,
      futuresTrading: true,
      privacyTrading: true,
      liquidityProvision: true,
      limitOrders: true,
      stopOrders: true,
      ocoOrders: true,
      apiTrading: true,
      maxLeverage: 100
    }
  };
  
  // Trading limits by tier
  private readonly TIER_LIMITS: Record<DEXKYCTier, TradingLimits> = {
    [DEXKYCTier.TIER_0]: {
      dailyVolumeLimit: '0',
      monthlyVolumeLimit: '0',
      orderLimit: '0',
      maxOpenOrders: 0,
      maxPositions: 0,
      dailyWithdrawalLimit: '0'
    },
    [DEXKYCTier.TIER_1]: {
      dailyVolumeLimit: '10000',
      monthlyVolumeLimit: '100000',
      orderLimit: '1000',
      maxOpenOrders: 10,
      maxPositions: 5,
      dailyWithdrawalLimit: '1000'
    },
    [DEXKYCTier.TIER_2]: {
      dailyVolumeLimit: '100000',
      monthlyVolumeLimit: '1000000',
      orderLimit: '10000',
      maxOpenOrders: 50,
      maxPositions: 20,
      dailyWithdrawalLimit: '10000'
    },
    [DEXKYCTier.TIER_3]: {
      dailyVolumeLimit: '1000000',
      monthlyVolumeLimit: '10000000',
      orderLimit: '100000',
      maxOpenOrders: 200,
      maxPositions: 100,
      dailyWithdrawalLimit: '100000'
    },
    [DEXKYCTier.TIER_4]: {
      dailyVolumeLimit: '999999999',
      monthlyVolumeLimit: '999999999',
      orderLimit: '999999999',
      maxOpenOrders: 9999,
      maxPositions: 9999,
      dailyWithdrawalLimit: '999999999'
    }
  };
  
  // Fee discounts by tier (in percentage)
  private readonly FEE_DISCOUNTS: Record<DEXKYCTier, number> = {
    [DEXKYCTier.TIER_0]: 0,
    [DEXKYCTier.TIER_1]: 5,
    [DEXKYCTier.TIER_2]: 10,
    [DEXKYCTier.TIER_3]: 15,
    [DEXKYCTier.TIER_4]: 25
  };
  
  constructor(provider: ethers.Provider, validatorEndpoint?: string) {
    this.provider = provider;
    this.validatorEndpoint = validatorEndpoint || 'http://localhost:3001/api/dex-kyc';
    
    // Initialize pair restrictions
    this.initializePairRestrictions();
  }
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    // Load pair restrictions from validator
    await this.loadPairRestrictions();
    
    console.log('DEX KYC Service initialized');
  }
  
  /**
   * Get trader KYC status
   */
  async getTraderStatus(address: string): Promise<TraderKYCStatus> {
    // Check cache
    const cached = this.traderCache.get(address);
    if (cached && Date.now() - cached.lastUpdated < 300000) { // 5 minute cache
      return cached;
    }
    
    try {
      const response = await fetch(`${this.validatorEndpoint}/trader/${address}`);
      if (!response.ok) {
        return this.getDefaultTraderStatus(address);
      }
      
      const data = await response.json();
      const status = this.processTraderData(address, data);
      
      // Update cache
      this.traderCache.set(address, status);
      
      return status;
    } catch (error) {
      console.error('Error fetching trader status:', error);
      return this.getDefaultTraderStatus(address);
    }
  }
  
  /**
   * Check if trader can trade pair
   */
  async canTradePair(
    traderAddress: string,
    pair: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const [traderStatus, pairRestriction] = await Promise.all([
      this.getTraderStatus(traderAddress),
      this.getPairRestrictions(pair)
    ]);
    
    // Check tier requirement
    if (traderStatus.currentTier < pairRestriction.minTier) {
      return {
        allowed: false,
        reason: `This pair requires Tier ${pairRestriction.minTier} verification`
      };
    }
    
    // Check if institutional only
    if (pairRestriction.institutionalOnly && !traderStatus.isInstitutional) {
      return {
        allowed: false,
        reason: 'This pair is restricted to institutional traders'
      };
    }
    
    // Check privacy pairs
    if (pairRestriction.isPrivacyPair && !traderStatus.features.privacyTrading) {
      return {
        allowed: false,
        reason: 'Privacy trading requires Tier 2+ verification'
      };
    }
    
    // Check geographic restrictions
    // In production, would check user's jurisdiction
    
    return { allowed: true };
  }
  
  /**
   * Check if order is within limits
   */
  async checkOrderLimits(
    traderAddress: string,
    orderValue: string,
    dailyVolume: string,
    openOrderCount: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const status = await this.getTraderStatus(traderAddress);
    const limits = status.limits;
    
    // Check single order limit
    if (parseFloat(orderValue) > parseFloat(limits.orderLimit)) {
      return {
        allowed: false,
        reason: `Order exceeds your limit of $${limits.orderLimit}`
      };
    }
    
    // Check daily volume limit
    if (parseFloat(dailyVolume) + parseFloat(orderValue) > parseFloat(limits.dailyVolumeLimit)) {
      return {
        allowed: false,
        reason: `Would exceed daily volume limit of $${limits.dailyVolumeLimit}`
      };
    }
    
    // Check open orders limit
    if (openOrderCount >= limits.maxOpenOrders) {
      return {
        allowed: false,
        reason: `Maximum ${limits.maxOpenOrders} open orders allowed`
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check if trader can use feature
   */
  async canUseFeature(
    traderAddress: string,
    feature: keyof TradingFeatures
  ): Promise<boolean> {
    const status = await this.getTraderStatus(traderAddress);
    return status.features[feature] as boolean;
  }
  
  /**
   * Request KYC upgrade
   */
  async requestUpgrade(
    address: string,
    targetTier: DEXKYCTier,
    institutionalData?: {
      companyName: string;
      registrationNumber: string;
      regulatoryLicenses?: string[];
      aum?: string; // Assets under management
    }
  ): Promise<{ success: boolean; verificationUrl?: string; error?: string }> {
    try {
      const response = await fetch(`${this.validatorEndpoint}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          targetTier,
          institutionalData,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error
        };
      }
      
      const data = await response.json();
      
      // Clear cache
      this.traderCache.delete(address);
      
      return {
        success: true,
        verificationUrl: data.verificationUrl
      };
      
    } catch (error) {
      console.error('Error requesting upgrade:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Apply for market maker status
   */
  async applyForMarketMaker(
    address: string,
    volumeCommitment: string,
    spreadCommitment: number
  ): Promise<{ success: boolean; tier?: string; error?: string }> {
    try {
      const response = await fetch(`${this.validatorEndpoint}/market-maker/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          volumeCommitment,
          spreadCommitment,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error
        };
      }
      
      const data = await response.json();
      
      // Clear cache
      this.traderCache.delete(address);
      
      return {
        success: true,
        tier: data.tier
      };
      
    } catch (error) {
      console.error('Error applying for market maker:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Get trading statistics
   */
  async getTradingStats(address: string): Promise<{
    totalVolume30d: string;
    totalTrades30d: number;
    avgDailyVolume: string;
    feePaid30d: string;
    feeRebate30d: string;
    profitLoss30d: string;
    winRate: number;
    vipProgress: {
      currentTier: string;
      nextTier: string;
      volumeRequired: string;
      volumeProgress: number;
    };
  }> {
    try {
      const response = await fetch(`${this.validatorEndpoint}/trader/${address}/stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch trading stats');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching trading stats:', error);
      
      return {
        totalVolume30d: '0',
        totalTrades30d: 0,
        avgDailyVolume: '0',
        feePaid30d: '0',
        feeRebate30d: '0',
        profitLoss30d: '0',
        winRate: 0,
        vipProgress: {
          currentTier: 'none',
          nextTier: 'bronze',
          volumeRequired: '10000',
          volumeProgress: 0
        }
      };
    }
  }
  
  /**
   * Get tier information
   */
  getTierInfo(tier: DEXKYCTier): {
    name: string;
    description: string;
    features: TradingFeatures;
    limits: TradingLimits;
    feeDiscount: number;
    requirements: string[];
  } {
    const tierNames = {
      [DEXKYCTier.TIER_0]: 'Unverified',
      [DEXKYCTier.TIER_1]: 'Basic Trader',
      [DEXKYCTier.TIER_2]: 'Verified Trader',
      [DEXKYCTier.TIER_3]: 'Professional Trader',
      [DEXKYCTier.TIER_4]: 'Institutional Trader'
    };
    
    const tierDescriptions = {
      [DEXKYCTier.TIER_0]: 'View-only access, no trading',
      [DEXKYCTier.TIER_1]: 'Basic spot trading with limits',
      [DEXKYCTier.TIER_2]: 'Full spot trading and privacy features',
      [DEXKYCTier.TIER_3]: 'Margin, futures, and advanced features',
      [DEXKYCTier.TIER_4]: 'Unlimited access for institutions'
    };
    
    const tierRequirements = {
      [DEXKYCTier.TIER_0]: [],
      [DEXKYCTier.TIER_1]: ['Email verification', 'Phone verification'],
      [DEXKYCTier.TIER_2]: ['Government ID', 'Selfie verification'],
      [DEXKYCTier.TIER_3]: ['Enhanced KYC', 'Proof of address', 'Source of funds'],
      [DEXKYCTier.TIER_4]: ['Company registration', 'Regulatory licenses', 'Compliance officer']
    };
    
    return {
      name: tierNames[tier],
      description: tierDescriptions[tier],
      features: this.TIER_FEATURES[tier],
      limits: this.TIER_LIMITS[tier],
      feeDiscount: this.FEE_DISCOUNTS[tier],
      requirements: tierRequirements[tier]
    };
  }
  
  /**
   * Get VIP tier benefits
   */
  getVIPBenefits(vipTier: string): {
    feeDiscount: number;
    withdrawalLimit: string;
    prioritySupport: boolean;
    dedicatedManager: boolean;
    otcDesk: boolean;
    apiRateLimit: number;
  } {
    const benefits = {
      none: {
        feeDiscount: 0,
        withdrawalLimit: '10000',
        prioritySupport: false,
        dedicatedManager: false,
        otcDesk: false,
        apiRateLimit: 100
      },
      bronze: {
        feeDiscount: 5,
        withdrawalLimit: '50000',
        prioritySupport: false,
        dedicatedManager: false,
        otcDesk: false,
        apiRateLimit: 200
      },
      silver: {
        feeDiscount: 10,
        withdrawalLimit: '100000',
        prioritySupport: true,
        dedicatedManager: false,
        otcDesk: false,
        apiRateLimit: 500
      },
      gold: {
        feeDiscount: 15,
        withdrawalLimit: '500000',
        prioritySupport: true,
        dedicatedManager: true,
        otcDesk: true,
        apiRateLimit: 1000
      },
      platinum: {
        feeDiscount: 20,
        withdrawalLimit: '999999999',
        prioritySupport: true,
        dedicatedManager: true,
        otcDesk: true,
        apiRateLimit: 9999
      }
    };
    
    return benefits[vipTier as keyof typeof benefits] || benefits.none;
  }
  
  // Helper methods
  
  /**
   * Initialize default pair restrictions
   */
  private initializePairRestrictions(): void {
    // Privacy pairs
    this.pairRestrictions.set('pXOM/USDC', {
      pair: 'pXOM/USDC',
      minTier: DEXKYCTier.TIER_2,
      geoRestrictions: [],
      requiredVerifications: ['ID verification'],
      isPrivacyPair: true,
      institutionalOnly: false
    });
    
    // High-value pairs
    this.pairRestrictions.set('BTC/USDC', {
      pair: 'BTC/USDC',
      minTier: DEXKYCTier.TIER_1,
      geoRestrictions: [],
      requiredVerifications: [],
      isPrivacyPair: false,
      institutionalOnly: false
    });
    
    // Institutional pairs
    this.pairRestrictions.set('XOM/USD-INST', {
      pair: 'XOM/USD-INST',
      minTier: DEXKYCTier.TIER_4,
      geoRestrictions: [],
      requiredVerifications: ['Institutional verification'],
      isPrivacyPair: false,
      institutionalOnly: true
    });
  }
  
  /**
   * Load pair restrictions from validator
   */
  private async loadPairRestrictions(): Promise<void> {
    try {
      const response = await fetch(`${this.validatorEndpoint}/pairs/restrictions`);
      if (!response.ok) return;
      
      const restrictions = await response.json();
      
      for (const restriction of restrictions) {
        this.pairRestrictions.set(restriction.pair, restriction);
      }
    } catch (error) {
      console.error('Error loading pair restrictions:', error);
    }
  }
  
  /**
   * Get pair restrictions
   */
  private async getPairRestrictions(pair: string): Promise<PairRestrictions> {
    const cached = this.pairRestrictions.get(pair);
    if (cached) return cached;
    
    // Default unrestricted
    return {
      pair,
      minTier: DEXKYCTier.TIER_1,
      geoRestrictions: [],
      requiredVerifications: [],
      isPrivacyPair: pair.includes('pXOM'),
      institutionalOnly: false
    };
  }
  
  /**
   * Process trader data from API
   */
  private processTraderData(address: string, data: any): TraderKYCStatus {
    const tier = data.currentTier || DEXKYCTier.TIER_0;
    
    return {
      address,
      currentTier: tier,
      isVerified: tier > DEXKYCTier.TIER_0,
      isInstitutional: tier === DEXKYCTier.TIER_4,
      features: this.TIER_FEATURES[tier],
      limits: this.TIER_LIMITS[tier],
      feeTier: this.FEE_DISCOUNTS[tier],
      vipStatus: data.vipStatus || 'none',
      compliance: {
        canTradeUS: data.compliance?.canTradeUS || false,
        canTradeEU: data.compliance?.canTradeEU || false,
        canTradeRestricted: tier >= DEXKYCTier.TIER_3,
        sanctionsCheck: data.compliance?.sanctionsCheck || false,
        lastCheckDate: data.compliance?.lastCheckDate || Date.now()
      },
      marketMaker: {
        isMarketMaker: data.marketMaker?.isMarketMaker || false,
        makerRebate: data.marketMaker?.makerRebate || 0,
        tier: data.marketMaker?.tier || 'none'
      },
      expiryDate: data.expiryDate,
      lastUpdated: Date.now()
    };
  }
  
  /**
   * Get default trader status
   */
  private getDefaultTraderStatus(address: string): TraderKYCStatus {
    return {
      address,
      currentTier: DEXKYCTier.TIER_0,
      isVerified: false,
      isInstitutional: false,
      features: this.TIER_FEATURES[DEXKYCTier.TIER_0],
      limits: this.TIER_LIMITS[DEXKYCTier.TIER_0],
      feeTier: 0,
      vipStatus: 'none',
      compliance: {
        canTradeUS: false,
        canTradeEU: false,
        canTradeRestricted: false,
        sanctionsCheck: false,
        lastCheckDate: Date.now()
      },
      marketMaker: {
        isMarketMaker: false,
        makerRebate: 0,
        tier: 'none'
      },
      lastUpdated: Date.now()
    };
  }
}

export default DEXKYCService;