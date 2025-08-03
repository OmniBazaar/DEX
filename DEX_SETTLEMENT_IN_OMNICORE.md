# DEX Settlement Integration in OmniCore

**Date:** 2025-08-03  
**Decision:** Integrate DEX settlement functionality into existing OmniCore.sol contract

## Rationale

Following the ultra-lean blockchain architecture principle, we've integrated DEX settlement functionality directly into the existing `OmniCore.sol` contract rather than creating a new contract. This decision:

1. **Maintains Ultra-Lean Architecture**: No additional contract deployment
2. **Reuses Existing Infrastructure**: Leverages existing validator roles and access control
3. **Simplifies Integration**: One contract handles core functionality and DEX settlement
4. **Reduces Gas Costs**: Fewer contract calls and storage slots

## What Was Added to OmniCore.sol

### State Variables
```solidity
// DEX balances for settlement (user => token => amount)
mapping(address => mapping(address => uint256)) public dexBalances;

// Fee recipients for DEX operations
address public oddaoAddress;
address public stakingPoolAddress;
```

### Events
```solidity
event DEXSettlement(
    address indexed buyer,
    address indexed seller,
    address indexed token,
    uint256 amount,
    bytes32 orderId
);

event BatchSettlement(
    bytes32 indexed batchId,
    uint256 count
);
```

### Functions
1. **settleDEXTrade**: Single trade settlement
2. **batchSettleDEX**: Batch settlement for gas efficiency
3. **depositToDEX**: Deposit tokens for trading
4. **withdrawFromDEX**: Withdraw tokens
5. **distributeDEXFees**: Automatic fee distribution (70% ODDAO, 20% Staking, 10% Validator)
6. **getDEXBalance**: View function for balances

## Integration with Validator Architecture

All complex DEX logic remains in the Validator module:
- Order matching
- Conditional orders
- Batch processing
- Subaccount management
- Market data

Only final settlements are recorded on-chain through OmniCore.

## Benefits

1. **Minimal On-Chain Footprint**: Only ~130 lines added to OmniCore
2. **Leverages Existing Security**: Uses established validator roles
3. **Consistent Architecture**: Follows same pattern as staking/rewards
4. **Easy Upgrades**: Off-chain logic can evolve without contract changes

## Usage Example

```javascript
// Validator processes orders off-chain, then settles:
await omniCore.settleDEXTrade(
    buyerAddress,
    sellerAddress,
    tokenAddress,
    amount,
    orderId
);

// Or batch settle for efficiency:
await omniCore.batchSettleDEX(
    buyers,
    sellers,
    tokens,
    amounts,
    batchId
);
```

## Migration Notes

- Update validator code to call OmniCore instead of separate DEX contract
- Pass ODDAO and staking pool addresses to OmniCore constructor
- Ensure validators have AVALANCHE_VALIDATOR_ROLE for settlement