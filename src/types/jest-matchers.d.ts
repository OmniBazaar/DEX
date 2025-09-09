/**
 * Custom Jest matcher type declarations
 */

declare namespace jest {
  /**
   * Custom Jest matchers for DEX testing
   * @template R - Return type for matcher
   */
  interface Matchers<R> {
    /**
     * Validates that a value is a properly formatted order ID
     * @returns Jest matcher result
     */
    toBeValidOrderId(): R;
  }
}