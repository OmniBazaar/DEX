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
import * as OmniCoreABI from '../../../Coin/artifacts/contracts/OmniCore.sol/OmniCore.json';

/**
 * Settlement data for on-chain trade
 */
export interface SettlementData {
  /**
   * Buyer's Ethereum address
   */
  buyer: string;
  /**
   * Seller's Ethereum address
   */
  seller: string;
  /**
   * Token contract address
   */
  token: string;
  /**
   * Amount being traded in wei
   */
  amount: string;
  /**
   * Unique order identifier
   */
  orderId: string;
}

/**
 * Batch settlement data
 */
export interface BatchSettlementData {
  /**
   * Array of buyer addresses
   */
  buyers: string[];
  /**
   * Array of seller addresses
   */
  sellers: string[];
  /**
   * Array of token contract addresses
   */
  tokens: string[];
  /**
   * Array of amounts in wei
   */
  amounts: string[];
  /**
   * Unique batch identifier
   */
  batchId: string;
}

/**
 * DEX deposit/withdrawal result
 */
export interface TransactionResult {
  /**
   * Whether the transaction was successful
   */
  success: boolean;
  /**
   * Transaction hash if successful
   */
  txHash?: string;
  /**
   * Block number where transaction was mined
   */
  blockNumber?: number;
  /**
   * Error message if transaction failed
   */
  error?: string;
}

/**
 * Contract configuration
 */
export interface ContractConfig {
  /**
   * OmniCore smart contract address
   */
  contractAddress: string;
  /**
   * Ethereum provider RPC URL
   */
  providerUrl: string;
  /**
   * Private key for signing transactions
   */
  privateKey?: string;
  /**
   * Gas limit for transactions
   */
  gasLimit?: number;
  /**
   * Gas price in wei
   */
  gasPrice?: string;
  /**
   * Number of confirmations to wait
   */
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
  
