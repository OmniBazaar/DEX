/**
 * Redux Store Configuration
 *
 * Central store for DEX application state management
 */

import { configureStore } from '@reduxjs/toolkit';
import dexReducer from './slices/dexSlice';

/**
 * Configure and create the Redux store
 */
export const store = configureStore({
  reducer: {
    dex: dexReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore certain action types or paths that might contain non-serializable data
        ignoredActions: ['dex/updateOrderBook', 'dex/updateTrades'],
        ignoredPaths: ['dex.websocket'],
      },
    }),
});

/**
 * Root state type inferred from the store
 */
export type RootState = ReturnType<typeof store.getState>;

/**
 * App dispatch type inferred from the store
 */
export type AppDispatch = typeof store.dispatch;