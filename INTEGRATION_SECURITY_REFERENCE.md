# Integration & Security Reference

**Last Updated:** 2025-10-05 11:02 UTC
**Purpose:** Validator integration and security requirements

---

## Validator Integration

### Architecture

**DEX in Validator Network:**
```text
WebApp/Wallet → API Gateway → Validator DEX Services → OmniCore Settlement
```

**Location:** DEX services implemented in `Validator/src/services/dex/`

### Key Services

**1. DecentralizedOrderBook**
- Order matching engine
- Risk management
- Liquidation engine
- Perpetual futures

**2. HybridDEXStorage**
- YugabyteDB for active data
- IPFS for archival
- Redis for caching

**3. AMM Integration**
- Liquidity pool management
- Swap calculations
- Price oracles

**4. Cross-Chain Bridges**
- Multi-chain deposits
- Withdrawal processing
- Bridge coordination

### API Endpoints

**REST:**
```text
POST /api/v1/dex/orders          # Place order
GET  /api/v1/dex/orders/:id      # Get order
DELETE /api/v1/dex/orders/:id    # Cancel order
GET  /api/v1/dex/orderbook       # Order book
GET  /api/v1/dex/trades          # Recent trades
```

**WebSocket:**
```text
subscribe:orderbook
subscribe:trades
subscribe:userOrders
subscribe:positions
subscribe:ticker
```

### Database Integration

**YugabyteDB Tables:**
- `dex_orders` - Order history
- `dex_trades` - Trade history
- `dex_positions` - User positions
- `dex_pools` - Liquidity pools
- `dex_settlements` - Settlement records

**Performance:**
- Orders: <50ms query
- Trades: Real-time inserts
- Positions: <20ms updates

---

## Security Requirements

### Input Validation

**All Inputs Must Be:**
- Sanitized (no injection attacks)
- Type-validated (BigNumber for amounts)
- Range-checked (min/max limits)
- Address-validated (checksum)

### Transaction Security

**Order Placement:**
- Signature verification required
- Nonce tracking (prevent replay)
- Balance verification before matching
- Rate limiting per user

**Settlement:**
- Multi-validator consensus required
- Cryptographic proofs
- On-chain signature verification
- Settlement batch validation

### MEV Protection

**Techniques:**
- Commit-reveal for large orders
- Transaction ordering rules
- Front-running detection
- Sandwich attack prevention

### Circuit Breakers

**Auto-Pause Triggers:**
- Price deviation >10% in 1 minute
- Unusual volume spikes
- Multiple liquidations
- Oracle failures

**Actions:**
- Pause new orders
- Allow cancellations only
- Notify validators
- Require manual restart

---

## Fee Compliance

### Fee Structure (70/20/10)

**Distribution:**
- 70% → ODDAO (staking pool)
- 20% → Company treasury
- 10% → Validators

**Fee Types:**
- Trading fees: 0.3% (configurable)
- Maker rebate: 0.1%
- Taker fee: 0.4%
- Liquidation fee: 5%

### Database Tracking

**Tables:**
- `fee_distributions` - Fee splits
- `validator_earnings` - Validator revenue
- `oddao_pool` - Staking pool balance

**Queries:**
```sql
-- Verify fee compliance
SELECT
  SUM(oddao_amount) / SUM(total_fees) as oddao_percentage,
  SUM(company_amount) / SUM(total_fees) as company_percentage,
  SUM(validator_amount) / SUM(total_fees) as validator_percentage
FROM fee_distributions
WHERE date >= NOW() - INTERVAL '30 days';

-- Should be: 0.70, 0.20, 0.10
```

---

## Authentication & Authorization

### API Authentication

**Methods:**
- JWT tokens for session-based
- Wallet signature for web3
- API keys for trading bots

**Permissions:**
- Read-only (public data)
- Trade (authenticated users)
- Admin (validator operators)

### Rate Limiting

**Limits:**
- Public endpoints: 100 req/min
- Authenticated: 1000 req/min
- WebSocket: 50 subscriptions
- Order placement: 10 orders/sec

---

## Audit & Compliance

### Logging

**All Operations Logged:**
- Order placements
- Cancellations
- Executions
- Settlements
- Fee distributions

**Log Retention:**
- 90 days in YugabyteDB
- 7 years in IPFS (compliance)

### Monitoring

**Key Metrics:**
- Order throughput
- Settlement latency
- Fee distribution accuracy
- Validator consensus
- Circuit breaker triggers

---

## Disaster Recovery

### Data Backup

- YugabyteDB: Continuous replication
- IPFS: Distributed across validators
- Order book: In-memory + periodic snapshots

### Recovery Procedures

1. **Validator Crash:** Other validators continue
2. **Database Failure:** Restore from replicas
3. **Settlement Failure:** Retry with exponential backoff
4. **Network Partition:** Maintain state, sync when reconnected

---

**See Also:**
- SECURITY_REQUIREMENTS.md - Detailed security specs
- docs/VALIDATOR_INTEGRATION.md - Integration details
- FEE_COMPLIANCE_AND_DATABASE_ANALYSIS.md - Fee analysis
