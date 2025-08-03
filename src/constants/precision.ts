/**
 * Precision constants for OmniCoin DEX
 * Updated to 18-digit precision per OmniBazaar Design Checkpoint
 */

import { BigNumber } from 'ethers';

// OmniCoin decimal places (updated from 6 to 18)
export const OMNICOIN_DECIMALS = 18;

// Precision multiplier for calculations
export const PRECISION = BigNumber.from(10).pow(OMNICOIN_DECIMALS);

// Minimum trade amounts (in base units)
export const MIN_TRADE_AMOUNT = BigNumber.from(10).pow(15); // 0.001 XOM
export const MIN_ORDER_SIZE = BigNumber.from(10).pow(16); // 0.01 XOM

// Maximum values for safety
export const MAX_UINT256 = BigNumber.from(2).pow(256).sub(1);
export const MAX_SAFE_INTEGER = BigNumber.from(Number.MAX_SAFE_INTEGER);

// Price precision for order book (number of decimal places to display)
export const PRICE_DISPLAY_DECIMALS = 8;
export const QUANTITY_DISPLAY_DECIMALS = 6;

// Helper functions for precision conversion
export function toWei(amount: string | number): BigNumber {
  return BigNumber.from(amount).mul(PRECISION);
}

export function fromWei(amount: BigNumber | string): string {
  const bn = typeof amount === 'string' ? BigNumber.from(amount) : amount;
  return bn.div(PRECISION).toString();
}

export function toDisplayAmount(amount: BigNumber | string, decimals: number = QUANTITY_DISPLAY_DECIMALS): string {
  const bn = typeof amount === 'string' ? BigNumber.from(amount) : amount;
  const divisor = BigNumber.from(10).pow(OMNICOIN_DECIMALS);
  const wholePart = bn.div(divisor);
  const fractionalPart = bn.mod(divisor);
  
  // Format with specified decimal places
  const fractionalStr = fractionalPart.toString().padStart(OMNICOIN_DECIMALS, '0');
  const displayFractional = fractionalStr.slice(0, decimals);
  
  return `${wholePart}.${displayFractional}`;
}

// Price calculations with 18-digit precision
export function calculatePrice(baseAmount: BigNumber, quoteAmount: BigNumber): BigNumber {
  // price = quoteAmount * PRECISION / baseAmount
  return quoteAmount.mul(PRECISION).div(baseAmount);
}

export function calculateQuoteAmount(baseAmount: BigNumber, price: BigNumber): BigNumber {
  // quoteAmount = baseAmount * price / PRECISION
  return baseAmount.mul(price).div(PRECISION);
}

export function calculateBaseAmount(quoteAmount: BigNumber, price: BigNumber): BigNumber {
  // baseAmount = quoteAmount * PRECISION / price
  return quoteAmount.mul(PRECISION).div(price);
}

// Slippage calculations
export function applySlippage(amount: BigNumber, slippageBps: number): BigNumber {
  // slippageBps = basis points (1% = 100 bps)
  const slippageMultiplier = BigNumber.from(10000 - slippageBps);
  return amount.mul(slippageMultiplier).div(10000);
}

// Fee calculations with proper precision
export function calculateFee(amount: BigNumber, feeBps: number): BigNumber {
  // feeBps = basis points (0.1% = 10 bps)
  return amount.mul(feeBps).div(10000);
}

// Validate precision for amounts
export function validatePrecision(amount: string): boolean {
  try {
    const bn = BigNumber.from(amount);
    return bn.gte(0) && bn.lte(MAX_UINT256);
  } catch {
    return false;
  }
}

// Round to nearest tick for AMM integration
export function roundToTick(price: BigNumber, tickSpacing: number): BigNumber {
  // This is a simplified version - real implementation would use TickMath
  const tick = price.div(tickSpacing).mul(tickSpacing);
  return tick;
}