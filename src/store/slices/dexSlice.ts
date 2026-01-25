/**
 * DEX Redux Slice
 *
 * State management for DEX functionality
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { dexClient, TradingPair, Balance, Order, OrderBook } from '../../services/dex/api/dexClient';

/**
 * Market data for a trading pair
 */
export interface MarketData {
  /** Current price */
  price: string;
  /** 24-hour price change */
  change24h: string;
  /** 24-hour percentage change */
  changePercent24h: string;
  /** 24-hour trading volume */
  volume24h: string;
  /** 24-hour high price */
  high24h: string;
  /** 24-hour low price */
  low24h: string;
  /** Timestamp of the data */
  timestamp: string;
}

/**
 * Loading state flags for various operations
 */
interface LoadingStates {
  /** Loading trading pairs */
  fetchTradingPairs: boolean;
  /** Loading balances */
  fetchBalances: boolean;
  /** Loading orders */
  fetchOrders: boolean;
  /** Loading order book */
  fetchOrderBook: boolean;
  /** Placing order */
  placeOrder: boolean;
  /** Cancelling order */
  cancelOrder: boolean;
}

/**
 * Error states for various operations
 */
interface ErrorStates {
  /** Error fetching trading pairs */
  fetchTradingPairs?: string;
  /** Error fetching balances */
  fetchBalances?: string;
  /** Error fetching orders */
  fetchOrders?: string;
  /** Error fetching order book */
  fetchOrderBook?: string;
  /** Error placing order */
  placeOrder?: string;
  /** Error cancelling order */
  cancelOrder?: string;
}

/**
 * DEX state interface
 */
export interface DexState {
  /** Available trading pairs */
  tradingPairs: TradingPair[];
  /** Currently selected trading pair */
  selectedPair: string | null;
  /** User balances by currency */
  balances: Record<string, Balance>;
  /** User orders */
  orders: Order[];
  /** Order books by pair */
  orderBooks: Record<string, OrderBook>;
  /** Market data by pair */
  marketData: Record<string, MarketData>;
  /** Loading states */
  isLoading: LoadingStates;
  /** Error states */
  errors: ErrorStates;
  /** WebSocket connection state */
  websocketConnected: boolean;
}

/**
 * Initial state
 */
const initialState: DexState = {
  tradingPairs: [],
  selectedPair: null,
  balances: {},
  orders: [],
  orderBooks: {},
  marketData: {},
  isLoading: {
    fetchTradingPairs: false,
    fetchBalances: false,
    fetchOrders: false,
    fetchOrderBook: false,
    placeOrder: false,
    cancelOrder: false,
  },
  errors: {},
  websocketConnected: false,
};

/**
 * Async thunk to fetch trading pairs
 */
export const fetchTradingPairs = createAsyncThunk(
  'dex/fetchTradingPairs',
  async () => {
    return await dexClient.getTradingPairs();
  }
);

/**
 * Async thunk to fetch user balances
 */
export const fetchBalances = createAsyncThunk(
  'dex/fetchBalances',
  async () => {
    return await dexClient.getBalances();
  }
);

/**
 * Async thunk to fetch user orders
 */
export const fetchOrders = createAsyncThunk(
  'dex/fetchOrders',
  async (pair?: string) => {
    return await dexClient.getOpenOrders(pair);
  }
);

/**
 * Async thunk to fetch order book
 */
export const fetchOrderBook = createAsyncThunk(
  'dex/fetchOrderBook',
  async ({ pair, depth }: { pair: string; depth?: number }) => {
    const orderBook = await dexClient.getOrderBook(pair, depth);
    return { pair, orderBook };
  }
);

/**
 * Async thunk to place order
 */
export const placeOrder = createAsyncThunk(
  'dex/placeOrder',
  async (orderRequest: Parameters<typeof dexClient.placeOrder>[0]) => {
    return await dexClient.placeOrder(orderRequest);
  }
);

/**
 * Async thunk to cancel order
 */
export const cancelOrder = createAsyncThunk(
  'dex/cancelOrder',
  async (orderId: string) => {
    await dexClient.cancelOrder(orderId);
    return orderId;
  }
);

/**
 * DEX slice
 */
