-- DEX Database Schema for YugabyteDB
-- Migration: 001_create_dex_tables.sql
-- Description: Creates core DEX tables with UUID primary keys

-- Orders table with UUID primary key
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(64) NOT NULL,
    type VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    pair VARCHAR(20) NOT NULL,
    quantity NUMERIC(78, 0) NOT NULL, -- 78 digits for uint256
    price NUMERIC(78, 0),
    status VARCHAR(20) NOT NULL,
    filled NUMERIC(78, 0) DEFAULT 0,
    remaining NUMERIC(78, 0) NOT NULL,
    average_price NUMERIC(78, 0),
    fees NUMERIC(78, 0) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ipfs_cid VARCHAR(64)
);

-- Create indexes for orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_pair ON orders(pair);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Trades table with UUID primary key
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    pair VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity NUMERIC(78, 0) NOT NULL,
    price NUMERIC(78, 0) NOT NULL,
    quote_quantity NUMERIC(78, 0) NOT NULL,
    fee NUMERIC(78, 0) NOT NULL,
    fee_asset VARCHAR(10) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_buyer_maker BOOLEAN,
    ipfs_cid VARCHAR(64),
    on_chain_tx_hash VARCHAR(66)
);

-- Create indexes for trades
CREATE INDEX IF NOT EXISTS idx_trades_order_id ON trades(order_id);
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades(pair);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);

-- Positions table for perpetuals with UUID primary key
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(64) NOT NULL,
    contract VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    size NUMERIC(78, 0) NOT NULL,
    entry_price NUMERIC(78, 0) NOT NULL,
    mark_price NUMERIC(78, 0) NOT NULL,
    leverage INTEGER NOT NULL,
    margin NUMERIC(78, 0) NOT NULL,
    unrealized_pnl NUMERIC(78, 0) DEFAULT 0,
    liquidation_price NUMERIC(78, 0) NOT NULL,
    funding_payment NUMERIC(78, 0) DEFAULT 0,
    last_funding_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for positions
CREATE INDEX IF NOT EXISTS idx_positions_user_id ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_contract ON positions(contract);

-- Market data table
CREATE TABLE IF NOT EXISTS market_data (
    pair VARCHAR(20) NOT NULL,
    last_price NUMERIC(78, 0) NOT NULL,
    price_change NUMERIC(78, 0) NOT NULL,
    high_24h NUMERIC(78, 0) NOT NULL,
    low_24h NUMERIC(78, 0) NOT NULL,
    volume_24h NUMERIC(78, 0) NOT NULL,
    quote_volume_24h NUMERIC(78, 0) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pair, timestamp)
);

-- Create index for market data
CREATE INDEX IF NOT EXISTS idx_market_data_timestamp ON market_data(timestamp);

-- Order book snapshots for recovery
CREATE TABLE IF NOT EXISTS order_book_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pair VARCHAR(20) NOT NULL,
    snapshot_data JSONB NOT NULL,
    sequence BIGINT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for order book snapshots
CREATE INDEX IF NOT EXISTS idx_order_book_snapshots_pair ON order_book_snapshots(pair);
CREATE INDEX IF NOT EXISTS idx_order_book_snapshots_timestamp ON order_book_snapshots(timestamp);

-- Fee distribution records
CREATE TABLE IF NOT EXISTS fee_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID REFERENCES trades(id),
    validator_address VARCHAR(64) NOT NULL,
    fee_amount NUMERIC(78, 0) NOT NULL,
    fee_type VARCHAR(20) NOT NULL, -- 'validator', 'company', 'development'
    distributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for fee distributions
CREATE INDEX IF NOT EXISTS idx_fee_distributions_trade_id ON fee_distributions(trade_id);
CREATE INDEX IF NOT EXISTS idx_fee_distributions_validator ON fee_distributions(validator_address);
CREATE INDEX IF NOT EXISTS idx_fee_distributions_timestamp ON fee_distributions(distributed_at);