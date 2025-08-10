#!/usr/bin/env ts-node
/**
 * Test script to verify DEX storage configuration
 * Tests connection to Redis, YugabyteDB, and IPFS
 */

import { detectAvailableStorage } from './src/config/yugabyte.config';
import { HybridDEXStorage } from './src/storage/HybridDEXStorage';
import { logger } from './src/utils/logger';

async function testStorageConfiguration() {
  console.log('=================================');
  console.log('DEX Storage Configuration Test');
  console.log('=================================\n');
  
  try {
    // 1. Detect available services
    console.log('1. Detecting available storage services...');
    const { hasRedis, hasYugabyte, hasIPFS, config } = await detectAvailableStorage();
    
    console.log('\nService Availability:');
    console.log(`  ✓ Redis:      ${hasRedis ? '✅ Available' : '❌ Not available (will use in-memory)'}`);
    console.log(`  ✓ YugabyteDB: ${hasYugabyte ? '✅ Available' : '❌ Not available (will use in-memory)'}`);
    console.log(`  ✓ IPFS:       ${hasIPFS ? '✅ Available' : '❌ Not available (archival disabled)'}`);
    
    // 2. Initialize storage with detected configuration
    console.log('\n2. Initializing HybridDEXStorage...');
    const storage = new HybridDEXStorage(config);
    await storage.initialize();
    
    // 3. Test basic operations
    console.log('\n3. Testing basic operations...');
    
    // Test order placement
    const testOrder = {
      id: `test-${Date.now()}`,
      userId: '0x1234567890123456789012345678901234567890',
      type: 'LIMIT' as const,
      side: 'BUY' as const,
      pair: 'XOM/USDC',
      quantity: '100',
      price: '1.5',
      status: 'OPEN' as const,
      filled: '0',
      remaining: '100',
      fees: '0.3',
      timestamp: Date.now(),
      updatedAt: Date.now(),
      timeInForce: 'GTC' as const,  // Good Till Cancelled
      validatorSignatures: [],
      replicationNodes: ['node1', 'node2']
    };
    
    console.log('   - Placing test order...');
    await storage.placeOrder(testOrder);
    console.log('   ✅ Order placed successfully');
    
    // Test order book retrieval
    console.log('   - Retrieving order book...');
    const orderBook = await storage.getOrderBook('XOM/USDC', 10);
    console.log(`   ✅ Order book retrieved (${orderBook.bids.length} bids, ${orderBook.asks.length} asks)`);
    
    // 4. Get storage statistics
    console.log('\n4. Storage Statistics:');
    const stats = await storage.getStats();
    console.log(`   - Hot tier (in-memory): ${stats.hot.inMemory} orders`);
    if (hasRedis) {
      console.log(`   - Hot tier (Redis):     ${stats.hot.redis} keys`);
    }
    if (hasYugabyte) {
      console.log(`   - Warm tier (YugabyteDB): ${stats.warm.postgresql} records`);
    }
    if (hasIPFS) {
      console.log(`   - Cold tier (IPFS):      ${stats.cold.ipfs} archives`);
    }
    
    // 5. Cleanup
    console.log('\n5. Cleaning up...');
    await storage.shutdown();
    console.log('   ✅ Storage shutdown complete');
    
    console.log('\n=================================');
    console.log('✅ All tests passed successfully!');
    console.log('=================================\n');
    
    console.log('Configuration Summary:');
    console.log('----------------------');
    if (!hasRedis && !hasYugabyte && !hasIPFS) {
      console.log('⚠️  Running in DEVELOPMENT MODE with in-memory storage only.');
      console.log('This is suitable for testing but not for production.');
    } else if (hasYugabyte && !hasRedis) {
      console.log('ℹ️  Running with YugabyteDB only. Consider adding Redis for better performance.');
    } else if (hasRedis && hasYugabyte && !hasIPFS) {
      console.log('✅ Running with Redis + YugabyteDB. IPFS archival is disabled.');
      console.log('This configuration is suitable for most production deployments.');
    } else if (hasRedis && hasYugabyte && hasIPFS) {
      console.log('🎉 Full hybrid storage stack available! Optimal configuration.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testStorageConfiguration();