const dexSlice = createSlice({
  name: 'dex',
  initialState,
  reducers: {
    // Select trading pair
    selectTradingPair: (state, action: PayloadAction<string>) => {
      state.selectedPair = action.payload;
    },

    // Update order book (from WebSocket)
    updateOrderBook: (state, action: PayloadAction<{ pair: string; orderBook: OrderBook }>) => {
      state.orderBooks[action.payload.pair] = action.payload.orderBook;
    },

    // Update market data (from WebSocket)
    updateMarketData: (state, action: PayloadAction<Record<string, MarketData>>) => {
      Object.assign(state.marketData, action.payload);
    },

    // Update balance (from WebSocket)
    updateBalance: (state, action: PayloadAction<Balance>) => {
      state.balances[action.payload.currency] = action.payload;
    },

    // Update order (from WebSocket)
    updateOrder: (state, action: PayloadAction<Order>) => {
      const index = state.orders.findIndex(o => o.id === action.payload.id);
      if (index >= 0) {
        state.orders[index] = action.payload;
      } else {
        state.orders.push(action.payload);
      }
    },

    // Remove order
    removeOrder: (state, action: PayloadAction<string>) => {
      state.orders = state.orders.filter(o => o.id !== action.payload);
    },

    // Set WebSocket connection status
    setWebSocketConnected: (state, action: PayloadAction<boolean>) => {
      state.websocketConnected = action.payload;
    },

    // Clear errors
    clearError: (state, action: PayloadAction<keyof DexState['errors']>) => {
      delete state.errors[action.payload];
    },

    // Reset state
    reset: () => initialState,
  },
  extraReducers: (builder) => {
    // Fetch trading pairs
    builder
      .addCase(fetchTradingPairs.pending, (state) => {
        state.isLoading.fetchTradingPairs = true;
        delete state.errors.fetchTradingPairs;
      })
      .addCase(fetchTradingPairs.fulfilled, (state, action) => {
        state.isLoading.fetchTradingPairs = false;
        state.tradingPairs = action.payload;
      })
      .addCase(fetchTradingPairs.rejected, (state, action) => {
        state.isLoading.fetchTradingPairs = false;
        state.errors.fetchTradingPairs = action.error.message !== undefined && action.error.message !== '' ? action.error.message : 'Failed to fetch trading pairs';
      });

    // Fetch balances
    builder
      .addCase(fetchBalances.pending, (state) => {
        state.isLoading.fetchBalances = true;
        delete state.errors.fetchBalances;
      })
      .addCase(fetchBalances.fulfilled, (state, action) => {
        state.isLoading.fetchBalances = false;
        state.balances = action.payload.reduce((acc, balance) => {
          acc[balance.currency] = balance;
          return acc;
        }, {} as Record<string, Balance>);
      })
      .addCase(fetchBalances.rejected, (state, action) => {
        state.isLoading.fetchBalances = false;
        state.errors.fetchBalances = action.error.message !== undefined && action.error.message !== '' ? action.error.message : 'Failed to fetch balances';
      });

    // Fetch orders
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.isLoading.fetchOrders = true;
        delete state.errors.fetchOrders;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.isLoading.fetchOrders = false;
        state.orders = action.payload;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.isLoading.fetchOrders = false;
        state.errors.fetchOrders = action.error.message !== undefined && action.error.message !== '' ? action.error.message : 'Failed to fetch orders';
      });

    // Fetch order book
    builder
      .addCase(fetchOrderBook.pending, (state) => {
        state.isLoading.fetchOrderBook = true;
        delete state.errors.fetchOrderBook;
      })
      .addCase(fetchOrderBook.fulfilled, (state, action) => {
        state.isLoading.fetchOrderBook = false;
        state.orderBooks[action.payload.pair] = action.payload.orderBook;
      })
      .addCase(fetchOrderBook.rejected, (state, action) => {
        state.isLoading.fetchOrderBook = false;
        state.errors.fetchOrderBook = action.error.message !== undefined && action.error.message !== '' ? action.error.message : 'Failed to fetch order book';
      });

    // Place order
    builder
      .addCase(placeOrder.pending, (state) => {
        state.isLoading.placeOrder = true;
        delete state.errors.placeOrder;
      })
      .addCase(placeOrder.fulfilled, (state, action) => {
        state.isLoading.placeOrder = false;
        state.orders.push(action.payload);
      })
      .addCase(placeOrder.rejected, (state, action) => {
        state.isLoading.placeOrder = false;
        state.errors.placeOrder = action.error.message !== undefined && action.error.message !== '' ? action.error.message : 'Failed to place order';
      });

    // Cancel order
    builder
      .addCase(cancelOrder.pending, (state) => {
        state.isLoading.cancelOrder = true;
        delete state.errors.cancelOrder;
      })
      .addCase(cancelOrder.fulfilled, (state, action) => {
        state.isLoading.cancelOrder = false;
        state.orders = state.orders.filter(o => o.id !== action.payload);
      })
      .addCase(cancelOrder.rejected, (state, action) => {
        state.isLoading.cancelOrder = false;
        state.errors.cancelOrder = action.error.message !== undefined && action.error.message !== '' ? action.error.message : 'Failed to cancel order';
      });
  },
});

// Export actions
export const {
  selectTradingPair,
  updateOrderBook,
  updateMarketData,
  updateBalance,
  updateOrder,
  removeOrder,
  setWebSocketConnected,
  clearError,
  reset,
} = dexSlice.actions;

// Export reducer
export default dexSlice.reducer;