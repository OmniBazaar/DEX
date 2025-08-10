/**
 * Validator Service Proxy
 * 
 * Provides proxy interfaces to Validator module services without direct imports.
 * This maintains module boundaries while allowing DEX to interact with Validator services.
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import { io, Socket } from 'socket.io-client';
import { logger } from '../../utils/logger';

/**
 * Configuration for Validator service proxy
 */
export interface ValidatorProxyConfig {
  /** Base URL of the Validator service */
  validatorUrl: string;
  /** WebSocket URL for real-time connections */
  wsUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable local mock mode for testing */
  mockMode?: boolean;
}

/**
 * Storage service interface
 */
export interface IStorageService {
  status: string;
  ipfsConnected: boolean;
  store(data: Buffer, metadata?: Record<string, unknown>): Promise<string>;
  retrieve(hash: string): Promise<Buffer>;
  pin(hash: string): Promise<void>;
  unpin(hash: string): Promise<void>;
}

/**
 * Chat service interface
 */
export interface IChatService {
  status: string;
  connected: boolean;
  sendMessage(channel: string, message: string): Promise<void>;
  joinChannel(channel: string): Promise<void>;
  leaveChannel(channel: string): Promise<void>;
  onMessage(callback: (channel: string, message: string, sender: string) => void): void;
}

/**
 * Fee service interface
 */
export interface IFeeService {
  status: string;
  active: boolean;
  calculateFee(amount: bigint, feeType: string): bigint;
  distributeFees(fees: bigint, validators: string[]): Promise<void>;
  getValidatorShare(validator: string): Promise<bigint>;
}

/**
 * Block reward service interface
 */
export interface IBlockRewardService {
  status: string;
  calculateReward(blockHeight: number): bigint;
  distributeRewards(blockHeight: number, validators: string[]): Promise<void>;
  getValidatorRewards(validator: string): Promise<bigint>;
}

/**
 * Proxy implementation for Validator services
 */
export class ValidatorServiceProxy extends EventEmitter {
  private config: ValidatorProxyConfig;
  private httpClient: AxiosInstance;
  private wsClient?: Socket;
  private connected = false;

  // Service implementations
  public storage: IStorageService;
  public chat: IChatService;
  public fees: IFeeService;
  public rewards: IBlockRewardService;

