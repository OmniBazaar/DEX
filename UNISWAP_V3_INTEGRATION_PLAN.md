# Uniswap V3 AMM Integration Plan

**Created:** 2025-08-03  
**Status:** 🚧 Planning Phase  
**Goal:** Integrate concentrated liquidity AMM functionality while maintaining ultra-lean architecture

## Overview

Integrate Uniswap V3's concentrated liquidity features into OmniBazaar DEX to create a hybrid order book + AMM system. This will provide deep liquidity, capital efficiency, and automated market making alongside our existing order book.

## Key Principles

1. **Ultra-Lean Architecture**: Keep complex calculations off-chain in validators
2. **Hybrid Model**: Seamlessly integrate AMM with existing order book
3. **Capital Efficiency**: Enable concentrated liquidity positions
4. **Gas Optimization**: Minimize on-chain operations

## Architecture Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Validator Node                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Liquidity Pool  │  │  Price Oracle   │  │   Routing   │ │
│  │    Manager      │  │   (TWAP)        │  │   Engine    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  Range Order    │  │ Position NFT    │  │  Fee Tier   │ │
│  │    Handler      │  │   Manager       │  │  Calculator │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    On-Chain (Minimal)                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              OmniCore.sol (Extended)                  │   │
│  │  - Pool state hashes                                 │   │
│  │  - Liquidity position tracking                       │   │
│  │  - Swap settlement                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core AMM Infrastructure (Week 1)

#### 1.1 Liquidity Pool Manager
- [ ] Create `LiquidityPoolManager.ts` in Validator
- [ ] Implement pool creation and initialization
- [ ] Support multiple fee tiers (0.05%, 0.3%, 1%)
- [ ] Track pool states off-chain

#### 1.2 Concentrated Liquidity Engine
- [ ] Port `TickMath` and `SqrtPriceMath` libraries
- [ ] Implement tick-based liquidity tracking
- [ ] Create position management system
- [ ] Calculate liquidity amounts for ranges

#### 1.3 Price Oracle Integration
- [ ] Implement TWAP (Time-Weighted Average Price) oracle
- [ ] Create observation storage system
- [ ] Integrate with existing price feeds
- [ ] Provide manipulation-resistant prices

### Phase 2: Trading Integration (Week 2)

#### 2.1 Swap Execution Engine
- [ ] Create `SwapCalculator.ts` for off-chain calculations
- [ ] Implement single-hop swap logic
- [ ] Add multi-hop routing support
- [ ] Calculate slippage and price impact

#### 2.2 Hybrid Routing Engine
- [ ] Create `HybridRouter.ts` combining orderbook + AMM
- [ ] Implement smart order routing
- [ ] Optimize for best execution price
- [ ] Handle partial fills across venues

#### 2.3 Range Orders
- [ ] Support limit orders via concentrated liquidity
- [ ] Implement automatic range adjustment
- [ ] Create take-profit positions
- [ ] Enable DCA (Dollar Cost Averaging) strategies

### Phase 3: Position Management (Week 3)

#### 3.1 NFT Position Tracker
- [ ] Create position NFT management off-chain
- [ ] Track liquidity provider positions
- [ ] Calculate fees earned per position
- [ ] Support position transfers

#### 3.2 Fee Collection System
- [ ] Implement fee accumulation tracking
- [ ] Create fee collection mechanism
- [ ] Distribute fees to LPs off-chain
- [ ] Integrate with OmniBazaar fee structure

#### 3.3 Liquidity Mining Integration
- [ ] Track LP participation
- [ ] Calculate rewards distribution
- [ ] Support incentivized pools
- [ ] Enable farming strategies

### Phase 4: Advanced Features (Week 4)

#### 4.1 JIT (Just-In-Time) Liquidity
- [ ] Detect large trades
- [ ] Enable flash liquidity provision
- [ ] Implement MEV protection
- [ ] Optimize capital efficiency

#### 4.2 Active Liquidity Management
- [ ] Create automated rebalancing strategies
- [ ] Implement impermanent loss protection
- [ ] Support dynamic fee adjustment
- [ ] Enable liquidity migration

#### 4.3 Cross-Chain Liquidity
- [ ] Bridge liquidity across chains
- [ ] Unified liquidity pools
- [ ] Cross-chain arbitrage protection
- [ ] Seamless multi-chain swaps

## Technical Components

### 1. Core Libraries to Port

From `uniswap-v3-core/contracts/libraries/`:
- `TickMath.sol` → `TickMath.ts`
- `SqrtPriceMath.sol` → `SqrtPriceMath.ts`
- `SwapMath.sol` → `SwapMath.ts`
- `LiquidityMath.sol` → `LiquidityMath.ts`
- `Oracle.sol` → `Oracle.ts`

### 2. New Validator Services

```typescript
validator/src/services/dex/amm/
├── LiquidityPoolManager.ts
├── ConcentratedLiquidityEngine.ts
├── SwapCalculator.ts
├── HybridRouter.ts
├── RangeOrderHandler.ts
├── TWAPOracle.ts
├── PositionManager.ts
├── FeeCalculator.ts
└── storage/
    ├── PoolStorage.ts
    └── PositionStorage.ts
```

### 3. On-Chain Extensions

Minimal additions to `OmniCore.sol`:
```solidity
// Pool state tracking
mapping(bytes32 => bytes32) public poolStateHashes;

// Liquidity position tracking
mapping(uint256 => bytes32) public positionHashes;

// AMM settlement functions
function settleAMMSwap(...) external onlyRole(AVALANCHE_VALIDATOR_ROLE)
function updatePoolState(...) external onlyRole(AVALANCHE_VALIDATOR_ROLE)
```

## Integration Points

### 1. Order Book Integration
- Unified order matching across AMM and order book
- Arbitrage opportunities between venues
- Combined liquidity depth

### 2. Existing DEX Features
- Conditional orders can target AMM prices
- Batch operations include AMM swaps
- Subaccounts can provide liquidity

### 3. Fee Structure
- AMM fees follow OmniBazaar distribution:
  - 70% to ODDAO
  - 20% to Staking Pool
  - 10% to Validator
- LP fees separate from protocol fees

## Performance Targets

- **Swap Calculation**: <10ms off-chain
- **Price Updates**: Real-time via WebSocket
- **Position Updates**: <50ms processing time
- **Gas Optimization**: 80% reduction vs on-chain AMM

## Security Considerations

1. **Price Manipulation**: TWAP oracle prevents attacks
2. **Sandwich Protection**: Transaction ordering in validator
3. **Impermanent Loss**: Clear risk warnings and calculations
4. **Reentrancy**: All calculations off-chain

## Testing Strategy

1. **Unit Tests**: Each math library thoroughly tested
2. **Integration Tests**: AMM + Order book scenarios
3. **Fuzz Testing**: Random swap amounts and ranges
4. **Performance Tests**: Ensure targets are met

## Success Metrics

- [ ] Support 1000+ liquidity pools
- [ ] Handle 10,000+ swaps/second
- [ ] Achieve <$0.01 per swap cost
- [ ] Provide 50% better capital efficiency
- [ ] Enable seamless hybrid routing

## Next Steps

1. Review Uniswap V3 math libraries
2. Design off-chain pool state management
3. Create TypeScript implementations
4. Build integration layer
5. Test with mainnet fork