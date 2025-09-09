/**
 * ID Generation Utilities for DEX Module
 * 
 * Provides consistent UUID generation for database entities.
 * Uses crypto.randomUUID() for proper UUID v4 generation.
 * 
 * @module utils/id-generator
 */

import * as crypto from 'crypto';

/**
 * Generate a UUID v4 for database entities
 * 
 * @returns A valid UUID v4 string
 */
export function generateUUID(): string {
  // In browser environment, use crypto.randomUUID()
  // In Node.js, it's also available in crypto module
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return crypto.randomUUID();
}

/**
 * Generate an order ID (UUID)
 * 
 * @returns A valid UUID for database storage
 */
export function generateOrderId(): string {
  return generateUUID();
}

/**
 * Generate a trade ID (UUID)
 * 
 * @returns A valid UUID for database storage
 */
export function generateTradeId(): string {
  return generateUUID();
}

/**
 * Generate a batch ID (UUID)
 * 
 * @returns A valid UUID for database storage
 */
export function generateBatchId(): string {
  return generateUUID();
}

/**
 * Generate a settlement ID (UUID)
 * 
 * @returns A valid UUID for database storage
 */
export function generateSettlementId(): string {
  return generateUUID();
}

/**
 * Check if a string is a valid UUID
 * 
 * @param id - String to check
 * @returns True if valid UUID format
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Generate a deterministic UUID from order parameters
 * Useful for preventing duplicate orders
 * 
 * @param params - Order parameters to hash
 * @param params.maker - The maker address
 * @param params.tokenPair - The trading pair identifier
 * @param params.price - The order price as string
 * @param params.amount - The order amount as string
 * @param params.nonce - The nonce value for uniqueness
 * @returns A deterministic UUID-like string
 */
export function generateDeterministicOrderId(params: {
  maker: string;
  tokenPair: string;
  price: string;
  amount: string;
  nonce: number;
}): string {
  const hash = crypto.createHash('sha256')
    .update(params.maker)
    .update(params.tokenPair)
    .update(params.price)
    .update(params.amount)
    .update(params.nonce.toString())
    .digest('hex');
  
  // Format as UUID
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // Version 4
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // Variant
    hash.slice(20, 32)
  ].join('-');
}

/**
 * ID generation strategies for DEX
 */
export const IdGenerators = {
  // Database entities (use UUIDs)
  order: generateOrderId,
  trade: generateTradeId,
  batch: generateBatchId,
  settlement: generateSettlementId,
  uuid: generateUUID,
  
  // Deterministic IDs
  deterministicOrder: generateDeterministicOrderId,
  
  // Validation
  isValid: isValidUUID
};

export default IdGenerators;