  constructor(config: ValidatorProxyConfig) {
    super();
    this.config = config;

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: config.validatorUrl,
      timeout: config.timeout || 30000,
      headers: config.apiKey ? { 'X-API-Key': config.apiKey } : {}
    });

    // Initialize services
    this.storage = this.createStorageProxy();
    this.chat = this.createChatProxy();
    this.fees = this.createFeeProxy();
    this.rewards = this.createRewardProxy();

    // Initialize WebSocket if URL provided
    if (config.wsUrl && !config.mockMode) {
      this.initializeWebSocket();
    }
  }

  /**
   * Initialize WebSocket connection
   */
  private initializeWebSocket(): void {
    if (!this.config.wsUrl) return;

    this.wsClient = io(this.config.wsUrl, {
      auth: this.config.apiKey ? { token: this.config.apiKey } : undefined,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.wsClient.on('connect', () => {
      this.connected = true;
      logger.info('Connected to Validator WebSocket');
      this.emit('connected');
    });

    this.wsClient.on('disconnect', () => {
      this.connected = false;
      logger.warn('Disconnected from Validator WebSocket');
      this.emit('disconnected');
    });

    this.wsClient.on('error', (error) => {
      logger.error('WebSocket error:', error);
      this.emit('error', error as Error);
    });
  }

  /**
   * Create storage service proxy
   */
  private createStorageProxy(): IStorageService {
    const self = this;
    
    return {
      status: 'initialized',
      ipfsConnected: false,

      async store(data: Buffer, metadata?: Record<string, unknown>): Promise<string> {
        if (self.config.mockMode) {
          // Mock implementation for testing
          const hash = `Qm${Buffer.from(data).toString('hex').substring(0, 44)}`;
          logger.debug('Mock storage: stored data with hash', hash);
          return hash;
        }

        const response = await self.httpClient.post('/storage/store', {
          data: data.toString('base64'),
          metadata
        });
        return response.data.hash;
      },

      async retrieve(hash: string): Promise<Buffer> {
        if (self.config.mockMode) {
          // Mock implementation
          logger.debug('Mock storage: retrieving', hash);
          return Buffer.from('mock data');
        }

        const response = await self.httpClient.get(`/storage/retrieve/${hash}`);
        return Buffer.from(response.data.data, 'base64');
      },

      async pin(hash: string): Promise<void> {
        if (self.config.mockMode) {
          logger.debug('Mock storage: pinning', hash);
          return;
        }

        await self.httpClient.post(`/storage/pin/${hash}`);
      },

      async unpin(hash: string): Promise<void> {
        if (self.config.mockMode) {
          logger.debug('Mock storage: unpinning', hash);
          return;
        }

        await self.httpClient.post(`/storage/unpin/${hash}`);
      }
    };
  }

  /**
   * Create chat service proxy
   */
  private createChatProxy(): IChatService {
    const self = this;
    const messageCallbacks: Array<(channel: string, message: string, sender: string) => void> = [];

    // Set up WebSocket message handler
    if (this.wsClient) {
      this.wsClient.on('chat:message', (data: { channel: string; message: string; sender: string }) => {
        messageCallbacks.forEach(cb => cb(data.channel, data.message, data.sender));
      });
    }

    return {
      status: 'initialized',
      connected: false,

      async sendMessage(channel: string, message: string): Promise<void> {
        if (self.config.mockMode) {
          logger.debug('Mock chat: sending message to', channel);
          return;
        }

        if (self.wsClient?.connected) {
          self.wsClient.emit('chat:send', { channel, message });
        } else {
          await self.httpClient.post('/chat/send', { channel, message });
        }
      },

      async joinChannel(channel: string): Promise<void> {
        if (self.config.mockMode) {
          logger.debug('Mock chat: joining channel', channel);
          return;
        }

        if (self.wsClient?.connected) {
          self.wsClient.emit('chat:join', { channel });
        } else {
          await self.httpClient.post('/chat/join', { channel });
        }
      },

      async leaveChannel(channel: string): Promise<void> {
        if (self.config.mockMode) {
          logger.debug('Mock chat: leaving channel', channel);
          return;
        }

        if (self.wsClient?.connected) {
          self.wsClient.emit('chat:leave', { channel });
        } else {
          await self.httpClient.post('/chat/leave', { channel });
        }
      },

      onMessage(callback: (channel: string, message: string, sender: string) => void): void {
        messageCallbacks.push(callback);
      }
    };
  }

  /**
   * Create fee service proxy
   */
  private createFeeProxy(): IFeeService {
    const self = this;

    return {
      status: 'initialized',
      active: true,

      calculateFee(amount: bigint, feeType: string): bigint {
        // Standard fee calculation (can be done locally)
        const feeRates: Record<string, number> = {
          'trade': 0.003,  // 0.3%
          'swap': 0.003,   // 0.3%
          'listing': 0.001, // 0.1%
          'withdrawal': 0.002 // 0.2%
        };

        const rate = feeRates[feeType] || 0.003;
        return amount * BigInt(Math.floor(rate * 10000)) / 10000n;
      },

      async distributeFees(fees: bigint, validators: string[]): Promise<void> {
        if (self.config.mockMode) {
          logger.debug(`Mock fees: distributing ${fees.toString()} to ${validators.length} validators`);
          return;
        }

        await self.httpClient.post('/fees/distribute', {
          amount: fees.toString(),
          validators
        });
      },

      async getValidatorShare(validator: string): Promise<bigint> {
        if (self.config.mockMode) {
          return 1000000n; // Mock 1M units
        }

        const response = await self.httpClient.get(`/fees/share/${validator}`);
        return BigInt(response.data.share);
      }
    };
  }

  /**
   * Create block reward service proxy
   */
  private createRewardProxy(): IBlockRewardService {
    const self = this;

    return {
      status: 'initialized',

      calculateReward(blockHeight: number): bigint {
        // Standard reward calculation (can be done locally)
        const baseReward = 100n * 10n ** 18n; // 100 tokens
        const halvingInterval = 210000;
        const halvings = Math.floor(blockHeight / halvingInterval);
        
        if (halvings >= 64) return 0n;
        
        return baseReward / (2n ** BigInt(halvings));
      },

      async distributeRewards(blockHeight: number, validators: string[]): Promise<void> {
        if (self.config.mockMode) {
          logger.debug('Mock rewards: distributing for block', blockHeight);
          return;
        }

        await self.httpClient.post('/rewards/distribute', {
          blockHeight,
          validators
        });
      },

      async getValidatorRewards(validator: string): Promise<bigint> {
        if (self.config.mockMode) {
          return 5000000n; // Mock 5M units
        }

        const response = await self.httpClient.get(`/rewards/${validator}`);
        return BigInt(response.data.rewards);
      }
    };
  }

  /**
   * Connect to Validator services
   */
  async connect(): Promise<void> {
    if (this.config.mockMode) {
      this.connected = true;
      this.emit('connected');
      logger.info('Running in mock mode - no actual Validator connection');
      return;
    }

    try {
      // Test connection
      const response = await this.httpClient.get('/health');
      if (response.data.status === 'healthy') {
        this.connected = true;
        this.emit('connected');
        logger.info('Connected to Validator services');
      }
    } catch (error) {
      logger.error('Failed to connect to Validator services:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Validator services
   */
  async disconnect(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
    this.connected = false;
    this.emit('disconnected');
    logger.info('Disconnected from Validator services');
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<Record<string, unknown>> {
    if (this.config.mockMode) {
      return {
        status: 'healthy',
        mockMode: true,
        services: {
          storage: 'active',
          chat: 'active',
          fees: 'active',
          rewards: 'active'
        }
      };
    }

    const response = await this.httpClient.get('/health');
    return response.data;
  }
}

export default ValidatorServiceProxy;