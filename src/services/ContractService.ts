/**
 * Contract Service for DEX Integration
 * 
 * Connects DEX module to OmniCore.sol smart contract for on-chain settlement.
 * Handles deposits, withdrawals, trade settlements, and fee distribution.
 * 
 * @module services/ContractService
 */

import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import OmniCoreABI from '../../../Coin/artifacts/contracts/OmniCore.sol/OmniCore.json';

/**
 * Settlement data for on-chain trade
 */
export interface SettlementData {
  buyer: string;
  seller: string;
  token: string;
  amount: string;
  orderId: string;
}

/**
 * Batch settlement data
 */
export interface BatchSettlementData {
  buyers: string[];
  sellers: string[];
  tokens: string[];
  amounts: string[];
  batchId: string;
}

/**
 * DEX deposit/withdrawal result
 */
export interface TransactionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
}

/**
 * Contract configuration
 */
export interface ContractConfig {
  contractAddress: string;
  providerUrl: string;
  privateKey?: string;
  gasLimit?: number;
  gasPrice?: string;
  confirmations?: number;
}

/**
 * Contract Service for DEX operations
 */
export class ContractService {
  private contract: ethers.Contract;
  private provider: ethers.Provider;
  private signer?: ethers.Signer;
  private config: ContractConfig;
  
  // Fee distribution addresses (from OmniCore)
  private oddaoAddress?: string;
  private stakingPoolAddress?: string;
  
  constructor(config: ContractConfig) {
    this.config = {
      gasLimit: 500000,
      gasPrice: ethers.parseUnits('20', 'gwei').toString(),
      confirmations: 1,
      ...config
    };
    
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(config.providerUrl);
    
    // Initialize signer if private key provided
    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }
    
    // Initialize contract
    this.contract = new ethers.Contract(
      config.contractAddress,
      OmniCoreABI.abi,
      this.signer || this.provider
    );
    
