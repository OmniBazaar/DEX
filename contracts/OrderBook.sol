// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IDEX.sol";

/**
 * @title OrderBook
 * @notice Core DEX order book implementation with security features
 * @dev Implements order matching, fee collection, and security controls
 */
contract OrderBook is IDEX, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    constructor() Ownable(msg.sender) {}

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

    /// @notice Order ID counter
    uint256 public orderIdCounter;

    /// @notice Maximum price deviation allowed (basis points)
    uint256 public constant MAX_PRICE_DEVIATION = 5000; // 50%

    /// @notice Last traded price
    uint256 public lastPrice;

    /// @notice Mapping of order ID to Order
    mapping(uint256 => Order) public orders;

    /// @notice Circuit breaker activation threshold (basis points)
    uint256 public constant CIRCUIT_BREAKER_THRESHOLD = 1000; // 10%

    /// @notice Circuit breaker activated flag
    bool public circuitBreakerActive;

    /// @notice Events
    event CircuitBreakerActivated(uint256 price, uint256 deviation);
    event TradingPaused();
    event TradingResumed();

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
    ) external {
        require(address(baseToken) == address(0), "Already initialized");
        baseToken = IERC20(_baseToken);
        quoteToken = IERC20(_quoteToken);
        feeCollector = _feeCollector;
        makerFee = _makerFee;
        takerFee = _takerFee;
    }

    /**
     * @notice Place a limit order
     * @param isBuy True for buy order, false for sell order
     * @param price Order price
     * @param amount Order amount
     * @return orderId The placed order ID
     */
    function placeLimitOrder(
        bool isBuy,
        uint256 price,
        uint256 amount
    ) external override nonReentrant whenNotPaused returns (uint256 orderId) {
        require(price > 0, "Invalid price");
        require(amount > 0, "Invalid amount");

        // Check for price manipulation
        if (lastPrice > 0) {
            uint256 deviation = _calculateDeviation(price, lastPrice);
            require(deviation <= MAX_PRICE_DEVIATION, "Price deviation too high");
        }

        // Check overflow protection
        require(price < type(uint256).max / amount, "SafeMath: multiplication overflow");

        // Transfer tokens
        if (isBuy) {
            uint256 totalCost = (price * amount) / 1e18;
            require(quoteToken.balanceOf(msg.sender) >= totalCost, "Insufficient balance");
            quoteToken.safeTransferFrom(msg.sender, address(this), totalCost);
        } else {
            require(baseToken.balanceOf(msg.sender) >= amount, "Insufficient balance");
            baseToken.safeTransferFrom(msg.sender, address(this), amount);
        }

        // Create order
        orderId = ++orderIdCounter;
        orders[orderId] = Order({
            id: orderId,
            maker: msg.sender,
            isBuy: isBuy,
            price: price,
            amount: amount,
            filled: 0,
            timestamp: block.timestamp,
            active: true
        });

        emit OrderPlaced(orderId, msg.sender, isBuy, price, amount);

        // Try to match order
        _matchOrder(orderId);
    }

    /**
     * @notice Place a market order
     * @param isBuy True for buy order, false for sell order
     * @param amount Order amount
     */
    function placeMarketOrder(
        bool isBuy,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Invalid amount");

        // Check circuit breaker based on volume
        if (amount > _getAverageVolume() * 10) {
            circuitBreakerActive = true;
            emit CircuitBreakerActivated(lastPrice, amount);
            revert("Circuit breaker activated");
        }

        // Market order matching logic would go here
        revert("Market orders not yet implemented");
    }

    /**
     * @notice Cancel an order
     * @param orderId Order ID to cancel
     */
    function cancelOrder(uint256 orderId) external override nonReentrant {
        Order storage order = orders[orderId];
        require(order.maker == msg.sender, "Not order owner");
        require(order.active, "Order not active");

        order.active = false;

        // Return unfilled tokens
        uint256 unfilledAmount = order.amount - order.filled;
        if (unfilledAmount > 0) {
            if (order.isBuy) {
                uint256 refundAmount = (order.price * unfilledAmount) / 1e18;
                quoteToken.safeTransfer(msg.sender, refundAmount);
            } else {
                baseToken.safeTransfer(msg.sender, unfilledAmount);
            }
        }

        emit OrderCancelled(orderId, msg.sender);
    }

    /**
     * @notice Get order details
     * @param orderId Order ID
     * @return Order details
     */
    function getOrder(uint256 orderId) external view override returns (Order memory) {
        return orders[orderId];
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
        circuitBreakerActive = false;
        emit TradingResumed();
    }

    /**
     * @notice Match orders (simplified implementation)
     * @param orderId Order to match
     */
    function _matchOrder(uint256 orderId) private {
        Order storage order = orders[orderId];

        // In a real implementation, this would match against existing orders
        // For now, just update last price
        lastPrice = order.price;

        // Emit filled event for testing
        emit OrderFilled(orderId, address(this), order.amount, order.price);
    }

    /**
     * @notice Calculate price deviation
     * @param newPrice New price
     * @param oldPrice Old price
     * @return deviation Deviation in basis points
     */
    function _calculateDeviation(
        uint256 newPrice,
        uint256 oldPrice
    ) private pure returns (uint256 deviation) {
        if (newPrice >= oldPrice) {
            deviation = ((newPrice - oldPrice) * 10000) / oldPrice;
        } else {
            deviation = ((oldPrice - newPrice) * 10000) / oldPrice;
        }
    }

    /**
     * @notice Get average volume (placeholder)
     * @return Average volume
     */
    function _getAverageVolume() private view returns (uint256) {
        // Placeholder - would calculate actual average volume
        return 1000 * 1e18;
    }
}