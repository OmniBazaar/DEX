# DEX Module - AI Context Document

**Purpose:** Comprehensive context for AI assistants working on the DEX module
**Last Updated:** 2025-10-05 11:04 UTC
**Location:** `/home/rickc/OmniBazaar/DEX/`

---

## MODULE FUNCTION

The DEX module provides **decentralized exchange infrastructure** for OmniBazaar:
- **Trading engine** - Order matching, execution, settlement
- **Multiple order types** - Market, Limit, Stop, OCO, Iceberg, TWAP, VWAP
- **Perpetual futures** - Leverage up to 100x with funding rates
- **Hybrid model** - Order book + AMM (Uniswap V3 style)
- **Ultra-lean design** - Off-chain matching, on-chain settlement only
- **Zero gas for trading** - Batch settlements reduce costs

**Key Innovation:** Off-chain complexity, on-chain settlement only - enables 10,000+ orders/sec with minimal gas.

---

## CRITICAL ARCHITECTURE

### Ultra-Lean Design

**Philosophy:** Keep blockchain minimal, validators handle complexity

```text
User → Validator (order matching) → Settlement batch → Blockchain
       [Off-chain, fast, free]      [On-chain, minimal]
```

**Benefits:**
- No gas fees for orders/cancellations
- 10,000+ orders/second
- Advanced features without blockchain bloat
- Easy to upgrade off-chain logic

### Location of DEX Logic

**Most DEX code is in Validator module, not DEX module!**

**DEX Module Contains:**
- Type definitions
- Client libraries
- API schemas
- Smart contracts (minimal)
- Reference implementations (dydx-reference/)

**Validator Module Contains:**
- `Validator/src/services/dex/DecentralizedOrderBook.ts` - Main trading engine
- `Validator/src/services/dex/amm/` - AMM integration
- `Validator/src/services/dex/crosschain/` - Bridge support
- `Validator/src/services/dex/mev/` - MEV protection
- `Validator/src/services/dex/oracles/` - Price oracles

### Integration Pattern

```text
WebApp → Validator DEX Services → DEX Smart Contracts
         [Main implementation]    [Settlement only]
```

---

## DIRECTORY STRUCTURE

```text
src/
├── core/                       # Core trading logic
│   ├── dex/
│   │   ├── DecentralizedOrderBook.ts  # Order matching
│   │   ├── OrderBook.ts               # Order book data structure
│   │   └── RiskManager.ts             # Risk management
│   └── perpetuals/
│       ├── FundingRateEngine.ts       # Funding calculations
│       └── LiquidationEngine.ts       # Liquidation logic
│
├── api/                        # API endpoints
│   ├── routes.ts               # REST routes
│   └── websocket-server.ts     # WebSocket server
│
├── services/                   # Service layer
│   ├── dex/                    # DEX-specific services
│   └── validator-integration/  # Validator communication
│
├── client/                     # Client libraries
│   └── DEXClient.ts            # API client
│
├── types/                      # TypeScript types
│   ├── orders.ts               # Order types
│   ├── trades.ts               # Trade types
│   └── markets.ts              # Market types
│
├── constants/                  # Constants
│   └── precision.ts            # 18-digit precision helpers
│
└── websocket/                  # Real-time updates
    └── handlers.ts             # WebSocket event handlers
```

**Contracts:** `contracts/DEXSettlement.sol` (in Coin module)
**Reference:** `dydx-reference/` - dYdX v4 reference code
**Reference:** `/home/rickc/OmniBazaar/DEX/uniswap-reference` - UniSwap refernce code
**Tests:** `tests/` (Jest)

---

## KEY FEATURES

### Order Types (All Implemented)

**Basic:**
- Market - Immediate execution
- Limit - Price limit
- Stop - Trigger-based
- Stop-Limit - Combined

**Advanced:**
- OCO (One-Cancels-Other)
- Iceberg (hidden quantity)
- TWAP (time-weighted execution)
- VWAP (volume-weighted execution)

**Perpetuals:**
- Long/Short positions
- 1x to 100x leverage
- Funding rates (8h intervals)
- Auto-liquidation

### Performance Specs

