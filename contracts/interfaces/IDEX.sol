// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IDEX
 * @notice Interface for DEX core functionality
 */
interface IDEX {
    /**
     * @notice Order structure
     */
    struct Order {
        uint256 id;
        address maker;
        bool isBuy;
        uint256 price;
        uint256 amount;
        uint256 filled;
        uint256 timestamp;
        bool active;
    }

    /**
     * @notice Emitted when a new order is placed
     */
    event OrderPlaced(
        uint256 indexed orderId,
        address indexed maker,
        bool isBuy,
        uint256 price,
        uint256 amount
    );

    /**
     * @notice Emitted when an order is cancelled
     */
    event OrderCancelled(uint256 indexed orderId, address indexed maker);

    /**
     * @notice Emitted when an order is filled
     */
    event OrderFilled(
        uint256 indexed orderId,
        address indexed taker,
        uint256 filledAmount,
        uint256 price
    );

    /**
     * @notice Place a limit order
     * @param isBuy True for buy order, false for sell order
     * @param price Order price in quote token
     * @param amount Order amount in base token
     * @return orderId The ID of the placed order
     */
    function placeLimitOrder(
        bool isBuy,
        uint256 price,
        uint256 amount
    ) external returns (uint256 orderId);

    /**
     * @notice Cancel an order
     * @param orderId The ID of the order to cancel
     */
    function cancelOrder(uint256 orderId) external;

    /**
     * @notice Get order details
     * @param orderId The ID of the order
     * @return order The order details
     */
    function getOrder(uint256 orderId) external view returns (Order memory order);
}