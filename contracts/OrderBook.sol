// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title OrderBook
 * @notice Core DEX order book implementation with advanced features
 * @dev Implements limit orders, market orders, stop orders, and fee collection
 * @custom:security-contact security@omnibazaar.com
 */
contract OrderBook is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Order status enumeration
    enum OrderStatus {
        None,     // 0: Default/non-existent
        Open,     // 1: Active order
        Filled,   // 2: Completely filled
        Cancelled // 3: Cancelled by user
    }

    /// @notice Order structure
    struct Order {
        uint256 id;
        address maker;
        bool isBuy;
        uint256 price;
        uint256 amount;
        uint256 filled;
        uint256 timestamp;
        OrderStatus status;
    }

    /// @notice Stop order structure
    struct StopOrder {
        uint256 id;
        address maker;
        bool isBuy;
        uint256 stopPrice;
        uint256 limitPrice;
        uint256 amount;
        bool triggered;
        uint256 timestamp;
    }

    /// @notice Order book depth entry
    struct PriceLevel {
        uint256 price;
        uint256 amount;
    }

    /// @notice Order book depth
    struct OrderBookDepth {
        PriceLevel[] buyOrders;
        PriceLevel[] sellOrders;
    }

    /// @notice Base token for trading pair
    IERC20 public baseToken;

    /// @notice Quote token for trading pair
    IERC20 public quoteToken;

    /// @notice Fee collector address
    address public feeCollector;

    /// @notice Maker fee in basis points (1 = 0.01%)
    uint256 public makerFee;

    /// @notice Taker fee in basis points
    uint256 public takerFee;

    /// @notice Fee denominator for basis points
    uint256 public constant FEE_DENOMINATOR = 10000;

    /// @notice Order ID counter
    uint256 public orderIdCounter;

    /// @notice Stop order ID counter
    uint256 public stopOrderIdCounter;

    /// @notice Last traded price
    uint256 public lastPrice;

    /// @notice Mapping of order ID to Order
    mapping(uint256 => Order) public orders;

    /// @notice Mapping of stop order ID to StopOrder
    mapping(uint256 => StopOrder) public stopOrders;

    /// @notice List of buy order IDs sorted by price (highest first)
    uint256[] private buyOrderIds;

    /// @notice List of sell order IDs sorted by price (lowest first)
    uint256[] private sellOrderIds;

    /// @notice Mapping of user to their order IDs
    mapping(address => uint256[]) private userOrderIds;

    /// @notice Events
    event OrderPlaced(
        uint256 indexed orderId,
        address indexed maker,
        bool isBuy,
        uint256 price,
        uint256 amount,
        uint256 filled
    );

    event OrderMatched(
        uint256 indexed buyOrderId,
        uint256 indexed sellOrderId,
        uint256 price,
        uint256 amount
    );

    event OrderCancelled(uint256 indexed orderId, address indexed maker);

    event MarketOrderExecuted(
        address indexed taker,
        bool isBuy,
        uint256 amount,
        uint256 averagePrice
    );

    event StopOrderPlaced(
        uint256 indexed stopOrderId,
        address indexed maker,
        bool isBuy,
        uint256 stopPrice,
        uint256 limitPrice,
        uint256 amount
    );

    event StopOrderTriggered(
        uint256 indexed stopOrderId,
        uint256 orderId
    );

    event TradingPaused();
    event TradingResumed();

    /**
     * @notice Contract constructor
     * @dev Sets deployer as owner
     */
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Initialize order book
     * @param _baseToken Base token address
     * @param _quoteToken Quote token address
     * @param _feeCollector Fee collector address
     * @param _makerFee Maker fee in basis points
     * @param _takerFee Taker fee in basis points
     */
    function initialize(
        address _baseToken,
        address _quoteToken,
        address _feeCollector,
        uint256 _makerFee,
        uint256 _takerFee
    ) external onlyOwner {
        require(address(baseToken) == address(0), "Already initialized");
        require(_baseToken != address(0), "Invalid base token");
        require(_quoteToken != address(0), "Invalid quote token");
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_makerFee <= FEE_DENOMINATOR, "Maker fee too high");
        require(_takerFee <= FEE_DENOMINATOR, "Taker fee too high");

        baseToken = IERC20(_baseToken);
        quoteToken = IERC20(_quoteToken);
        feeCollector = _feeCollector;
        makerFee = _makerFee;
        takerFee = _takerFee;
    }

    /**
     * @notice Place a limit order
     * @param isBuy True for buy order, false for sell order
     * @param price Order price in quote tokens per base token
     * @param amount Order amount in base tokens
     * @return orderId The placed order ID
     */
    function placeLimitOrder(
        bool isBuy,
        uint256 price,
        uint256 amount
    ) external nonReentrant whenNotPaused returns (uint256 orderId) {
        require(price > 0, "Invalid price");
        require(amount > 0, "Invalid amount");

        // Create order first
        orderId = ++orderIdCounter;
        orders[orderId] = Order({
            id: orderId,
            maker: msg.sender,
            isBuy: isBuy,
            price: price,
            amount: amount,
            filled: 0,
            timestamp: block.timestamp,
            status: OrderStatus.Open
        });

        userOrderIds[msg.sender].push(orderId);

        emit OrderPlaced(orderId, msg.sender, isBuy, price, amount, 0);

        // Try to match order
        _matchOrder(orderId);

        // After matching, transfer remaining tokens for unfilled portion
        uint256 remainingAmount = orders[orderId].amount - orders[orderId].filled;

        if (remainingAmount > 0 && orders[orderId].status == OrderStatus.Open) {
            if (isBuy) {
                // For buy orders, escrow quote tokens
                uint256 totalCost = (price * remainingAmount) / 1e18;
                quoteToken.safeTransferFrom(msg.sender, address(this), totalCost);
            } else {
                // For sell orders, escrow base tokens
                baseToken.safeTransferFrom(msg.sender, address(this), remainingAmount);
            }

            // Add to order book
            _addToOrderBook(orderId);
        }
    }

    /**
     * @notice Place a market order
     * @param isBuy True for buy order, false for sell order
     * @param amount Order amount in base tokens
     */
    function placeMarketOrder(
        bool isBuy,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Invalid amount");

        uint256 remainingAmount = amount;
        uint256 totalCost = 0;
        uint256[] memory matchedOrderIds = new uint256[](100);
        uint256 matchedCount = 0;

        if (isBuy) {
            // Match against sell orders
            for (uint256 i = 0; i < sellOrderIds.length && remainingAmount > 0; i++) {
                Order storage sellOrder = orders[sellOrderIds[i]];
                if (sellOrder.status != OrderStatus.Open) continue;

                uint256 fillAmount = _min(remainingAmount, sellOrder.amount - sellOrder.filled);
                totalCost += (fillAmount * sellOrder.price) / 1e18;
                remainingAmount -= fillAmount;
                matchedOrderIds[matchedCount++] = sellOrderIds[i];
            }
        } else {
            // Match against buy orders
            for (uint256 i = 0; i < buyOrderIds.length && remainingAmount > 0; i++) {
                Order storage buyOrder = orders[buyOrderIds[i]];
                if (buyOrder.status != OrderStatus.Open) continue;

                uint256 fillAmount = _min(remainingAmount, buyOrder.amount - buyOrder.filled);
                totalCost += (fillAmount * buyOrder.price) / 1e18;
                remainingAmount -= fillAmount;
                matchedOrderIds[matchedCount++] = buyOrderIds[i];
            }
        }

        require(remainingAmount == 0, "Insufficient liquidity");

        // Execute matches
        for (uint256 i = 0; i < matchedCount; i++) {
            _executeTrade(msg.sender, matchedOrderIds[i], isBuy);
        }

        uint256 averagePrice = (totalCost * 1e18) / amount;
        emit MarketOrderExecuted(msg.sender, isBuy, amount, averagePrice);
    }

    /**
     * @notice Place a stop order
     * @param isBuy True for buy order, false for sell order
     * @param stopPrice Price at which to trigger the order
     * @param limitPrice Limit price for the triggered order
     * @param amount Order amount in base tokens
     * @return stopOrderId The placed stop order ID
     */
    function placeStopOrder(
        bool isBuy,
        uint256 stopPrice,
        uint256 limitPrice,
        uint256 amount
    ) external nonReentrant whenNotPaused returns (uint256 stopOrderId) {
        require(stopPrice > 0, "Invalid stop price");
        require(limitPrice > 0, "Invalid limit price");
        require(amount > 0, "Invalid amount");

        stopOrderId = ++stopOrderIdCounter;
        stopOrders[stopOrderId] = StopOrder({
            id: stopOrderId,
            maker: msg.sender,
            isBuy: isBuy,
            stopPrice: stopPrice,
            limitPrice: limitPrice,
            amount: amount,
            triggered: false,
            timestamp: block.timestamp
        });

        emit StopOrderPlaced(stopOrderId, msg.sender, isBuy, stopPrice, limitPrice, amount);
    }

    /**
     * @notice Cancel an order
     * @param orderId Order ID to cancel
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.maker == msg.sender, "Not order owner");
        require(order.status == OrderStatus.Open, "Order not open");

        order.status = OrderStatus.Cancelled;

        // Refund escrowed tokens
        uint256 unfilledAmount = order.amount - order.filled;
        if (unfilledAmount > 0) {
            if (order.isBuy) {
                // Refund quote tokens
                uint256 refundAmount = (order.price * unfilledAmount) / 1e18;
                quoteToken.safeTransfer(msg.sender, refundAmount);
            } else {
                // Refund base tokens
                baseToken.safeTransfer(msg.sender, unfilledAmount);
            }
        }

        // Remove from order book
        _removeFromOrderBook(orderId);

        emit OrderCancelled(orderId, msg.sender);
    }

    /**
     * @notice Get order details
     * @param orderId Order ID
     * @return Order details
     */
    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    /**
     * @notice Get stop order details
     * @param stopOrderId Stop order ID
     * @return Stop order details
     */
    function getStopOrder(uint256 stopOrderId) external view returns (StopOrder memory) {
        return stopOrders[stopOrderId];
    }

    /**
     * @notice Get order book depth
     * @param levels Number of price levels to return
     * @return depth Order book depth
     */
    function getOrderBookDepth(uint256 levels) external view returns (OrderBookDepth memory depth) {
        depth.buyOrders = new PriceLevel[](0);
        depth.sellOrders = new PriceLevel[](0);

        // Aggregate buy orders by price
        uint256 buyLevels = 0;
        PriceLevel[] memory tempBuyLevels = new PriceLevel[](levels);
        uint256 lastBuyPrice = 0;

        for (uint256 i = 0; i < buyOrderIds.length && buyLevels < levels; i++) {
            Order memory order = orders[buyOrderIds[i]];
            if (order.status != OrderStatus.Open) continue;

            if (order.price != lastBuyPrice) {
                if (lastBuyPrice != 0) buyLevels++;
                if (buyLevels < levels) {
                    tempBuyLevels[buyLevels] = PriceLevel(order.price, 0);
                    lastBuyPrice = order.price;
                }
            }

            if (buyLevels < levels) {
                tempBuyLevels[buyLevels].amount += (order.amount - order.filled);
            }
        }

        // Copy to result
        if (lastBuyPrice != 0) buyLevels++;
        depth.buyOrders = new PriceLevel[](buyLevels);
        for (uint256 i = 0; i < buyLevels; i++) {
            depth.buyOrders[i] = tempBuyLevels[i];
        }

        // Aggregate sell orders by price
        uint256 sellLevels = 0;
        PriceLevel[] memory tempSellLevels = new PriceLevel[](levels);
        uint256 lastSellPrice = 0;

        for (uint256 i = 0; i < sellOrderIds.length && sellLevels < levels; i++) {
            Order memory order = orders[sellOrderIds[i]];
            if (order.status != OrderStatus.Open) continue;

            if (order.price != lastSellPrice) {
                if (lastSellPrice != 0) sellLevels++;
                if (sellLevels < levels) {
                    tempSellLevels[sellLevels] = PriceLevel(order.price, 0);
                    lastSellPrice = order.price;
                }
            }

            if (sellLevels < levels) {
                tempSellLevels[sellLevels].amount += (order.amount - order.filled);
            }
        }

        // Copy to result
        if (lastSellPrice != 0) sellLevels++;
        depth.sellOrders = new PriceLevel[](sellLevels);
        for (uint256 i = 0; i < sellLevels; i++) {
            depth.sellOrders[i] = tempSellLevels[i];
        }
    }

    /**
     * @notice Get best bid (highest buy price)
     * @return Best bid price level
     */
    function getBestBid() external view returns (PriceLevel memory) {
        for (uint256 i = 0; i < buyOrderIds.length; i++) {
            Order memory order = orders[buyOrderIds[i]];
            if (order.status == OrderStatus.Open && order.filled < order.amount) {
                return PriceLevel(order.price, order.amount - order.filled);
            }
        }
        return PriceLevel(0, 0);
    }

    /**
     * @notice Get best ask (lowest sell price)
     * @return Best ask price level
     */
    function getBestAsk() external view returns (PriceLevel memory) {
        for (uint256 i = 0; i < sellOrderIds.length; i++) {
            Order memory order = orders[sellOrderIds[i]];
            if (order.status == OrderStatus.Open && order.filled < order.amount) {
                return PriceLevel(order.price, order.amount - order.filled);
            }
        }
        return PriceLevel(0, 0);
    }

    /**
     * @notice Get user's orders
     * @param user User address
     * @return User's orders
     */
    function getUserOrders(address user) external view returns (Order[] memory) {
        uint256[] memory orderIds = userOrderIds[user];
        Order[] memory userOrders = new Order[](orderIds.length);

        for (uint256 i = 0; i < orderIds.length; i++) {
            userOrders[i] = orders[orderIds[i]];
        }

        return userOrders;
    }

    /**
     * @notice Pause trading
     */
    function pauseTrading() external onlyOwner {
        _pause();
        emit TradingPaused();
    }

    /**
     * @notice Resume trading
     */
    function resumeTrading() external onlyOwner {
        _unpause();
        emit TradingResumed();
    }

    /**
     * @notice Match a newly placed order against existing orders
     * @param orderId The order to match
     */
    function _matchOrder(uint256 orderId) private {
        Order storage order = orders[orderId];

        if (order.isBuy) {
            // Match against sell orders
            uint256 i = 0;
            while (i < sellOrderIds.length && order.filled < order.amount) {
                uint256 currentOrderId = sellOrderIds[i];
                Order storage sellOrder = orders[currentOrderId];

                if (sellOrder.status != OrderStatus.Open || sellOrder.price > order.price) {
                    i++;
                    continue;
                }

                // Match found
                uint256 matchAmount = _min(
                    order.amount - order.filled,
                    sellOrder.amount - sellOrder.filled
                );

                // Execute trade at maker price (price improvement for taker)
                uint256 matchPrice = sellOrder.price;
                _executeFill(orderId, currentOrderId, matchPrice, matchAmount);

                // Check stop orders
                _checkStopOrders(matchPrice);

                if (sellOrder.filled == sellOrder.amount) {
                    sellOrder.status = OrderStatus.Filled;
                    _removeFromOrderBook(currentOrderId);
                    // Don't increment i as array shifts
                    // But check if we're still within bounds after removal
                    if (i >= sellOrderIds.length) {
                        break;
                    }
                } else {
                    i++;
                }
            }
        } else {
            // Match against buy orders
            uint256 i = 0;
            while (i < buyOrderIds.length && order.filled < order.amount) {
                uint256 currentOrderId = buyOrderIds[i];
                Order storage buyOrder = orders[currentOrderId];

                if (buyOrder.status != OrderStatus.Open || buyOrder.price < order.price) {
                    i++;
                    continue;
                }

                // Match found
                uint256 matchAmount = _min(
                    order.amount - order.filled,
                    buyOrder.amount - buyOrder.filled
                );

                // Execute trade at maker price (price improvement for taker)
                uint256 matchPrice = buyOrder.price;
                _executeFill(currentOrderId, orderId, matchPrice, matchAmount);

                // Check stop orders
                _checkStopOrders(matchPrice);

                if (buyOrder.filled == buyOrder.amount) {
                    buyOrder.status = OrderStatus.Filled;
                    _removeFromOrderBook(currentOrderId);
                    // Don't increment i as array shifts
                    // But check if we're still within bounds after removal
                    if (i >= buyOrderIds.length) {
                        break;
                    }
                } else {
                    i++;
                }
            }
        }

        if (order.filled == order.amount) {
            order.status = OrderStatus.Filled;
        }
    }

    /**
     * @notice Execute a fill between two orders
     * @param buyOrderId Buy order ID
     * @param sellOrderId Sell order ID
     * @param price Execution price
     * @param amount Fill amount
     */
    function _executeFill(
        uint256 buyOrderId,
        uint256 sellOrderId,
        uint256 price,
        uint256 amount
    ) private {
        Order storage buyOrder = orders[buyOrderId];
        Order storage sellOrder = orders[sellOrderId];

        // Update filled amounts
        buyOrder.filled += amount;
        sellOrder.filled += amount;

        // Calculate quote amount
        uint256 quoteAmount = (amount * price) / 1e18;

        // Determine who is maker/taker and calculate fees
        uint256 buyerFee;
        uint256 sellerFee;

        if (buyOrder.timestamp < sellOrder.timestamp) {
            // Buy order is maker, sell order is taker
            buyerFee = (quoteAmount * makerFee) / FEE_DENOMINATOR;
            sellerFee = (quoteAmount * takerFee) / FEE_DENOMINATOR;
        } else {
            // Sell order is maker, buy order is taker
            buyerFee = (quoteAmount * takerFee) / FEE_DENOMINATOR;
            sellerFee = (quoteAmount * makerFee) / FEE_DENOMINATOR;
        }

        // Execute transfers
        if (buyOrder.timestamp < sellOrder.timestamp) {
            // Taker (seller) sends tokens first
            baseToken.safeTransferFrom(sellOrder.maker, buyOrder.maker, amount);
            quoteToken.safeTransferFrom(buyOrder.maker, sellOrder.maker, quoteAmount - sellerFee);

            // Fees
            if (buyerFee > 0) {
                quoteToken.safeTransferFrom(buyOrder.maker, feeCollector, buyerFee);
            }
            if (sellerFee > 0) {
                quoteToken.safeTransferFrom(buyOrder.maker, feeCollector, sellerFee);
            }
        } else {
            // Taker (buyer) initiates
            quoteToken.safeTransferFrom(buyOrder.maker, sellOrder.maker, quoteAmount - sellerFee);
            quoteToken.safeTransferFrom(buyOrder.maker, feeCollector, buyerFee + sellerFee);
            baseToken.safeTransferFrom(sellOrder.maker, buyOrder.maker, amount);
        }

        // Update last price
        lastPrice = price;

        emit OrderMatched(buyOrderId, sellOrderId, price, amount);
    }

    /**
     * @notice Execute a trade for market orders
     * @param taker Taker address
     * @param orderId Order to fill against
     * @param takerIsBuy Whether taker is buying
     */
    function _executeTrade(
        address taker,
        uint256 orderId,
        bool takerIsBuy
    ) private {
        Order storage order = orders[orderId];
        uint256 fillAmount = order.amount - order.filled;

        if (takerIsBuy) {
            // Taker buys from maker's sell order
            uint256 cost = (fillAmount * order.price) / 1e18;
            uint256 fee = (cost * takerFee) / FEE_DENOMINATOR;

            quoteToken.safeTransferFrom(taker, order.maker, cost - (fee / 2));
            quoteToken.safeTransferFrom(taker, feeCollector, fee);
            baseToken.safeTransfer(taker, fillAmount);
        } else {
            // Taker sells to maker's buy order
            uint256 revenue = (fillAmount * order.price) / 1e18;
            uint256 fee = (revenue * takerFee) / FEE_DENOMINATOR;

            baseToken.safeTransferFrom(taker, order.maker, fillAmount);
            quoteToken.safeTransfer(taker, revenue - fee);
            quoteToken.safeTransfer(feeCollector, fee);
        }

        order.filled = order.amount;
        order.status = OrderStatus.Filled;

        _removeFromOrderBook(orderId);
    }

    /**
     * @notice Check and trigger stop orders
     * @param currentPrice Current market price
     */
    function _checkStopOrders(uint256 currentPrice) private {
        // This is a simplified implementation
        // In production, would need more sophisticated stop order management

        for (uint256 i = 1; i <= stopOrderIdCounter; i++) {
            StopOrder storage stopOrder = stopOrders[i];

            if (stopOrder.triggered || stopOrder.amount == 0) continue;

            bool shouldTrigger = false;

            if (stopOrder.isBuy && currentPrice >= stopOrder.stopPrice) {
                shouldTrigger = true;
            } else if (!stopOrder.isBuy && currentPrice <= stopOrder.stopPrice) {
                shouldTrigger = true;
            }

            if (shouldTrigger) {
                stopOrder.triggered = true;

                // Place the limit order
                uint256 newOrderId = ++orderIdCounter;
                orders[newOrderId] = Order({
                    id: newOrderId,
                    maker: stopOrder.maker,
                    isBuy: stopOrder.isBuy,
                    price: stopOrder.limitPrice,
                    amount: stopOrder.amount,
                    filled: 0,
                    timestamp: block.timestamp,
                    status: OrderStatus.Open
                });

                emit StopOrderTriggered(i, newOrderId);

                // Try to match the new order
                _matchOrder(newOrderId);

                if (orders[newOrderId].filled < orders[newOrderId].amount) {
                    _addToOrderBook(newOrderId);
                }
            }
        }
    }

    /**
     * @notice Add order to order book
     * @param orderId Order ID to add
     */
    function _addToOrderBook(uint256 orderId) private {
        Order memory order = orders[orderId];

        if (order.isBuy) {
            // Insert in buyOrderIds sorted by price descending
            uint256 i = 0;
            while (i < buyOrderIds.length && orders[buyOrderIds[i]].price > order.price) {
                i++;
            }

            // Insert at position i
            buyOrderIds.push();
            for (uint256 j = buyOrderIds.length - 1; j > i; j--) {
                buyOrderIds[j] = buyOrderIds[j - 1];
            }
            buyOrderIds[i] = orderId;
        } else {
            // Insert in sellOrderIds sorted by price ascending
            uint256 i = 0;
            while (i < sellOrderIds.length && orders[sellOrderIds[i]].price < order.price) {
                i++;
            }

            // Insert at position i
            sellOrderIds.push();
            for (uint256 j = sellOrderIds.length - 1; j > i; j--) {
                sellOrderIds[j] = sellOrderIds[j - 1];
            }
            sellOrderIds[i] = orderId;
        }
    }

    /**
     * @notice Remove order from order book
     * @param orderId Order ID to remove
     */
    function _removeFromOrderBook(uint256 orderId) private {
        Order memory order = orders[orderId];

        if (order.isBuy) {
            // Remove from buyOrderIds
            for (uint256 i = 0; i < buyOrderIds.length; i++) {
                if (buyOrderIds[i] == orderId) {
                    for (uint256 j = i; j < buyOrderIds.length - 1; j++) {
                        buyOrderIds[j] = buyOrderIds[j + 1];
                    }
                    buyOrderIds.pop();
                    break;
                }
            }
        } else {
            // Remove from sellOrderIds
            for (uint256 i = 0; i < sellOrderIds.length; i++) {
                if (sellOrderIds[i] == orderId) {
                    for (uint256 j = i; j < sellOrderIds.length - 1; j++) {
                        sellOrderIds[j] = sellOrderIds[j + 1];
                    }
                    sellOrderIds.pop();
                    break;
                }
            }
        }
    }

    /**
     * @notice Get minimum of two values
     * @param a First value
     * @param b Second value
     * @return Minimum value
     */
    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}