    this.initialize();
  }
  
  /**
   * Initialize contract service
   */
  private async initialize(): Promise<void> {
    try {
      // Get fee recipient addresses from contract
      this.oddaoAddress = await this.contract.oddaoAddress?.() || '0x0000000000000000000000000000000000000000';
      this.stakingPoolAddress = await this.contract.stakingPoolAddress?.() || '0x0000000000000000000000000000000000000000';
      
      logger.info('Contract service initialized', {
        contractAddress: this.config.contractAddress,
        oddaoAddress: this.oddaoAddress,
        stakingPoolAddress: this.stakingPoolAddress
      });
    } catch (error) {
      logger.error('Failed to initialize contract service:', error);
    }
  }
  
  /**
   * Deposit tokens to DEX
   */
  async depositToDEX(
    token: string,
    amount: string,
    userAddress?: string
  ): Promise<TransactionResult> {
    try {
      if (!this.signer && !userAddress) {
        return {
          success: false,
          error: 'No signer or user address provided'
        };
      }
      
      // First approve token transfer if needed
      const tokenContract = new ethers.Contract(
        token,
        ['function approve(address spender, uint256 amount) external returns (bool)'],
        this.signer
      );
      
      const approveTx = await tokenContract.approve!(
        this.config.contractAddress,
        amount
      );
      await approveTx.wait(this.config.confirmations);
      
      // Deposit to DEX
      const tx = await this.contract.depositToDEX!(
        token,
        amount,
        {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      logger.info('DEX deposit successful', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        token,
        amount
      });
      
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.error('DEX deposit failed:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Withdraw tokens from DEX
   */
  async withdrawFromDEX(
    token: string,
    amount: string
  ): Promise<TransactionResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: 'No signer provided'
        };
      }
      
      const tx = await this.contract.withdrawFromDEX!(
        token,
        amount,
        {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      logger.info('DEX withdrawal successful', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        token,
        amount
      });
      
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.error('DEX withdrawal failed:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Settle a DEX trade on-chain
   */
  async settleDEXTrade(settlement: SettlementData): Promise<TransactionResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: 'No validator signer provided'
        };
      }
      
      // Check if signer has AVALANCHE_VALIDATOR_ROLE
      const hasRole = await this.contract.hasRole!(
        ethers.keccak256(ethers.toUtf8Bytes('AVALANCHE_VALIDATOR_ROLE')),
        await this.signer.getAddress()
      );
      
      if (!hasRole) {
        return {
          success: false,
          error: 'Signer does not have validator role'
        };
      }
      
      const tx = await this.contract.settleDEXTrade!(
        settlement.buyer,
        settlement.seller,
        settlement.token,
        settlement.amount,
        ethers.encodeBytes32String(settlement.orderId),
        {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      // Parse DEXSettlement event
      const settlementEvent = receipt.logs.find((log: any) => {
        try {
          const iface = this.contract?.interface;
          if (!iface) return false;
          const parsed = iface.parseLog(log as any);
          return parsed?.name === 'DEXSettlement';
        } catch {
          return false;
        }
      });
      
      logger.info('DEX trade settled on-chain', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        buyer: settlement.buyer,
        seller: settlement.seller,
        amount: settlement.amount
      });
      
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.error('DEX settlement failed:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Batch settle multiple DEX trades
   */
  async batchSettleDEX(batch: BatchSettlementData): Promise<TransactionResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: 'No validator signer provided'
        };
      }
      
      // Check validator role
      const hasRole = await this.contract.hasRole!(
        ethers.keccak256(ethers.toUtf8Bytes('AVALANCHE_VALIDATOR_ROLE')),
        await this.signer.getAddress()
      );
      
      if (!hasRole) {
        return {
          success: false,
          error: 'Signer does not have validator role'
        };
      }
      
      const tx = await this.contract.batchSettleDEX!(
        batch.buyers,
        batch.sellers,
        batch.tokens,
        batch.amounts,
        ethers.encodeBytes32String(batch.batchId),
        {
          gasLimit: (this.config.gasLimit || 500000) * 2, // Higher gas for batch
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      logger.info('Batch DEX settlement successful', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        batchId: batch.batchId,
        count: batch.buyers.length
      });
      
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.error('Batch DEX settlement failed:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Distribute DEX fees according to tokenomics
   * 70% ODDAO, 20% Staking, 10% Validator
   */
  async distributeDEXFees(
    token: string,
    totalFee: string,
    validatorAddress: string
  ): Promise<TransactionResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: 'No validator signer provided'
        };
      }
      
      const tx = await this.contract.distributeDEXFees!(
        token,
        totalFee,
        validatorAddress,
        {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      logger.info('DEX fees distributed', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        token,
        totalFee,
        validator: validatorAddress
      });
      
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.error('DEX fee distribution failed:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Get user's DEX balance
   */
  async getDEXBalance(user: string, token: string): Promise<string> {
    try {
      const balance = await this.contract.getDEXBalance!(user, token);
      return balance.toString();
    } catch (error) {
      logger.error('Failed to get DEX balance:', error);
      return '0';
    }
  }
  
  /**
   * Check if address is a validator
   */
  async isValidator(address: string): Promise<boolean> {
    try {
      return await this.contract.isValidator!(address);
    } catch (error) {
      logger.error('Failed to check validator status:', error);
      return false;
    }
  }
  
  /**
   * Set signer for transactions
   */
  setSigner(signer: ethers.Signer): void {
    this.signer = signer;
    this.contract = new ethers.Contract(
      this.config.contractAddress,
      OmniCoreABI.abi,
      signer
    );
  }
  
  /**
   * Get contract instance
   */
  getContract(): ethers.Contract {
    return this.contract;
  }
  
  /**
   * Get provider instance
   */
  getProvider(): ethers.Provider {
    return this.provider;
  }
  
  /**
   * Estimate gas for DEX deposit
   */
  async estimateDepositGas(token: string, amount: string): Promise<bigint> {
    try {
      const depositFunc = this.contract.depositToDEX;
      if (!depositFunc) return BigInt(this.config.gasLimit || 500000);
      const estimate = await depositFunc.estimateGas(
        token,
        amount
      );
      return estimate;
    } catch (error) {
      logger.error('Failed to estimate gas:', error);
      return BigInt(this.config.gasLimit || 500000);
    }
  }
  
  /**
   * Estimate gas for DEX withdrawal
   */
  async estimateWithdrawGas(token: string, amount: string): Promise<bigint> {
    try {
      const withdrawFunc = this.contract.withdrawFromDEX;
      if (!withdrawFunc) return BigInt(this.config.gasLimit || 500000);
      const estimate = await withdrawFunc.estimateGas(
        token,
        amount
      );
      return estimate;
    } catch (error) {
      logger.error('Failed to estimate gas:', error);
      return BigInt(this.config.gasLimit || 500000);
    }
  }
  
  /**
   * Listen for DEX settlement events
   */
  onSettlement(callback: (event: any) => void): void {
    this.contract.on('DEXSettlement', (buyer, seller, token, amount, orderId, event) => {
      callback({
        buyer,
        seller,
        token,
        amount: amount.toString(),
        orderId,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });
    });
  }
  
  /**
   * Listen for batch settlement events
   */
  onBatchSettlement(callback: (event: any) => void): void {
    this.contract.on('BatchSettlement', (batchId, count, event) => {
      callback({
        batchId,
        count: count.toString(),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });
    });
  }
  
  /**
   * Stop listening to events
   */
  removeAllListeners(): void {
    this.contract.removeAllListeners();
  }
}

export default ContractService;