  /**
   * Creates a new Contract Service instance
   * @param config - Contract configuration including address and provider settings
   */
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
    if (config.privateKey !== undefined && config.privateKey !== null && config.privateKey.length > 0) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }
    
    // Initialize contract
    this.contract = new ethers.Contract(
      config.contractAddress,
      OmniCoreABI.abi as ethers.InterfaceAbi,
      this.signer ?? this.provider
    );
    
    void this.initialize();
  }
  
  /**
   * Initialize contract service
   */
  private async initialize(): Promise<void> {
    try {
      // Get fee recipient addresses from contract
      const oddaoFunc = this.contract.oddaoAddress as (() => Promise<string>) | undefined;
      const stakingPoolFunc = this.contract.stakingPoolAddress as (() => Promise<string>) | undefined;
      
      if (oddaoFunc !== undefined) {
        this.oddaoAddress = await oddaoFunc();
      } else {
        this.oddaoAddress = '0x0000000000000000000000000000000000000000';
      }
      
      if (stakingPoolFunc !== undefined) {
        this.stakingPoolAddress = await stakingPoolFunc();
      } else {
        this.stakingPoolAddress = '0x0000000000000000000000000000000000000000';
      }
      
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
   * @param token - Token contract address
   * @param amount - Amount to deposit in wei
   * @param userAddress - Optional user address for validation
   * @returns Promise resolving to transaction result
   */
  async depositToDEX(
    token: string,
    amount: string,
    userAddress?: string
  ): Promise<TransactionResult> {
    try {
      if (this.signer === undefined && (userAddress === undefined || userAddress === null || userAddress.length === 0)) {
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
      
      const approveFunc = tokenContract.approve as (spender: string, amount: string) => Promise<ethers.ContractTransactionResponse>;
      const approveTx = await approveFunc(
        this.config.contractAddress,
        amount
      );
      await approveTx.wait(this.config.confirmations);
      
      // Deposit to DEX
      const depositFunc = this.contract.depositToDEX as (token: string, amount: string, overrides: ethers.Overrides) => Promise<ethers.ContractTransactionResponse>;
      const tx = await depositFunc(
        token,
        amount,
        {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      if (receipt === null) {
        return {
          success: false,
          error: 'Transaction receipt not found'
        };
      }
      
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
   * @param token - Token contract address
   * @param amount - Amount to withdraw in wei
   * @returns Promise resolving to transaction result
   */
  async withdrawFromDEX(
    token: string,
    amount: string
  ): Promise<TransactionResult> {
    try {
      if (this.signer === undefined || this.signer === null) {
        return {
          success: false,
          error: 'No signer provided'
        };
      }
      
      const withdrawFunc = this.contract.withdrawFromDEX as (token: string, amount: string, overrides: ethers.Overrides) => Promise<ethers.ContractTransactionResponse>;
      const tx = await withdrawFunc(
        token,
        amount,
        {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      if (receipt === null) {
        return {
          success: false,
          error: 'Transaction receipt not found'
        };
      }
      
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
   * @param settlement - Settlement data including buyer, seller, token, and amount
   * @returns Promise resolving to transaction result
   */
  async settleDEXTrade(settlement: SettlementData): Promise<TransactionResult> {
    try {
      if (this.signer === undefined || this.signer === null) {
        return {
          success: false,
          error: 'No validator signer provided'
        };
      }
      
      // Check if signer has AVALANCHE_VALIDATOR_ROLE
      const hasRoleFunc = this.contract.hasRole as (role: string, account: string) => Promise<boolean>;
      const hasRole = await hasRoleFunc(
        ethers.keccak256(ethers.toUtf8Bytes('AVALANCHE_VALIDATOR_ROLE')),
        await this.signer.getAddress()
      );
      
      if (hasRole !== true) {
        return {
          success: false,
          error: 'Signer does not have validator role'
        };
      }
      
      const settleFunc = this.contract.settleDEXTrade as (
        buyer: string,
        seller: string,
        token: string,
        amount: string,
        orderId: string,
        overrides: ethers.Overrides
      ) => Promise<ethers.ContractTransactionResponse>;
      const tx = await settleFunc(
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
      
      if (receipt === null) {
        return {
          success: false,
          error: 'Transaction receipt not found'
        };
      }
      
      // Parse DEXSettlement event for logging
      const _settlementEvent = receipt.logs.find((log: ethers.Log) => {
        try {
          const iface = this.contract.interface;
          if (iface === undefined || iface === null) return false;
          const parsed = iface.parseLog({
            topics: [...log.topics] as [string, ...string[]],
            data: log.data
          });
          return parsed !== null && parsed.name === 'DEXSettlement';
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
   * @param batch - Batch settlement data with arrays of trades
   * @returns Promise resolving to transaction result
   */
  async batchSettleDEX(batch: BatchSettlementData): Promise<TransactionResult> {
    try {
      if (this.signer === undefined || this.signer === null) {
        return {
          success: false,
          error: 'No validator signer provided'
        };
      }
      
      // Check validator role
      const hasRoleFunc = this.contract.hasRole as (role: string, account: string) => Promise<boolean>;
      const hasRole = await hasRoleFunc(
        ethers.keccak256(ethers.toUtf8Bytes('AVALANCHE_VALIDATOR_ROLE')),
        await this.signer.getAddress()
      );
      
      if (hasRole !== true) {
        return {
          success: false,
          error: 'Signer does not have validator role'
        };
      }
      
      const batchSettleFunc = this.contract.batchSettleDEX as (
        buyers: string[],
        sellers: string[],
        tokens: string[],
        amounts: string[],
        batchId: string,
        overrides: ethers.Overrides
      ) => Promise<ethers.ContractTransactionResponse>;
      const tx = await batchSettleFunc(
        batch.buyers,
        batch.sellers,
        batch.tokens,
        batch.amounts,
        ethers.encodeBytes32String(batch.batchId),
        {
          gasLimit: (this.config.gasLimit ?? 500000) * 2, // Higher gas for batch
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      if (receipt === null) {
        return {
          success: false,
          error: 'Transaction receipt not found'
        };
      }
      
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
   * @param token - Token contract address for fee distribution
   * @param totalFee - Total fee amount to distribute
   * @param validatorAddress - Address of the validator receiving 10% fee
   * @returns Promise resolving to transaction result
   */
  async distributeDEXFees(
    token: string,
    totalFee: string,
    validatorAddress: string
  ): Promise<TransactionResult> {
    try {
      if (this.signer === undefined || this.signer === null) {
        return {
          success: false,
          error: 'No validator signer provided'
        };
      }
      
      const distributeFeeFunc = this.contract.distributeDEXFees as (
        token: string,
        totalFee: string,
        validatorAddress: string,
        overrides: ethers.Overrides
      ) => Promise<ethers.ContractTransactionResponse>;
      const tx = await distributeFeeFunc(
        token,
        totalFee,
        validatorAddress,
        {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        }
      );
      
      const receipt = await tx.wait(this.config.confirmations);
      
      if (receipt === null) {
        return {
          success: false,
          error: 'Transaction receipt not found'
        };
      }
      
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
   * @param user - User's Ethereum address
   * @param token - Token contract address
   * @returns Promise resolving to balance string in wei
   */
  async getDEXBalance(user: string, token: string): Promise<string> {
    try {
      const getBalanceFunc = this.contract.getDEXBalance as (user: string, token: string) => Promise<bigint>;
      const balance = await getBalanceFunc(user, token);
      return balance.toString();
    } catch (error) {
      logger.error('Failed to get DEX balance:', error);
      return '0';
    }
  }
  
  /**
   * Check if address is a validator
   * @param address - Address to check for validator status
   * @returns Promise resolving to true if address is a validator
   */
  async isValidator(address: string): Promise<boolean> {
    try {
      const isValidatorFunc = this.contract.isValidator as (address: string) => Promise<boolean>;
      return await isValidatorFunc(address);
    } catch (error) {
      logger.error('Failed to check validator status:', error);
      return false;
    }
  }
  
  /**
   * Set signer for transactions
   * @param signer - Ethereum signer instance
   */
  setSigner(signer: ethers.Signer): void {
    this.signer = signer;
    this.contract = new ethers.Contract(
      this.config.contractAddress,
      OmniCoreABI.abi as ethers.InterfaceAbi,
      signer
    );
  }
  
  /**
   * Get contract instance
   * @returns Ethers contract instance
   */
  getContract(): ethers.Contract {
    return this.contract;
  }
  
  /**
   * Get provider instance
   * @returns Ethers provider instance
   */
  getProvider(): ethers.Provider {
    return this.provider;
  }
  
  /**
   * Estimate gas for DEX deposit
   * @param token - Token contract address
   * @param amount - Amount to deposit in wei
   * @returns Promise resolving to estimated gas amount
   */
  async estimateDepositGas(token: string, amount: string): Promise<bigint> {
    try {
      interface ContractWithDepositFunction {
        depositToDEX?: {
          estimateGas: (token: string, amount: string) => Promise<bigint>;
        };
      }
      
      const contractWithFunc = this.contract as ContractWithDepositFunction;
      const depositFunc = contractWithFunc.depositToDEX;
      
      if (depositFunc === undefined) {
        return BigInt(this.config.gasLimit ?? 500000);
      }
      
      const estimate = await depositFunc.estimateGas(token, amount);
      return estimate;
    } catch (error) {
      logger.error('Failed to estimate gas:', error);
      return BigInt(this.config.gasLimit ?? 500000);
    }
  }
  
  /**
   * Estimate gas for DEX withdrawal
   * @param token - Token contract address
   * @param amount - Amount to withdraw in wei
   * @returns Promise resolving to estimated gas amount
   */
  async estimateWithdrawGas(token: string, amount: string): Promise<bigint> {
    try {
      interface ContractWithWithdrawFunction {
        withdrawFromDEX?: {
          estimateGas: (token: string, amount: string) => Promise<bigint>;
        };
      }
      
      const contractWithFunc = this.contract as ContractWithWithdrawFunction;
      const withdrawFunc = contractWithFunc.withdrawFromDEX;
      
      if (withdrawFunc === undefined) {
        return BigInt(this.config.gasLimit ?? 500000);
      }
      
      const estimate = await withdrawFunc.estimateGas(token, amount);
      return estimate;
    } catch (error) {
      logger.error('Failed to estimate gas:', error);
      return BigInt(this.config.gasLimit ?? 500000);
    }
  }
  
  /**
   * Listen for DEX settlement events
   * @param callback - Callback function to handle settlement events
   */
  onSettlement(callback: (event: {
    buyer: string;
    seller: string;
    token: string;
    amount: string;
    orderId: string;
    blockNumber: number;
    transactionHash: string;
  }) => void): void {
    void this.contract.on('DEXSettlement', (
      buyer: string,
      seller: string,
      token: string,
      amount: bigint,
      orderId: string,
      event: ethers.Log
    ) => {
      callback({
        buyer,
        seller,
        token,
        amount: amount.toString(),
        orderId,
        blockNumber: event.blockNumber ?? 0,
        transactionHash: event.transactionHash ?? ''
      });
    });
  }
  
  /**
   * Listen for batch settlement events
   * @param callback - Callback function to handle batch settlement events
   */
  onBatchSettlement(callback: (event: {
    batchId: string;
    count: string;
    blockNumber: number;
    transactionHash: string;
  }) => void): void {
    void this.contract.on('BatchSettlement', (
      batchId: string,
      count: bigint,
      event: ethers.Log
    ) => {
      callback({
        batchId,
        count: count.toString(),
        blockNumber: event.blockNumber ?? 0,
        transactionHash: event.transactionHash ?? ''
      });
    });
  }
  
  /**
   * Stop listening to events
   */
  removeAllListeners(): void {
    void this.contract.removeAllListeners();
  }
}

export default ContractService;