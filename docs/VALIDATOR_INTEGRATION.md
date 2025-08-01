# DEX Avalanche Validator Integration

This document describes the integration between the OmniBazaar DEX module and the Avalanche validator services.

## Overview

The DEX module integrates with the Avalanche validator through a GraphQL API, providing:

- **Order Book Management**: Decentralized order matching with 1-2s finality
- **Trade Execution**: Spot trading with maker/taker fee structure
- **Market Data**: Real-time price feeds and trading statistics
- **WebSocket Updates**: Live order book and trade notifications

## Architecture

```
DEX Module
    ├── ValidatorDEXService (GraphQL Client)
    │   └── AvalancheValidatorClient
    │       └── Apollo GraphQL + WebSocket
    │
    ├── ValidatorAPI (REST Endpoints)
    │   └── Express Routes
    │
    └── ValidatorWebSocket (Real-time Updates)
        └── Socket.IO Server
            
Avalanche Validator Node
    ├── Snowman Consensus (1-2s finality)
    ├── Order Book Engine
    ├── Off-chain Computation
    └── GraphQL API Server
```

## Integration Components

### 1. ValidatorDEXService

Main service class that handles all DEX operations through the Avalanche validator.

```typescript
import { validatorDEX } from './services/ValidatorDEXService';

// Initialize service
await validatorDEX.initialize();

// Place an order
const order = await validatorDEX.placeOrder({
  type: 'BUY',
  tokenPair: 'XOM/USDC',
  price: '100.50',
  amount: '10',
  maker: '0x1234...'
});

// Get order book
const orderBook = await validatorDEX.getOrderBook('XOM/USDC', 20);

// Subscribe to updates
const unsubscribe = validatorDEX.subscribeToOrderBook('XOM/USDC', (book) => {
  console.log('Order book updated:', book);
});
```

### 2. REST API Endpoints

Express routes for DEX operations:

```
GET  /api/v1/dex/pairs              - Get all trading pairs
GET  /api/v1/dex/orderbook/:pair    - Get order book for a pair
POST /api/v1/dex/orders             - Place a new order
GET  /api/v1/dex/orders/:orderId    - Get order by ID
GET  /api/v1/dex/orders             - Get user's orders
DELETE /api/v1/dex/orders/:orderId  - Cancel an order
GET  /api/v1/dex/trades/:pair       - Get recent trades
GET  /api/v1/dex/market/:pair       - Get market data
POST /api/v1/dex/fees/calculate     - Calculate trading fees
```

### 3. WebSocket Events

Real-time updates via Socket.IO:

```javascript
// Client-side example
const socket = io('ws://localhost:3003');

// Subscribe to order book updates
socket.emit('subscribe:orderbook', ['XOM/USDC', 'XOM/ETH']);

// Receive updates
socket.on('orderbook:update', (data) => {
  console.log('Order book update:', data);
});

// Subscribe to trades
socket.emit('subscribe:trades', ['XOM/USDC']);

socket.on('trade:executed', (data) => {
  console.log('New trade:', data);
});

// Place order via WebSocket
socket.emit('place:order', orderData, (response) => {
  if (response.success) {
    console.log('Order placed:', response.order);
  }
});
```

## Configuration

### Environment Variables

```bash
# Validator Connection
VALIDATOR_ENDPOINT=http://localhost:4000
VALIDATOR_WS_ENDPOINT=ws://localhost:4000/graphql
VALIDATOR_API_KEY=your-api-key

# Network Configuration
NETWORK_ID=omnibazaar-mainnet

# Trading Configuration
TRADING_PAIRS=XOM/USDC,XOM/ETH,XOM/BTC
MAKER_FEE=0.001  # 0.1%
TAKER_FEE=0.002  # 0.2%

# Server Configuration
PORT=3003
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW=900000  # 15 minutes
RATE_LIMIT_MAX=1000
```

### Trading Pairs

Configure supported trading pairs in the environment:

```bash
TRADING_PAIRS=XOM/USDC,XOM/ETH,XOM/BTC,ETH/USDC,BTC/USDC
```

## Fee Structure

The DEX implements a maker-taker fee model:

- **Maker Fee**: 0.1% (orders that add liquidity)
- **Taker Fee**: 0.2% (orders that remove liquidity)

Fee calculation example:

```typescript
const fees = validatorDEX.calculateFees('1000', true); // Maker
// Result: { feeAmount: '1', feeRate: 0.001, netAmount: '999' }

const fees = validatorDEX.calculateFees('1000', false); // Taker
// Result: { feeAmount: '2', feeRate: 0.002, netAmount: '998' }
```

## Order Types

### Market Orders
- Execute immediately at best available price
- Always taker orders (0.2% fee)

### Limit Orders
- Execute at specified price or better
- Can be maker (0.1%) or taker (0.2%) depending on order book

## Order Lifecycle

1. **Order Placement**
   - Validate order parameters
   - Submit to validator via GraphQL
   - Receive order ID and status

2. **Order Matching**
   - Avalanche validator matches orders
   - 1-2 second finality with Snowman consensus
   - Off-chain computation for complex matching

3. **Trade Execution**
   - Matched orders create trades
   - Fees deducted automatically
   - WebSocket notifications sent

4. **Settlement**
   - On-chain settlement after matching
   - Atomic swaps ensure security
   - No counterparty risk

## Error Handling

The integration includes comprehensive error handling:

```typescript
try {
  const order = await validatorDEX.placeOrder(orderData);
} catch (error) {
  if (error.message.includes('Invalid trading pair')) {
    // Handle invalid pair
  } else if (error.message.includes('Insufficient balance')) {
    // Handle balance issues
  } else {
    // Handle other errors
  }
}
```

## Testing

Run integration tests:

```bash
cd DEX
npm test -- tests/validator-integration.test.ts
```

## Monitoring

### Health Check

```bash
curl http://localhost:3003/health
```

Response:
```json
{
  "status": "healthy",
  "validator": {
    "connected": true,
    "endpoint": "http://localhost:4000"
  },
  "tradingPairs": ["XOM/USDC", "XOM/ETH"],
  "connections": {
    "webSocket": 42,
    "activeSubscriptions": 15
  }
}
```

### Metrics

- Order placement latency: <100ms
- Order book update frequency: Real-time
- WebSocket connection stability: 99.9%
- Trade finality: 1-2 seconds

## Security Considerations

1. **API Authentication**
   - Use API keys for validator access
   - JWT tokens for user authentication
   - Rate limiting to prevent abuse

2. **Order Validation**
   - Validate all order parameters
   - Check user balances before placement
   - Prevent front-running with time locks

3. **WebSocket Security**
   - Connection authentication
   - Message validation
   - Automatic reconnection with backoff

## Troubleshooting

### Common Issues

1. **"Order book service is not available"**
   - Check validator health status
   - Verify network connectivity
   - Ensure validator is synced

2. **WebSocket disconnections**
   - Check network stability
   - Verify WebSocket endpoint
   - Review client-side error logs

3. **Order placement failures**
   - Validate order parameters
   - Check user balance
   - Verify trading pair is active

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

## Future Enhancements

1. **Advanced Order Types**
   - Stop-loss orders
   - Take-profit orders
   - Iceberg orders

2. **Perpetual Trading**
   - Leverage up to 100x
   - Funding rates
   - Liquidation engine

3. **Analytics**
   - Trading volume charts
   - Price history
   - User statistics

## Support

For DEX integration issues:
- Check validator status: `/api/v1/validator/info`
- Review logs in `logs/` directory
- Contact support with order IDs and timestamps