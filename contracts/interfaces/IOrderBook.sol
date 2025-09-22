// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IOrderBook
 * @notice Interface for order book functionality
 * @dev Defines the standard interface for DEX order books
 */
interface IOrderBook {
    /// @notice Order types
    enum OrderType {
        LIMIT,
        MARKET,
        STOP_LOSS,
        TAKE_PROFIT
    }

    /// @notice Order status
    enum OrderStatus {
        OPEN,
        PARTIALLY_FILLED,
        FILLED,
        CANCELLED
    }

    /// @notice Order structure
    struct Order {
        uint256 id;
        address trader;
        OrderType orderType;
        bool isBuy;
        uint256 price;
        uint256 amount;
        uint256 filled;
        OrderStatus status;
        uint256 timestamp;
    }

    /**
     * @notice Place a new order
     * @param isBuy True for buy order, false for sell
     * @param price Order price (0 for market orders)
     * @param amount Order amount
     * @param orderType Type of order
     * @return orderId ID of the placed order
     */
    function placeOrder(
        bool isBuy,
        uint256 price,
        uint256 amount,
        OrderType orderType
    ) external returns (uint256 orderId);

    /**
     * @notice Cancel an existing order
     * @param orderId ID of the order to cancel
     */
    function cancelOrder(uint256 orderId) external;

    /**
     * @notice Get order details
     * @param orderId ID of the order
     * @return order Order information
     */
    function getOrder(uint256 orderId) external view returns (Order memory order);

    /**
     * @notice Get best bid price
     * @return price Best bid price (highest buy price)
     */
    function getBestBid() external view returns (uint256 price);

    /**
     * @notice Get best ask price
     * @return price Best ask price (lowest sell price)
     */
    function getBestAsk() external view returns (uint256 price);

    /**
     * @notice Get order book depth
     * @param levels Number of price levels to return
     * @return bids Array of bid levels [price, amount]
     * @return asks Array of ask levels [price, amount]
     */
    function getOrderBookDepth(uint256 levels) external view returns (
        uint256[2][] memory bids,
        uint256[2][] memory asks
    );
}