| Metric | Target | Status |
|--------|--------|--------|
| Order Matching | 10K+/sec | ✅ Achieved |
| API Latency | <50ms | ✅ Achieved |
| Settlement Gas | <$0.01 | ✅ Batch |
| Finality | <2s | ✅ 1-2s |

### Precision

**All calculations:** 18-digit precision (like ETH)
**File:** `src/constants/precision.ts`
**Helpers:** `toWei()`, `fromWei()`, `toDisplayAmount()`

---

## DEVELOPMENT

### Quick Start

```bash
cd /home/rickc/OmniBazaar/DEX

# Install
npm install

# Development server
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test
```

### Working with Validator

**DEX implementation is in Validator module!**

```bash
# Most DEX development happens here:
cd /home/rickc/OmniBazaar/Validator

# DEX services location:
# src/services/dex/DecentralizedOrderBook.ts
# src/services/dex/amm/
# src/services/dex/crosschain/
```

### Testing

```bash
# DEX module tests
npm test

# Validator DEX tests
cd /home/rickc/OmniBazaar/Validator
npm test -- DecentralizedOrderBook
npm test -- AMM
```

---

## INTEGRATION WITH OTHER MODULES

### Validator Module (PRIMARY)

**Location:** `/home/rickc/OmniBazaar/Validator/`

**DEX Services in Validator:**
- `src/services/dex/DecentralizedOrderBook.ts` - Main engine
- `src/services/dex/amm/LiquidityPoolManager.ts` - AMM pools
- `src/services/dex/amm/SwapCalculator.ts` - Swap calculations
- `src/services/dex/amm/HybridRouter.ts` - Order book + AMM routing
- `src/services/dex/crosschain/CrossChainBridge.ts` - Multi-chain support
- `src/services/dex/mev/MEVProtection.ts` - Front-running protection
- `src/services/dex/oracles/OracleAggregator.ts` - Price feeds

**Integration:** DEX module provides types/contracts, Validator provides implementation

### WebApp Module

**Location:** `/home/rickc/OmniBazaar/WebApp/`

**DEX UI:**
- `src/pages/dex/TradingPage.tsx` - Trading interface
- `src/pages/dex/SwapPage.tsx` - Token swaps
- `src/services/dex/DEXService.ts` - API integration
- `src/services/dex/ValidatorDEXClient.ts` - Validator connection

**Communication:** WebSocket + REST to Validator DEX services

### Coin Module

**Location:** `/home/rickc/OmniBazaar/Coin/`

**Smart Contracts:**
- OmniCore.sol - Settlement functions
- DEXSettlement.sol - Trade settlement
- Fee distribution logic

**Interaction:** Validators submit settlement batches to contracts

---

## REFERENCE IMPLEMENTATIONS

### dYdX v4

**Location:** `/home/rickc/OmniBazaar/DEX/dydx-reference/`

**Use for:**
- Advanced order types
- Subaccount patterns
- Cross-chain bridge patterns
- Perpetual futures mechanics

**DO NOT REINVENT:** Extract and adapt from dydx-reference/

### Uniswap V3

**Features to integrate:**
- Concentrated liquidity (tick-based)
- Multiple fee tiers
- TWAP oracle
- NFT positions

**Math Libraries:** Port to TypeScript for off-chain calculations

---

## CRITICAL FILES

### Documentation
1. **CURRENT_STATUS.md** - Current technical state
2. **TODO.md** - Task list
3. **HANDOFF.md** - Handoff document
4. **DEX_CONTEXT.md** (this file) - AI context
5. **INTEGRATION_PLANS_REFERENCE.md** - dYdX/Uniswap/Multi-DEX plans
6. **DEVELOPMENT_REFERENCE.md** - Development roadmap
7. **ARCHITECTURE_REFERENCE.md** - System architecture
8. **INTEGRATION_SECURITY_REFERENCE.md** - Validator integration and security
9. **CONTRIBUTING.md** - Contribution guidelines

### Source Code (DEX Module)
1. **src/core/dex/DecentralizedOrderBook.ts** - Order book (may be stub, real in Validator)
2. **src/types/orders.ts** - Order type definitions
3. **src/constants/precision.ts** - 18-digit precision helpers
4. **src/api/routes.ts** - API route definitions
5. **contracts/DEXSettlement.sol** - Settlement contract

