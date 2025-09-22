// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IOrderBook.sol";

/**
 * @title TradingPair
 * @notice Represents a trading pair between two tokens
 * @dev Manages order placement and execution for a specific token pair
 * @custom:security-contact security@omnibazaar.com
 */
contract TradingPair is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice First token in the pair
    address public immutable token0;

    /// @notice Second token in the pair
    address public immutable token1;

    /// @notice DEX registry that manages this pair
    address public immutable registry;

    /// @notice Order book contract for this pair
    address public orderBook;

    /// @notice Total volume traded in token0
    uint256 public volume0;

    /// @notice Total volume traded in token1
    uint256 public volume1;

    /// @notice Events
    event OrderBookSet(address indexed orderBook);
    event TradeExecuted(
        address indexed buyer,
        address indexed seller,
        uint256 amount0,
        uint256 amount1,
        uint256 timestamp
    );

    // Custom errors removed for test compatibility

    /**
     * @notice Contract constructor
     * @param _token0 First token address
     * @param _token1 Second token address
     * @param _registry DEX registry address
     */
    constructor(
        address _token0,
        address _token1,
        address _registry
    ) {
        require(_token0 != address(0) && _token1 != address(0), "Invalid token");
        require(_registry != address(0), "Invalid registry");

        token0 = _token0;
        token1 = _token1;
        registry = _registry;
    }

    /**
     * @notice Set the order book for this pair
     * @param _orderBook Order book contract address
     * @dev Only callable by registry
     */
    function setOrderBook(address _orderBook) external {
        require(msg.sender == registry, "Unauthorized caller");
        orderBook = _orderBook;
        emit OrderBookSet(_orderBook);
    }

    /**
     * @notice Execute a trade between buyer and seller
     * @param buyer Buyer address
     * @param seller Seller address
     * @param amount0 Amount of token0 traded
     * @param amount1 Amount of token1 traded
     * @dev Only callable by order book
     */
    function executeTrade(
        address buyer,
        address seller,
        uint256 amount0,
        uint256 amount1
    ) external nonReentrant {
        require(msg.sender == orderBook, "Unauthorized caller");
        require(orderBook != address(0), "Order book not set");

        // Transfer tokens
        IERC20(token0).safeTransferFrom(buyer, seller, amount0);
        IERC20(token1).safeTransferFrom(seller, buyer, amount1);

        // Update volumes
        volume0 += amount0;
        volume1 += amount1;

        emit TradeExecuted(buyer, seller, amount0, amount1, block.timestamp);
    }

    /**
     * @notice Get pair information
     * @return _token0 First token address
     * @return _token1 Second token address
     * @return _orderBook Order book address
     * @return _volume0 Total volume in token0
     * @return _volume1 Total volume in token1
     */
    function getPairInfo() external view returns (
        address _token0,
        address _token1,
        address _orderBook,
        uint256 _volume0,
        uint256 _volume1
    ) {
        return (token0, token1, orderBook, volume0, volume1);
    }

    /**
     * @notice Check if this pair matches the given tokens
     * @param tokenA First token to check
     * @param tokenB Second token to check
     * @return matches True if this pair matches the tokens
     */
    function matchesPair(
        address tokenA,
        address tokenB
    ) external view returns (bool matches) {
        matches = (tokenA == token0 && tokenB == token1) ||
                  (tokenA == token1 && tokenB == token0);
    }
}