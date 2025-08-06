/**
 * DEX Client Module
 * 
 * Client implementations for DEX services
 */

/**
 * Export ValidatorClient class and factory function
 */
export { ValidatorClient, createAvalancheValidatorClient } from './ValidatorClient';
/**
 * Re-export client types for convenience
 */
export type { 
  AvalancheValidatorClient, 
  AvalancheValidatorClientConfig,
  HealthStatus,
  OrderBookData,
  PlaceOrderRequest
} from '../types/client';