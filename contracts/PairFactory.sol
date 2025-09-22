// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPairFactory.sol";
import "./TradingPair.sol";

/**
 * @title PairFactory
 * @notice Factory contract for deploying trading pairs
 * @dev Uses CREATE2 for deterministic addresses
 * @custom:security-contact security@omnibazaar.com
 */
contract PairFactory is IPairFactory, Ownable {
    /// @notice Array of all deployed pair addresses
    address[] public allPairs;

    /// @notice Mapping from token addresses to pair address
    mapping(address => mapping(address => address)) private pairs;

    /// @notice DEX registry address
    address public registry;

    /// @notice Events
    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256 pairNumber
    );
    event RegistryUpdated(address newRegistry);

    /// @notice Custom errors
    // Custom errors removed for test compatibility

    /**
     * @notice Contract constructor
     * @dev Sets the deployer as owner
     */
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Set the DEX registry address
     * @param _registry New registry address
     */
    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "Zero address");
        registry = _registry;
        emit RegistryUpdated(_registry);
    }

    /**
     * @notice Create a new trading pair
     * @param tokenA First token address
     * @param tokenB Second token address
     * @param _registry Registry address (used for validation)
     * @return pair Address of the created pair
     */
    function createPair(
        address tokenA,
        address tokenB,
        address _registry
    ) external override returns (address pair) {
        require(_registry == registry, "Invalid registry");
        require(tokenA != tokenB, "Identical addresses");
        require(tokenA != address(0) && tokenB != address(0), "Zero address");

        // Sort tokens for deterministic ordering
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        // Check if pair already exists
        require(pairs[token0][token1] == address(0), "Pair exists");

        // Deploy new trading pair using CREATE2
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(
            new TradingPair{salt: salt}(
                token0,
                token1,
                registry
            )
        );

        // Update mappings
        pairs[token0][token1] = pair;
        pairs[token1][token0] = pair; // Populate reverse mapping
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /**
     * @notice Get the pair address for two tokens
     * @param tokenA First token address
     * @param tokenB Second token address
     * @return pair Address of the pair (0 if not exists)
     */
    function getPair(
        address tokenA,
        address tokenB
    ) external view override returns (address pair) {
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        pair = pairs[token0][token1];
    }

    /**
     * @notice Check if a pair exists
     * @param tokenA First token address
     * @param tokenB Second token address
     * @return exists True if pair exists
     */
    function pairExists(
        address tokenA,
        address tokenB
    ) external view override returns (bool exists) {
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        exists = pairs[token0][token1] != address(0);
    }

    /**
     * @notice Get all deployed pairs
     * @return Array of pair addresses
     */
    function getAllPairs() external view override returns (address[] memory) {
        return allPairs;
    }

    /**
     * @notice Get the number of deployed pairs
     * @return Number of pairs
     */
    function getPairCount() external view override returns (uint256) {
        return allPairs.length;
    }

    /**
     * @notice Calculate the deterministic address for a pair
     * @param token0 First token (must be < token1)
     * @param token1 Second token (must be > token0)
     * @return pair The address where the pair would be deployed
     */
    function calculatePairAddress(
        address token0,
        address token1
    ) external view returns (address pair) {
        require(token0 < token1, "Invalid token order");

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        bytes memory bytecode = abi.encodePacked(
            type(TradingPair).creationCode,
            abi.encode(token0, token1, registry)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );
        pair = address(uint160(uint256(hash)));
    }
}