/**
 * Precision constants for OmniCoin DEX
 * Updated to 18-digit precision per OmniBazaar Design Checkpoint
 */

import { ethers } from 'ethers';

/** OmniCoin decimal places (updated from 6 to 18 per design checkpoint) */
export const OMNICOIN_DECIMALS = 18;

/** Precision multiplier for calculations (10^18) */
export const PRECISION = ethers.parseUnits('1', OMNICOIN_DECIMALS);

/** Minimum trade amount in base units (0.001 XOM) */
export const MIN_TRADE_AMOUNT = ethers.parseUnits('0.001', OMNICOIN_DECIMALS);

/** Minimum order size in base units (0.01 XOM) */
export const MIN_ORDER_SIZE = ethers.parseUnits('0.01', OMNICOIN_DECIMALS);

/** Maximum uint256 value for safety checks */
export const MAX_UINT256 = (2n ** 256n) - 1n;

/** Maximum safe integer value */
export const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

/** Number of decimal places to display for prices */
export const PRICE_DISPLAY_DECIMALS = 8;

/** Number of decimal places to display for quantities */
export const QUANTITY_DISPLAY_DECIMALS = 6;

/**
 * Convert amount to wei (base units) with 18-digit precision
 * @param amount - Amount to convert (string or number)
 * @returns BigInt representation in wei
 * @example
 * ```typescript
 * const weiAmount = toWei('1.5'); // 1.5 XOM in wei
 * ```
 */
export function toWei(amount: string | number): bigint {
  return ethers.parseUnits(amount.toString(), OMNICOIN_DECIMALS);
}

/**
 * Convert amount from wei (base units) to decimal string
 * @param amount - Amount in wei to convert
 * @returns Decimal string representation
 * @example
 * ```typescript
 * const decimal = fromWei(ethers.parseEther('1')); // '1'
 * ```
 */
export function fromWei(amount: bigint | string): string {
  const bn = typeof amount === 'string' ? BigInt(amount) : amount;
  return ethers.formatUnits(bn, OMNICOIN_DECIMALS);
}

/**
 * Convert amount to display format with specified decimal places
 * @param amount - Amount to format
 * @param decimals - Number of decimal places to show (default: QUANTITY_DISPLAY_DECIMALS)
 * @returns Formatted display string
 * @example
 * ```typescript
 * const display = toDisplayAmount(ethers.parseEther('1.23456789'), 4); // '1.2345'
 * ```
 */
export function toDisplayAmount(amount: bigint | string, decimals: number = QUANTITY_DISPLAY_DECIMALS): string {
  const bn = typeof amount === 'string' ? BigInt(amount) : amount;
  const formatted = ethers.formatUnits(bn, OMNICOIN_DECIMALS);
  const parts = formatted.split('.');
  const wholePart = parts[0] ?? '0';
  const fractionalPart = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);
  
  return decimals > 0 ? `${wholePart}.${fractionalPart}` : wholePart;
}

/**
 * Calculate price from base and quote amounts with 18-digit precision
 * @param baseAmount - Amount of base asset
 * @param quoteAmount - Amount of quote asset
 * @returns Price as bigint (quote/base * PRECISION)
 * @example
 * ```typescript
 * const price = calculatePrice(ethers.parseEther('100'), ethers.parseEther('50')); // 0.5 price
 * ```
 */
export function calculatePrice(baseAmount: bigint, quoteAmount: bigint): bigint {
  // price = quoteAmount * PRECISION / baseAmount
  return (quoteAmount * PRECISION) / baseAmount;
}

/**
 * Calculate quote amount from base amount and price
 * @param baseAmount - Amount of base asset
 * @param price - Price (with PRECISION multiplier)
 * @returns Quote amount as bigint
 * @example
 * ```typescript
 * const quoteAmount = calculateQuoteAmount(ethers.parseEther('10'), priceWithPrecision);
 * ```
 */
export function calculateQuoteAmount(baseAmount: bigint, price: bigint): bigint {
  // quoteAmount = baseAmount * price / PRECISION
  return (baseAmount * price) / PRECISION;
}

/**
 * Calculate base amount from quote amount and price
 * @param quoteAmount - Amount of quote asset
 * @param price - Price (with PRECISION multiplier)
 * @returns Base amount as bigint
 * @example
 * ```typescript
 * const baseAmount = calculateBaseAmount(ethers.parseEther('100'), priceWithPrecision);
 * ```
 */
export function calculateBaseAmount(quoteAmount: bigint, price: bigint): bigint {
  // baseAmount = quoteAmount * PRECISION / price
  return (quoteAmount * PRECISION) / price;
}

/**
 * Apply slippage to an amount using basis points
 * @param amount - Original amount
 * @param slippageBps - Slippage in basis points (1% = 100 bps)
 * @returns Amount after applying slippage
 * @example
 * ```typescript
 * const slippedAmount = applySlippage(ethers.parseEther('100'), 250); // 2.5% slippage
 * ```
 */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  // slippageBps = basis points (1% = 100 bps)
  const slippageMultiplier = BigInt(10000 - slippageBps);
  return (amount * slippageMultiplier) / 10000n;
}

/**
 * Calculate fee amount using basis points
 * @param amount - Amount to calculate fee on
 * @param feeBps - Fee in basis points (0.1% = 10 bps)
 * @returns Fee amount as bigint
 * @example
 * ```typescript
 * const fee = calculateFee(ethers.parseEther('100'), 25); // 0.25% fee
 * ```
 */
export function calculateFee(amount: bigint, feeBps: number): bigint {
  // feeBps = basis points (0.1% = 10 bps)
  return (amount * BigInt(feeBps)) / 10000n;
}

/**
 * Validate that an amount string can be converted to a valid BigInt
 * @param amount - Amount string to validate
 * @returns True if amount is valid, false otherwise
 * @example
 * ```typescript
 * const isValid = validatePrecision('123.456'); // true
 * const isInvalid = validatePrecision('abc'); // false
 * ```
 */
export function validatePrecision(amount: string): boolean {
  try {
    const bn = BigInt(amount);
    return bn >= 0n && bn <= MAX_UINT256;
  } catch {
    return false;
  }
}

/**
 * Round price to nearest tick for AMM integration
 * @param price - Price to round
 * @param tickSpacing - Tick spacing for rounding
 * @returns Rounded price as bigint
 * @example
 * ```typescript
 * const roundedPrice = roundToTick(priceInWei, 100); // Round to nearest 100 tick
 * ```
 */
export function roundToTick(price: bigint, tickSpacing: number): bigint {
  // This is a simplified version - real implementation would use TickMath
  const tickSpacingBig = BigInt(tickSpacing);
  const tick = (price / tickSpacingBig) * tickSpacingBig;
  return tick;
}