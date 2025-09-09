import { expect } from 'chai';
import { ethers } from 'ethers';
import puppeteer, { Browser, Page } from 'puppeteer';
import { dexClient } from '../../src/services/dex/api/dexClient';

/**
 * End-to-End User Flow Tests
 * @file These tests simulate real user interactions with the DEX through the UI
 */
describe('DEX End-to-End User Flows', function() {
  this.timeout(60000); // 1 minute timeout for E2E tests

  let browser: Browser;
  let page: Page;
  
  const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';
  const TEST_WALLET = {
    address: '0x1234567890123456789012345678901234567890',
    privateKey: '0x0123456789012345678901234567890123456789012345678901234567890123',
  };

  /**
   * Set up browser and test environment
   */
  before(async (): Promise<void> => {
    // Launch browser
    browser = await puppeteer.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Mock wallet connection
    await page.evaluateOnNewDocument((wallet) => {
      // Mock ethereum provider
      (window as any).ethereum = {
        isMetaMask: true,
        selectedAddress: wallet.address,
        request: ({ method, params }: any) => {
          switch (method) {
            case 'eth_requestAccounts':
              return [wallet.address];
            case 'eth_accounts':
              return [wallet.address];
            case 'eth_chainId':
              return '0x1'; // Mainnet
            case 'personal_sign':
              return '0xmockedsignature';
            default:
              throw new Error(`Unhandled method: ${method}`);
          }
        },
        on: () => {},
        removeListener: () => {},
      };
    }, TEST_WALLET);
  });

  /**
   * Clean up browser after all tests
   */
  after(async (): Promise<void> => {
    if (browser) {
      await browser.close();
    }
  });

  /**
   * Navigate to DEX page before each test
   */
  beforeEach(async (): Promise<void> => {
    // Navigate to DEX page
    await page.goto(`${TEST_URL}/dex/trading`, { 
      waitUntil: 'networkidle2' 
    });
  });

  describe('Wallet Connection Flow', () => {
    /**
     * Tests successful wallet connection
     */
    it('should connect wallet successfully', async (): Promise<void> => {
      // Click connect wallet button
      const connectButton = await page.$('button:has-text("Connect Wallet")');
      if (connectButton) {
        await connectButton.click();
        
        // Wait for wallet modal
        await page.waitForSelector('[data-testid="wallet-modal"]', { timeout: 5000 });
        
        // Click MetaMask option
        await page.click('[data-testid="wallet-metamask"]');
        
        // Wait for connection
        await page.waitForFunction(
          () => document.querySelector('[data-testid="wallet-address"]')?.textContent?.includes('0x1234'),
          { timeout: 10000 }
        );
        
        // Verify wallet connected
        const walletAddress = await page.$eval(
          '[data-testid="wallet-address"]',
          el => el.textContent
        );
        expect(walletAddress).to.include('0x1234...7890');
      }
    });

    /**
     * Tests display of user balances after wallet connection
     */
    it('should display user balances after connection', async (): Promise<void> => {
      // Wait for balances to load
      await page.waitForSelector('[data-testid="balance-eth"]', { timeout: 10000 });
      
      const ethBalance = await page.$eval(
        '[data-testid="balance-eth"]',
        el => el.textContent
      );
      expect(ethBalance).to.match(/\d+\.\d+ ETH/);
      
      const usdcBalance = await page.$eval(
        '[data-testid="balance-usdc"]',
        el => el.textContent
      );
      expect(usdcBalance).to.match(/\d+\.\d+ USDC/);
    });
  });

  describe('Token Swap Flow', () => {
    /**
     * Tests complete token swap flow
     */
    it('should complete a token swap', async (): Promise<void> => {
      // Navigate to swap page
      await page.goto(`${TEST_URL}/dex/swap`, { waitUntil: 'networkidle2' });
      
      // Select tokens
      await page.click('[data-testid="token-selector-from"]');
      await page.waitForSelector('[data-testid="token-list"]');
      await page.click('[data-testid="token-ETH"]');
      
      await page.click('[data-testid="token-selector-to"]');
      await page.waitForSelector('[data-testid="token-list"]');
      await page.click('[data-testid="token-USDC"]');
      
      // Enter amount
      await page.type('[data-testid="swap-amount-from"]', '0.1');
      
      // Wait for quote
      await page.waitForFunction(
        () => {
          const toAmount = document.querySelector('[data-testid="swap-amount-to"]') as HTMLInputElement;
          return toAmount?.value && parseFloat(toAmount.value) > 0;
        },
        { timeout: 5000 }
      );
      
      // Check slippage settings
      await page.click('[data-testid="slippage-settings"]');
      await page.waitForSelector('[data-testid="slippage-modal"]');
      
      // Set custom slippage
      await page.click('[data-testid="slippage-custom"]');
      await page.fill('[data-testid="slippage-input"]', '1.0');
      await page.click('[data-testid="slippage-save"]');
      
      // Click swap button
      await page.click('[data-testid="swap-button"]');
      
      // Confirm swap
      await page.waitForSelector('[data-testid="swap-confirm-modal"]');
      
      // Verify swap details
      const swapDetails = await page.$eval(
        '[data-testid="swap-details"]',
        el => el.textContent
      );
      expect(swapDetails).to.include('0.1 ETH');
      expect(swapDetails).to.include('USDC');
      
      // Execute swap
      await page.click('[data-testid="swap-confirm-button"]');
      
      // Wait for transaction
      await page.waitForSelector('[data-testid="transaction-pending"]', { timeout: 10000 });
      
      // Wait for success
      await page.waitForSelector('[data-testid="transaction-success"]', { timeout: 30000 });
      
      // Verify success message
      const successMessage = await page.$eval(
        '[data-testid="transaction-success"]',
        el => el.textContent
      );
      expect(successMessage).to.include('Swap successful');
    });

    /**
     * Tests handling of insufficient balance scenario
     */
    it('should handle insufficient balance', async (): Promise<void> => {
      await page.goto(`${TEST_URL}/dex/swap`, { waitUntil: 'networkidle2' });
      
      // Enter large amount
      await page.type('[data-testid="swap-amount-from"]', '99999');
      
      // Verify error state
      await page.waitForSelector('[data-testid="insufficient-balance-error"]');
      
      // Swap button should be disabled
      const swapButton = await page.$('[data-testid="swap-button"]');
      const isDisabled = await swapButton?.evaluate(el => el.hasAttribute('disabled'));
      expect(isDisabled).to.be.true;
    });
  });

  describe('Limit Order Flow', () => {
    /**
     * Tests placing a limit buy order
     */
    it('should place a limit buy order', async (): Promise<void> => {
      // Ensure on trading page
      await page.goto(`${TEST_URL}/dex/trading`, { waitUntil: 'networkidle2' });
      
      // Select limit order type
      await page.click('[data-testid="order-type-limit"]');
      
      // Select buy side
      await page.click('[data-testid="order-side-buy"]');
      
      // Enter price
      await page.fill('[data-testid="order-price"]', '2400');
      
      // Enter amount
      await page.fill('[data-testid="order-amount"]', '0.5');
      
      // Check order summary
      const total = await page.$eval(
        '[data-testid="order-total"]',
        el => el.textContent
      );
      expect(total).to.include('1,200.00 USDC');
      
      // Place order
      await page.click('[data-testid="place-order-button"]');
      
      // Wait for confirmation
      await page.waitForSelector('[data-testid="order-placed-notification"]', { 
        timeout: 10000 
      });
      
      // Verify order appears in open orders
      await page.waitForSelector('[data-testid="open-orders-table"]');
      
      const orderRow = await page.$('[data-testid="order-row"]');
      expect(orderRow).to.exist;
      
      const orderDetails = await page.$eval(
        '[data-testid="order-row"]',
        el => el.textContent
      );
      expect(orderDetails).to.include('Buy');
      expect(orderDetails).to.include('0.5 ETH');
      expect(orderDetails).to.include('2,400.00');
    });

    /**
     * Tests canceling an open order
     */
    it('should cancel an open order', async (): Promise<void> => {
      // Assuming order exists from previous test
      await page.waitForSelector('[data-testid="open-orders-table"]');
      
      // Click cancel button
      await page.click('[data-testid="cancel-order-button"]');
      
      // Confirm cancellation
      await page.waitForSelector('[data-testid="cancel-confirm-modal"]');
      await page.click('[data-testid="confirm-cancel-button"]');
      
      // Wait for cancellation
      await page.waitForSelector('[data-testid="order-cancelled-notification"]', {
        timeout: 10000
      });
      
      // Verify order removed from list
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="order-row"]'),
        { timeout: 5000 }
      );
    });

    /**
     * Tests placing a stop-limit order
     */
    it('should place a stop-limit order', async (): Promise<void> => {
      // Select stop-limit order type
      await page.click('[data-testid="order-type-stop-limit"]');
      
      // Enter stop price
      await page.fill('[data-testid="order-stop-price"]', '2300');
      
      // Enter limit price
      await page.fill('[data-testid="order-price"]', '2290');
      
      // Enter amount
      await page.fill('[data-testid="order-amount"]', '0.3');
      
      // Place order
      await page.click('[data-testid="place-order-button"]');
      
      // Wait for confirmation
      await page.waitForSelector('[data-testid="order-placed-notification"]', {
        timeout: 10000
      });
    });
  });

  describe('Market Order Flow', () => {
    /**
     * Tests executing a market buy order
     */
    it('should execute market buy order', async (): Promise<void> => {
      // Select market order type
      await page.click('[data-testid="order-type-market"]');
      
      // Select buy side
      await page.click('[data-testid="order-side-buy"]');
      
      // Enter amount
      await page.fill('[data-testid="order-amount"]', '0.2');
      
      // Check estimated price
      const estimatedPrice = await page.$eval(
        '[data-testid="market-price-estimate"]',
        el => el.textContent
      );
      expect(estimatedPrice).to.match(/~\d+,\d+\.\d+ USDC/);
      
      // Execute order
      await page.click('[data-testid="place-order-button"]');
      
      // Wait for execution
      await page.waitForSelector('[data-testid="order-executed-notification"]', {
        timeout: 10000
      });
      
      // Verify in trade history
      await page.click('[data-testid="trade-history-tab"]');
      
      await page.waitForSelector('[data-testid="trade-history-table"]');
      
      const tradeRow = await page.$eval(
        '[data-testid="trade-row"]:first-child',
        el => el.textContent
      );
      expect(tradeRow).to.include('Market Buy');
      expect(tradeRow).to.include('0.2 ETH');
    });
  });

  describe('Order Book Interaction', () => {
    /**
     * Tests filling order form by clicking order book
     */
    it('should fill order form by clicking order book', async (): Promise<void> => {
      // Wait for order book to load
      await page.waitForSelector('[data-testid="order-book"]', { timeout: 10000 });
      
      // Click on a sell order (ask)
      const askRow = await page.$('[data-testid="ask-row"]:first-child');
      await askRow?.click();
      
      // Verify form filled with price
      const priceInput = await page.$eval(
        '[data-testid="order-price"]',
        (el: HTMLInputElement) => el.value
      );
      expect(priceInput).to.match(/\d+\.\d+/);
      
      // Verify buy side selected
      const buySideActive = await page.$eval(
        '[data-testid="order-side-buy"]',
        el => el.classList.contains('active')
      );
      expect(buySideActive).to.be.true;
    });
  });

  describe('Chart Interaction', () => {
    /**
     * Tests changing chart timeframe
     */
    it('should change chart timeframe', async (): Promise<void> => {
      // Wait for chart to load
      await page.waitForSelector('[data-testid="price-chart"]', { timeout: 10000 });
      
      // Click 1H timeframe
      await page.click('[data-testid="timeframe-1h"]');
      
      // Verify chart updated
      await page.waitForFunction(
        () => {
          const chart = document.querySelector('[data-testid="price-chart"]');
          return chart?.getAttribute('data-timeframe') === '1h';
        },
        { timeout: 5000 }
      );
      
      // Click 1D timeframe
      await page.click('[data-testid="timeframe-1d"]');
      
      // Verify chart updated
      await page.waitForFunction(
        () => {
          const chart = document.querySelector('[data-testid="price-chart"]');
          return chart?.getAttribute('data-timeframe') === '1d';
        },
        { timeout: 5000 }
      );
    });
  });

  describe('Trading Pair Selection', () => {
    /**
     * Tests switching trading pairs
     */
    it('should switch trading pairs', async (): Promise<void> => {
      // Click pair selector
      await page.click('[data-testid="pair-selector"]');
      
      // Wait for pair list
      await page.waitForSelector('[data-testid="pair-list"]');
      
      // Search for BTC
      await page.type('[data-testid="pair-search"]', 'BTC');
      
      // Select BTC/USDC
      await page.click('[data-testid="pair-BTC/USDC"]');
      
      // Verify pair changed
      await page.waitForFunction(
        () => {
          const pairDisplay = document.querySelector('[data-testid="current-pair"]');
          return pairDisplay?.textContent === 'BTC/USDC';
        },
        { timeout: 5000 }
      );
      
      // Verify order book updated
      const orderBookTitle = await page.$eval(
        '[data-testid="order-book-title"]',
        el => el.textContent
      );
      expect(orderBookTitle).to.include('BTC/USDC');
    });
  });

  describe('Mobile Responsive Flow', () => {
    /**
     * Tests functionality on mobile viewport
     */
    it('should work on mobile viewport', async (): Promise<void> => {
      // Set mobile viewport
      await page.setViewport({ width: 375, height: 667 });
      
      // Verify mobile menu
      await page.waitForSelector('[data-testid="mobile-menu-button"]');
      
      // Open mobile menu
      await page.click('[data-testid="mobile-menu-button"]');
      
      // Navigate to swap
      await page.click('[data-testid="mobile-nav-swap"]');
      
      // Verify swap page loads
      await page.waitForSelector('[data-testid="swap-card"]');
      
      // Test swap on mobile
      await page.type('[data-testid="swap-amount-from"]', '0.05');
      
      // Verify responsive design
      const swapCard = await page.$('[data-testid="swap-card"]');
      const cardWidth = await swapCard?.evaluate(el => el.offsetWidth);
      expect(cardWidth).to.be.lte(375);
    });
  });

  describe('Error Recovery Flow', () => {
    /**
     * Tests graceful handling of network disconnection
     */
    it('should handle network disconnection gracefully', async (): Promise<void> => {
      // Simulate offline
      await page.setOfflineMode(true);
      
      // Try to place order
      await page.click('[data-testid="place-order-button"]');
      
      // Verify error message
      await page.waitForSelector('[data-testid="network-error"]', { timeout: 5000 });
      
      const errorMessage = await page.$eval(
        '[data-testid="network-error"]',
        el => el.textContent
      );
      expect(errorMessage).to.include('Network connection lost');
      
      // Go back online
      await page.setOfflineMode(false);
      
      // Verify reconnection
      await page.waitForSelector('[data-testid="network-connected"]', { timeout: 10000 });
    });

    /**
     * Tests handling of transaction failures
     */
    it('should handle transaction failures', async (): Promise<void> => {
      // Mock transaction failure
      await page.evaluateOnNewDocument(() => {
        (window as any).ethereum.request = ({ method }: any) => {
          if (method === 'eth_sendTransaction') {
            throw new Error('User denied transaction');
          }
          return [];
        };
      });
      
      // Try to swap
      await page.goto(`${TEST_URL}/dex/swap`, { waitUntil: 'networkidle2' });
      await page.type('[data-testid="swap-amount-from"]', '0.1');
      await page.click('[data-testid="swap-button"]');
      
      // Verify error handling
      await page.waitForSelector('[data-testid="transaction-error"]', { timeout: 10000 });
      
      const errorMessage = await page.$eval(
        '[data-testid="transaction-error"]',
        el => el.textContent
      );
      expect(errorMessage).to.include('Transaction failed');
    });
  });

  describe('Accessibility Tests', () => {
    /**
     * Tests keyboard navigation
     */
    it('should be keyboard navigable', async (): Promise<void> => {
      // Tab through elements
      await page.keyboard.press('Tab');
      
      // Check focus on first interactive element
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).to.be.oneOf(['BUTTON', 'A', 'INPUT']);
      
      // Navigate with keyboard
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
      }
      
      // Activate with Enter
      await page.keyboard.press('Enter');
      
      // Verify action triggered
      // (specific assertion depends on which element was focused)
    });

    /**
     * Tests proper ARIA labels for accessibility
     */
    it('should have proper ARIA labels', async (): Promise<void> => {
      const elements = await page.$$eval('[aria-label]', els => 
        els.map(el => ({
          tag: el.tagName,
          label: el.getAttribute('aria-label'),
        }))
      );
      
      expect(elements.length).to.be.gt(0);
      elements.forEach(el => {
        expect(el.label).to.not.be.empty;
      });
    });
  });

  describe('Performance Tests', () => {
    /**
     * Tests trading page load performance
     */
    it('should load trading page within acceptable time', async (): Promise<void> => {
      const startTime = Date.now();
      
      await page.goto(`${TEST_URL}/dex/trading`, { 
        waitUntil: 'networkidle2' 
      });
      
      // Wait for critical elements
      await Promise.all([
        page.waitForSelector('[data-testid="order-book"]'),
        page.waitForSelector('[data-testid="trading-form"]'),
        page.waitForSelector('[data-testid="price-chart"]'),
      ]);
      
      const loadTime = Date.now() - startTime;
      // eslint-disable-next-line no-console
      console.log(`Page load time: ${loadTime}ms`);
      
      expect(loadTime).to.be.lte(5000); // 5 seconds max
    });

    /**
     * Tests performance of rapid order placement
     */
    it('should handle rapid order placement', async (): Promise<void> => {
      const orderCount = 5;
      const orders = [];
      
      for (let i = 0; i < orderCount; i++) {
        await page.fill('[data-testid="order-price"]', `${2400 - i * 10}`);
        await page.fill('[data-testid="order-amount"]', '0.1');
        
        const startTime = Date.now();
        await page.click('[data-testid="place-order-button"]');
        await page.waitForSelector('[data-testid="order-placed-notification"]');
        const orderTime = Date.now() - startTime;
        
        orders.push(orderTime);
        
        // Clear notification
        await page.click('[data-testid="notification-close"]');
      }
      
      const avgTime = orders.reduce((a, b) => a + b) / orders.length;
      // eslint-disable-next-line no-console
      console.log(`Average order placement time: ${avgTime}ms`);
      
      expect(avgTime).to.be.lte(2000); // 2 seconds average
    });
  });
});