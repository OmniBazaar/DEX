/**
 * Custom Jest matcher type declarations
 */

declare namespace jest {
  interface Matchers<R> {
    toBeValidOrderId(): R;
  }
}