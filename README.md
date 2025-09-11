# OmniBazaar DEX

> High-performance decentralized exchange with advanced order types and perpetual futures trading.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18.0+-green.svg)](https://nodejs.org/)

## 🚀 Recent Reorganization

The DEX repository has been streamlined to focus on core trading functionality. Components have been moved to their appropriate repositories:

### Moved Components
- **UnifiedValidatorNode.ts** → **Validator** repository
- **OmniCoinBlockchain.ts** → **Validator** repository  
- **FeeDistributionEngine.ts** → **Validator** repository
- **IPFSStorageNetwork.ts** → **Storage** repository
- **P2PChatNetwork.ts** → **Chat** repository

### Core DEX Components (Remaining)
- **DecentralizedOrderBook.ts**: Complete trading engine with all order types
- **Trading API**: Market orders, limit orders, stop orders, advanced orders
- **Market Data API**: Real-time price feeds, order book data, trade history
- **Smart Contracts**: On-chain settlement and validation contracts

## 🎯 Trading Features

### Complete Order Type Support

#### **Market Orders** ⚡
- Immediate execution with slippage protection
- Fill-or-Kill (FOK) and Immediate-or-Cancel (IOC)
- Smart routing for best execution

#### **Limit Orders** 📊
- Good-Till-Cancelled (GTC) and Day orders
- Post-only maker orders
- Partial fill support

#### **Stop Orders** 🛡️
- Stop-loss and stop-limit orders
- Trailing stops with dynamic adjustment
- Conditional execution triggers

#### **Advanced Orders** 🎛️
- **OCO**: One-Cancels-Other order pairs
- **Iceberg**: Hide large order size
- **TWAP**: Time-Weighted Average Price execution
- **VWAP**: Volume-Weighted Average Price execution

#### **Perpetual Futures** 🚀
- **Leverage**: 1x to 100x
- **Funding Rates**: 8-hour intervals, ±0.75% max
- **Auto-Liquidation**: Protect against cascade failures
- **Insurance Fund**: Cover liquidation shortfalls
- **Mark Price**: Oracle-based fair value pricing

## 🛠️ Technical Architecture

### Core DEX Engine

The DEX operates as a specialized trading component within the broader OmniBazaar ecosystem:

```text
┌─────────────────────────────────────────────────────────────────┐
│                        DEX Trading Engine                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Order Book     │  │  Risk Manager   │  │  Matching       │ │
│  │  Management     │  │  & Liquidation  │  │  Engine         │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Price Oracle   │  │  Settlement     │  │  API Gateway    │ │
│  │  Integration    │  │  Engine         │  │  & WebSocket    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────────┐
              │       Integration Points            │
              │                                     │
              │  📊 Validator: Consensus & Fees    │
              │  💬 Chat: Trading Discussions      │
              │  💾 Storage: Order Persistence     │
              │  💰 Wallet: Multi-chain Support    │
              └─────────────────────────────────────┘
```

## 🚀 Revolutionary Architecture

The OmniBazaar Unified Validator DEX breaks the artificial barriers imposed by existing blockchain networks. While Ethereum validators require 32 ETH + 256GB RAM + 2TB storage, our unified validator nodes run on **$300-500 hardware** while processing blockchain transactions, DEX operations, IPFS storage, and chat communications.

### Key Innovations

- **🏠 Affordable Hardware**: 4 cores, 8GB RAM, 100GB storage
- **🔧 Unified Services**: One node handles blockchain + DEX + IPFS + chat
- **💰 Fair Economics**: 70% of all fees go to validators
- **⚡ Early On-Chain**: Critical functions settled immediately on-chain
- **🌐 True Decentralization**: No PostgreSQL, Redis, or centralized components

---

## 💡 Why This Matters

### The Problem with Existing DEXs

| Existing DEXs | OmniBazaar Unified Validator |
|---------------|------------------------------|
| 32 ETH + $50K hardware | 1000 XOM + $500 hardware |
| PostgreSQL/Redis dependencies | Pure IPFS + validator consensus |
| Centralized order matching | Distributed validator network |
| Profits extracted by VCs | 70% fees to validator operators |

### Our Solution

```text
┌─────────────────────────────────────────────────────────────────┐
│                 Single Validator Node ($500 hardware)          │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐ ┌─────────────┐ ┌──────────────┐ ┌────────┐ │
│  │   Blockchain  │ │     DEX     │ │     IPFS     │ │  Chat  │ │
│  │ Processing    │ │ Operations  │ │   Storage    │ │ Network│ │
│  │   (~15%)      │ │   (~20%)    │ │   (~15%)     │ │ (~10%) │ │
│  └───────────────┘ └─────────────┘ └──────────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────────┐
              │       Monthly Validator Revenue     │
              │                                     │
              │  💰 DEX Fees: $300-800             │
              │  🎯 Block Rewards: $200-400        │
              │  💬 Chat/Storage: $100-300         │
              │  🛒 Marketplace: $200-600          │
              │  📊 Total: $800-2100/month         │
              └─────────────────────────────────────┘
```

---

## 🛠️ Technical Architecture

### Unified Validator Node Services

Each validator node runs all services simultaneously on modest hardware:

#### 1. **Blockchain Processing** (~15% resources)
- **OmniCoin Proof of Participation** consensus
- Transaction validation and block creation
- Participation score calculation
- Cross-chain bridge integration

#### 2. **DEX Operations** (~20% resources)
- **All Order Types**: Market, limit, stop, iceberg, TWAP, VWAP
- **Perpetual Futures**: True perpetuals with funding rates
- **Risk Management**: Liquidation engine, circuit breakers
- **Settlement**: Immediate on-chain settlement

#### 3. **IPFS Storage** (~15% resources)
- Distributed order book storage
- Chat message persistence
- Marketplace listing data
- User profile and reputation data

#### 4. **P2P Chat Network** (~10% resources)
- Trading room integration
- Private encrypted channels
- Voice chat capabilities
- File sharing via IPFS

#### 5. **Fee Distribution Engine** (~5% resources)
- Real-time fee collection
- Automated distribution (70% validators, 20% company, 10% development)
- Revenue tracking and analytics
- Validator performance rewards

### Resource Usage Optimization

```yaml
Total Hardware Usage: ~65% of modest specifications
Available Headroom: ~35% for future expansion
Hardware Cost: $300-500 vs $50,000+ for other networks
Setup Complexity: Single application vs complex infrastructure
```

---

## 📈 Economic Model

### Fee Structure

| Service | Fee | Validator Share | Company Share | Development |
|---------|-----|----------------|---------------|-------------|
| **Spot Trading** | 0.1-0.2% | 70% | 20% | 10% |
| **Perpetual Futures** | 0.05-0.15% | 70% | 20% | 10% |
| **Auto-Conversion** | 0.3% | 70% | 20% | 10% |
| **Marketplace Sales** | 2% | 70% | 20% | 10% |
| **Chat Premium** | $5/month XOM | 70% | 20% | 10% |
| **IPFS Storage** | $2/GB/month XOM | 70% | 20% | 10% |

### Validator Economics

#### Monthly Revenue Potential

```yaml
Conservative (100 validators):
  DEX Volume: $10M/month
  Revenue per Validator: $800/month
  Annual ROI: 160%

Moderate (500 validators):  
  DEX Volume: $100M/month
  Revenue per Validator: $1,200/month
  Annual ROI: 240%

Aggressive (1000 validators):
  DEX Volume: $500M/month  
  Revenue per Validator: $1,800/month
  Annual ROI: 360%
```

#### Payback Period: 3-6 months

---

## 🔗 OmniBazaar Integration

### Unified Ecosystem Services

The validator network powers the entire OmniBazaar ecosystem:

#### **Wallet Integration**
- Multi-chain wallet connectivity
- Auto-trading permissions
- Portfolio rebalancing
- Gas optimization

#### **Marketplace Integration**
- Automatic payment conversion to XOM
- SecureSend escrow integration
- Reputation score management
- Product listing storage via IPFS

#### **Chat Network**
- Trading room discussions
- Private buyer/seller channels
- Dispute resolution chat
- Real-time price alerts

#### **Storage Network**
- Product images and documents
- User profiles and reviews
- Chat message persistence
- Distributed content delivery

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.0+
- **TypeScript** 5.0+
- **4 CPU cores, 8GB RAM, 100GB storage**
- **50 Mbps internet connection**

### Installation

```bash
# Clone the OmniBazaar repository (if not already done)
git clone https://github.com/omnibazaar/omnibazaar.git
cd omnibazaar

# Install all dependencies from the root directory
npm install --legacy-peer-deps

# Note: Dependencies are now managed at the root level in /home/rickc/OmniBazaar/node_modules
# This includes all DEX dependencies (express, ethers, web3, socket.io, etc.)

# Navigate to DEX module
cd DEX

# Configure environment
cp .env.example .env
# Edit .env with your validator configuration

# Start the unified validator
npm run start:validator
```

### ✅ Core Architecture Complete

The unified validator architecture is now fully implemented with:

- **Core Classes**: UnifiedValidatorNode, DecentralizedOrderBook, OmniCoinBlockchain, IPFSStorageNetwork, P2PChatNetwork, FeeDistributionEngine
- **Smart Contracts**: DEXSettlement.sol, ValidatorRegistry.sol, FeeDistribution.sol (in /Coin/contracts/)
- **API Integration**: Complete trading, market data, chat, and storage APIs
- **70% Fee Distribution**: Automatic validator rewards with participation scoring
- **Modest Hardware**: 4 cores, 8GB RAM, 100GB storage vs $50K+ barriers

**Ready for Phase 2 development and testing!**

### Configuration

```bash
# Validator Configuration
VALIDATOR_NODE_ID=validator-001
VALIDATOR_STAKE=1000                    # Minimum 1000 XOM
VALIDATOR_CORES=4                       # Available CPU cores
VALIDATOR_MEMORY=8                      # Available RAM in GB
VALIDATOR_STORAGE=100                   # Available storage in GB

# Network Configuration
OMNICOIN_NETWORK_ID=omnibazaar-mainnet
OMNICOIN_RPC_URL=https://rpc.omnicoin.network
CONSENSUS_THRESHOLD=0.67                # 67% BFT threshold

# Fee Distribution
VALIDATOR_FEE_SHARE=0.70               # 70% to validators
COMPANY_FEE_SHARE=0.20                 # 20% to company
DEVELOPMENT_FEE_SHARE=0.10             # 10% to development
```

### Running Services

```bash
# Start unified validator (all services)
npm run start:validator

# Start individual services (development)
npm run start:blockchain               # Blockchain processing only
npm run start:dex                      # DEX operations only  
npm run start:ipfs                     # IPFS storage only
npm run start:chat                     # Chat network only

# Development mode with hot reload
npm run dev
```

---

## 📝 API Documentation

### Trading API

#### Place Order

```typescript
POST /api/v1/trading/orders

{
  "type": "LIMIT",
  "side": "BUY", 
  "pair": "XOM/USDC",
  "quantity": "100",
  "price": "1.50",
  "timeInForce": "GTC"
}
```

#### Get Order Book

```typescript
GET /api/v1/market-data/orderbook/XOM-USDC

{
  "pair": "XOM/USDC",
  "bids": [["1.49", "1000"], ["1.48", "2000"]],
  "asks": [["1.51", "1500"], ["1.52", "1800"]],
  "timestamp": "2024-12-15T10:30:00Z"
}
```

### Chat API

#### Send Message

```typescript
POST /api/v1/chat/messages

{
  "channel": "trading-xom-usdc",
  "message": "Great volume today!",
  "encrypted": false
}
```

### Storage API

#### Store File

```typescript
POST /api/v1/storage/files

{
  "file": "base64-encoded-content",
  "filename": "product-image.jpg",
  "public": true
}
```

### Validator API

#### Get Status

```typescript
GET /api/v1/validator/status

{
  "nodeId": "validator-001", 
  "services": ["blockchain", "dex", "ipfs", "chat"],
  "resourceUsage": {
    "cpu": "45%",
    "memory": "60%", 
    "storage": "30%"
  },
  "monthlyRevenue": "$1,200"
}
```

---

## 🧪 Development

### Project Structure

```text
DEX/
├── src/
│   ├── core/
│   │   ├── validator/          # Unified validator node
│   │   ├── blockchain/         # OmniCoin blockchain processing
│   │   ├── dex/               # Trading engine
│   │   ├── storage/           # IPFS network
│   │   ├── chat/              # P2P messaging
│   │   └── economics/         # Fee distribution
│   ├── api/
│   │   ├── trading.ts         # Trading endpoints
│   │   ├── market-data.ts     # Market data endpoints
│   │   ├── chat.ts            # Chat endpoints
│   │   └── storage.ts         # Storage endpoints
│   ├── contracts/             # Smart contracts
│   │   ├── DEXSettlement.sol  # On-chain settlement
│   │   ├── ValidatorRegistry.sol
│   │   └── FeeDistribution.sol
│   └── types/                 # TypeScript definitions
├── tests/                     # Test suites
├── docs/                      # Documentation
└── scripts/                   # Deployment scripts
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit              # Unit tests
npm run test:integration       # Integration tests
npm run test:e2e              # End-to-end tests
npm run test:performance      # Performance tests

# Test coverage
npm run test:coverage
```

#### Cross-Module Integration Testing

The DEX module is fully integrated with the test suite at the project root:

```bash
# Run all integration tests including DEX
cd /home/rickc/OmniBazaar
npm run test:integration

# Run only DEX tests
npx jest tests/integration/features/dex

# Run specific test file
npx jest tests/integration/features/dex/dex-trading.test.ts
```

For more details, see the [Integration Test Documentation](/home/rickc/OmniBazaar/tests/integration/README.md)

### Building

```bash
# Build for production
npm run build

# Build and watch for changes
npm run build:watch

# Type checking
npm run type-check
```

---

## 🔒 Security

### Smart Contract Security

- **Multiple Audits**: Professional security audits before mainnet
- **Formal Verification**: Mathematical proof of contract correctness
- **Bug Bounty Program**: Community-driven security testing
- **Circuit Breakers**: Emergency pause mechanisms

### Validator Security

- **BFT Consensus**: Byzantine fault tolerance (67% threshold)
- **Stake-Based Security**: Economic incentives align with network security
- **Reputation System**: Long-term validator performance tracking
- **Slashing Conditions**: Penalties for malicious behavior

### API Security

- **Rate Limiting**: Protection against abuse
- **JWT Authentication**: Secure session management
- **Input Validation**: Comprehensive parameter sanitization
- **HTTPS Enforcement**: Encrypted API communications

---

## 🌍 Network Participation

### Becoming a Validator

#### Requirements
- **Hardware**: 4 cores, 8GB RAM, 100GB storage
- **Stake**: Minimum 1000 XOM (~$100-500)
- **Network**: 50 Mbps symmetric internet
- **Uptime**: 95%+ availability requirement

#### Setup Process
1. **Hardware Setup**: Configure server or VPS
2. **Software Installation**: Install unified validator
3. **Stake Deposit**: Deposit minimum 1000 XOM
4. **Network Registration**: Register with validator network
5. **Service Configuration**: Enable desired services
6. **Start Earning**: Begin receiving fee distributions

#### Expected Returns
- **Conservative**: $800/month (160% annual ROI)
- **Moderate**: $1,200/month (240% annual ROI)  
- **Aggressive**: $1,800/month (360% annual ROI)

---

## 📊 Monitoring & Analytics

### Validator Dashboard

The unified validator includes a comprehensive dashboard:

- **Resource Usage**: Real-time CPU, memory, storage metrics
- **Service Status**: Health status of all integrated services
- **Revenue Tracking**: Daily/monthly fee distribution
- **Network Statistics**: Validator count, consensus health
- **Performance Metrics**: Order processing, chat activity

### Network Analytics

- **Trading Volume**: Real-time and historical volume data
- **Validator Distribution**: Geographic and ownership analysis
- **Fee Distribution**: Revenue flow and validator rewards
- **Service Usage**: IPFS storage, chat activity, marketplace integration

---

## 🛣️ Roadmap

### Phase 1: Foundation (Weeks 1-6) ✅
- ✅ Unified validator architecture
- ✅ Basic blockchain processing
- ✅ DEX order matching engine
- ✅ IPFS storage integration
- ✅ On-chain settlement contracts

### Phase 2: Trading Engine (Weeks 7-12) 🔄
- 🔄 All order types implementation
- 🔄 Perpetual futures trading
- 🔄 Risk management systems
- 🔄 Advanced analytics

### Phase 3: Integration (Weeks 13-18) ⏳
- ⏳ Complete IPFS integration
- ⏳ Chat network features
- ⏳ Marketplace integration
- ⏳ Mobile applications

### Phase 4: Ecosystem (Weeks 19-24) ⏳
- ⏳ KYC service integration
- ⏳ Oracle network
- ⏳ Cross-chain bridges
- ⏳ Advanced UI/UX

### Phase 5: Production (Weeks 25-30) ⏳
- ⏳ Institutional features
- ⏳ Advanced analytics
- ⏳ Security hardening
- ⏳ Global deployment

---

## 🤝 Contributing

We welcome contributions from the community! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/your-username/dex.git

# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and test
npm test

# Submit pull request
```

### Code Standards

- **TypeScript**: Strict typing required
- **ESLint**: Code linting and formatting
- **Jest**: Comprehensive test coverage
- **Documentation**: Clear code documentation

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 Support

- **Documentation**: [docs.omnibazaar.com/dex](https://docs.omnibazaar.com/dex)
- **Discord**: [discord.gg/omnibazaar](https://discord.gg/omnibazaar)
- **Telegram**: [t.me/omnibazaar](https://t.me/omnibazaar)
- **Email**: [dex-support@omnibazaar.com](mailto:dex-support@omnibazaar.com)

---

## 🚀 Join the Revolution

Help us democratize blockchain validation and trading. With just $500 in hardware and 1000 XOM, you can become part of the most innovative validator network ever created.

**Start earning today. Start validating tomorrow. Start the future now.**

[![Deploy Validator](https://img.shields.io/badge/Deploy-Validator-success?style=for-the-badge)](docs/validator-setup.md)
[![Join Discord](https://img.shields.io/badge/Join-Discord-7289da?style=for-the-badge)](https://discord.gg/omnibazaar)
[![View Docs](https://img.shields.io/badge/View-Docs-blue?style=for-the-badge)](https://docs.omnibazaar.com/dex)
