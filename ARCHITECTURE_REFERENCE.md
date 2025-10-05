# Architecture Reference

**Last Updated:** 2025-10-05 11:01 UTC
**Purpose:** DEX architecture overview

---

## Ultra-Lean Architecture

### Core Principle

**Off-chain complexity, on-chain settlement only**

```text
┌─────────────────────────────────┐
│     Validators (Off-Chain)      │
│  - Order matching               │
│  - Price calculations           │
│  - Risk management              │
│  - Liquidity pools              │
│  - Complex logic                │
└───────────┬─────────────────────┘
            │ Settlement only
┌───────────▼─────────────────────┐
│   Blockchain (Minimal)          │
│  - Settlement execution         │
│  - State hashes                 │
│  - Fee distribution             │
└─────────────────────────────────┘
```

### Benefits

- **No gas fees** for order placement/cancellation
- **High performance** (10K+ orders/sec)
- **Scalability** via validator network
- **Flexibility** to upgrade off-chain logic

---

## Hybrid Storage Architecture

### Storage Layers

**1. Validator Memory (Real-Time)**
- Active order book
- Pending orders
- Recent trades
- <10ms access time

**2. YugabyteDB (Warm Storage)**
- Order history
- User positions
- Trade archive
- <50ms query time

**3. IPFS (Cold Storage)**
- Historical data
- Compliance records
- Audit trails
- Long-term archive

### Data Flow

```text
Order Placed → Validator Memory
                     ↓
         (After execution/timeout)
                     ↓
              YugabyteDB
                     ↓
           (After 30 days)
                     ↓
                  IPFS
```

---

## Settlement Architecture

### DEXSettlement in OmniCore

**Location:** `Coin/contracts/OmniCore.sol`

**Functions:**
```solidity
// Minimal on-chain settlement
function settleTradesBatch(
  Trade[] calldata trades,
  bytes calldata validatorSignature
) external onlyRole(VALIDATOR_ROLE)

// Fee distribution
function distributeTradingFees(
  uint256 totalFees
) internal returns (
  uint256 toODDAO,      // 70%
  uint256 toCompany,    // 20%
  uint256 toValidators  // 10%
)
```

**Storage:**
- State hashes only (not full state)
- Merkle roots for verification
- Minimal data on-chain

---

## Decentralized Architecture

### Validator Network

**Gateway Validators (AVAX stakers):**
- Aggregate off-chain computation
- Submit settlements to blockchain
- Serve API to users

**Computation Nodes (XOM stakers):**
- Order matching
- Price calculations
- Risk management
- Liquidity pool operations

### Consensus

**For Order Matching:**
- Multiple validators match independently
- Consensus on execution results
- Snowman consensus for finality

**For Settlement:**
- Batch settlements every N seconds/blocks
- Validator signatures required
- On-chain verification

---

## Hybrid Order Book + AMM Model

### Trading Venues

**1. Order Book**
- Traditional limit/market orders
- High-frequency trading
- Advanced order types
- Professional traders

**2. AMM Pools**
- Automated market making
- Concentrated liquidity
- Passive liquidity provision
- Retail users

**3. Hybrid Router**
- Routes to best venue
- Splits across both
- Minimizes slippage
- Best execution guarantee

### Integration

```text
User Order → HybridRouter
                 ↓
        ┌────────┴────────┐
        ▼                 ▼
   Order Book          AMM Pool
        ↓                 ↓
        └────────┬────────┘
                 ▼
           Settlement
```

---

## System Architecture

```text
┌─────────────────────────────────────────┐
│        OmniBazaar DEX Platform          │
├─────────────────────────────────────────┤
│  User Interfaces                        │
│  ├── WebApp Trading Page                │
│  ├── Wallet DEX Integration             │
│  └── API for Trading Bots               │
├─────────────────────────────────────────┤
│  Validator Network                      │
│  ├── Order Matching Engine              │
│  ├── AMM Liquidity Pools                │
│  ├── Risk Management                    │
│  ├── Price Oracles                      │
│  └── Settlement Coordination            │
├─────────────────────────────────────────┤
│  Storage Layer                          │
│  ├── Memory (active orders)             │
│  ├── YugabyteDB (history)               │
│  └── IPFS (archive)                     │
├─────────────────────────────────────────┤
│  Blockchain (Minimal)                   │
│  └── OmniCore.sol (settlement only)     │
└─────────────────────────────────────────┘
```

---

## Performance Architecture

**Targets:**
- Order matching: <10ms
- API response: <50ms
- Settlement finality: <2s
- Throughput: 10,000+ orders/sec

**Optimizations:**
- In-memory order book
- Batch settlements
- Off-chain calculations
- Parallel validator processing

---

## Security Architecture

**Layers:**
1. **Input Validation** - All user inputs sanitized
2. **MEV Protection** - Transaction ordering in validators
3. **Circuit Breakers** - Auto-pause on anomalies
4. **Consensus** - Multi-validator agreement required
5. **On-Chain Verification** - Settlement signatures verified

---

**See Also:**
- INTEGRATION_PLANS_REFERENCE.md - Feature integration
- DEVELOPMENT_REFERENCE.md - Development roadmap
- ULTRA_LEAN_ARCHITECTURE.md - Detailed ultra-lean design
