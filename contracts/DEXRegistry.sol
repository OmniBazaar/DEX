// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title DEXRegistry
 * @notice Registry for DEX configuration and trading pair management
 * @dev Manages fees, operators, and trading pair registration
 */
contract DEXRegistry is Ownable, AccessControl, Pausable {
    /// @notice Operator role for managing trading pairs
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Maker fee in basis points
    uint256 public makerFee;

    /// @notice Taker fee in basis points
    uint256 public takerFee;

    /// @notice Trading pair info
    struct TradingPair {
        address baseToken;
        address quoteToken;
        address orderBook;
        bool active;
    }

    /// @notice Mapping of trading pair hash to info
    mapping(bytes32 => TradingPair) public tradingPairs;

    /// @notice Events
    event TradingPairRegistered(
        address indexed baseToken,
        address indexed quoteToken,
        address orderBook
    );
    event MakerFeeUpdated(uint256 newFee);
    event TakerFeeUpdated(uint256 newFee);

    constructor() Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    /**
     * @notice Set maker fee
     * @param _makerFee New maker fee in basis points
     */
    function setMakerFee(uint256 _makerFee) external onlyOwner {
        require(_makerFee <= 1000, "Fee too high"); // Max 10%
        makerFee = _makerFee;
        emit MakerFeeUpdated(_makerFee);
    }

    /**
     * @notice Set taker fee
     * @param _takerFee New taker fee in basis points
     */
    function setTakerFee(uint256 _takerFee) external onlyOwner {
        require(_takerFee <= 1000, "Fee too high"); // Max 10%
        takerFee = _takerFee;
        emit TakerFeeUpdated(_takerFee);
    }

    /**
     * @notice Register a new trading pair
     * @param baseToken Base token address
     * @param quoteToken Quote token address
     */
    function registerTradingPair(
        address baseToken,
        address quoteToken
    ) external {
        require(hasRole(OPERATOR_ROLE, msg.sender), "Not authorized");
        require(baseToken != address(0) && quoteToken != address(0), "Invalid token");
        require(baseToken != quoteToken, "Same token");

        bytes32 pairHash = keccak256(abi.encodePacked(baseToken, quoteToken));
        require(!tradingPairs[pairHash].active, "Pair already exists");

        // In production, would deploy new OrderBook here
        address orderBook = address(0); // Placeholder

        tradingPairs[pairHash] = TradingPair({
            baseToken: baseToken,
            quoteToken: quoteToken,
            orderBook: orderBook,
            active: true
        });

        emit TradingPairRegistered(baseToken, quoteToken, orderBook);
    }

    /**
     * @notice Pause trading globally
     */
    function pauseTrading() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resume trading globally
     */
    function resumeTrading() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Get trading pair info
     * @param baseToken Base token address
     * @param quoteToken Quote token address
     * @return Trading pair info
     */
    function getTradingPair(
        address baseToken,
        address quoteToken
    ) external view returns (TradingPair memory) {
        bytes32 pairHash = keccak256(abi.encodePacked(baseToken, quoteToken));
        return tradingPairs[pairHash];
    }
}