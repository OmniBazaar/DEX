/**
 * DEX Client Module
 * 
 * Client implementations for DEX services
 */

/**
 * Export ValidatorClient class and factory function
 */
export { ValidatorClient, createOmniValidatorClient } from './ValidatorClient';
/**
 * Re-export client types for convenience
 */
export type { 
  OmniValidatorClient, 
  OmniValidatorClientConfig,
  HealthStatus,
  OrderBookData,
  PlaceOrderRequest
} from '../types/client';