### Source Code (Validator Module - MAIN IMPLEMENTATION)
1. **Validator/src/services/dex/DecentralizedOrderBook.ts** - MAIN ENGINE
2. **Validator/src/services/dex/amm/*.ts** - AMM implementation
3. **Validator/src/services/DEXService.ts** - Orchestration

---

## CODING STANDARDS

**TypeScript Requirements:**
- ✅ Zero `any` types
- ✅ Complete JSDoc for all exports
- ✅ Strict null checks
- ✅ 18-digit precision for all amounts (use BigNumber)
- ✅ No `console.log` - use logger

**Before Writing Code:**
1. **Check dydx-reference/** - Working code available
2. **Search Validator module** - Main DEX implementation is there
3. Check if feature exists (95% complete)
4. Review precision requirements (18 digits)

**After Writing Code:**
1. ESLint: `npm run lint`
2. Type check: `npm run type-check --strict`
3. Tests: `npm test`
4. Build: `npm run build`

---

## COMMON TASKS

### Adding New Order Type

**Work in Validator module:**

```bash
cd /home/rickc/OmniBazaar/Validator

# 1. Add order type to DecentralizedOrderBook.ts
# Edit: src/services/dex/DecentralizedOrderBook.ts

# 2. Add type definition
# Edit: src/types/dex.ts

# 3. Add matching logic
# Implement in DecentralizedOrderBook

# 4. Create tests
touch tests/services/dex/NewOrderType.test.ts
```

### Adding AMM Feature

**Work in Validator module:**

```bash
cd /home/rickc/OmniBazaar/Validator

# 1. Implement in AMM services
# Edit: src/services/dex/amm/LiquidityPoolManager.ts

# 2. Update hybrid router
# Edit: src/services/dex/amm/HybridRouter.ts

# 3. Create tests
touch tests/services/dex/amm/NewFeature.test.ts
```

### Updating Settlement Contract

**Work in Coin module:**

```bash
cd /home/rickc/OmniBazaar/Coin

# Edit: contracts/OmniCore.sol or contracts/DEXSettlement.sol
# Run: npx hardhat compile
# Run: npx solhint contracts/DEXSettlement.sol
```

---

## PRECISION HANDLING

**CRITICAL:** All amounts use 18-digit precision

```typescript
import { toWei, fromWei, PRECISION } from '@/constants/precision';

// Convert user input to wei
const amountWei = toWei('100.5'); // BigNumber

// Calculations in wei
const result = amountWei.mul(price).div(PRECISION);

// Display to user
const display = fromWei(result); // "100.5"
```

**Never use:**
- `parseFloat()` for amounts
- Regular number arithmetic
- 6-digit precision (old OmniCoin)

**Always use:**
- `BigNumber` from ethers.js
- 18-digit precision
- Helper functions from precision.ts

---

## QUICK REFERENCE

**Project Root:** `/home/rickc/OmniBazaar/`
**This Module:** `/home/rickc/OmniBazaar/DEX/`
**Main Implementation:** `/home/rickc/OmniBazaar/Validator/src/services/dex/`
**Contracts:** `/home/rickc/OmniBazaar/Coin/contracts/`
**UI:** `/home/rickc/OmniBazaar/WebApp/src/pages/dex/`
**Reference Code:** `/home/rickc/OmniBazaar/DEX/dydx-reference/`

**Dev Commands:**
- Build: `npm run build`
- Test: `npm test`
- Dev: `npm run dev`
- Lint: `npm run lint`

**Key Locations:**
- Order matching: Validator/src/services/dex/DecentralizedOrderBook.ts
- AMM pools: Validator/src/services/dex/amm/
- Settlement: Coin/contracts/OmniCore.sol
- UI: WebApp/src/pages/dex/

---

**Last Updated:** 2025-10-05 11:04 UTC
**For Latest Status:** Read HANDOFF.md, CURRENT_STATUS.md, TODO.md
**For Architecture:** Read ARCHITECTURE_REFERENCE.md
**For Integration:** Read INTEGRATION_PLANS_REFERENCE.md
**For Development:** Read DEVELOPMENT_REFERENCE.md
