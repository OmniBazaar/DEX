// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPairFactory.sol";
import "./interfaces/IFeeCollector.sol";

/**
 * @title DEXRegistry
 * @notice Central registry for DEX configuration and trading pair management
 * @dev Manages fees, operators, trading pairs, and system components
 * @custom:security-contact security@omnibazaar.com
 */
contract DEXRegistry is Ownable, ReentrancyGuard {
    /// @notice Flag to track initialization status
    bool private initialized;

    /// @notice Reference to the pair factory contract
    address public pairFactory;

    /// @notice Reference to the fee collector contract
    address public feeCollector;

    /// @notice Maker fee in basis points (1 = 0.01%)
    uint256 public makerFee;

    /// @notice Taker fee in basis points (1 = 0.01%)
    uint256 public takerFee;

    /// @notice Flag to pause trading globally
    bool public tradingPaused;

    /// @notice Maximum allowed fee (10%)
    uint256 public constant MAX_FEE = 1000;

    /// @notice Default maker fee (0.1%)
    uint256 public constant DEFAULT_MAKER_FEE = 10;

    /// @notice Default taker fee (0.2%)
    uint256 public constant DEFAULT_TAKER_FEE = 20;

    /// @notice Trading pair information
    struct TradingPair {
        address baseToken;
        address quoteToken;
        address pairContract;
        bool active;
        uint256 createdAt;
    }

    /// @notice Fee configuration structure
    struct FeeConfig {
        uint256 makerFee;
        uint256 takerFee;
        address feeCollector;
    }

    /// @notice Mapping of operators with elevated permissions
    mapping(address => bool) public operators;

    /// @notice Mapping of trading pair hash to pair info
    mapping(bytes32 => TradingPair) public tradingPairs;

    /// @notice Array of all trading pair hashes for enumeration
    bytes32[] private allPairHashes;

    /// @notice Events
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event TradingPairRegistered(
        address indexed baseToken,
        address indexed quoteToken,
        address pairContract,
        uint256 timestamp
    );
    event MakerFeeUpdated(uint256 newFee);
    event TakerFeeUpdated(uint256 newFee);
    event TradingPaused();
    event TradingResumed();
    event PairFactoryUpdated(address newPairFactory);
    event FeeCollectorUpdated(address newFeeCollector);

    // Custom errors removed for test compatibility - using require statements

    /**
     * @notice Contract constructor
     * @dev Sets the deployer as the owner
     */
    constructor() Ownable(msg.sender) {
        // Constructor intentionally left empty
        // Initialization done in separate function for upgradability
    }

    /**
     * @notice Initialize the registry with core components
     * @param _pairFactory Address of the pair factory contract
     * @param _feeCollector Address of the fee collector contract
     * @dev Can only be called once
     */
    function initialize(
        address _pairFactory,
        address _feeCollector
    ) external onlyOwner {
        require(!initialized, "Already initialized");
        require(_pairFactory != address(0), "Invalid address");
        require(_feeCollector != address(0), "Invalid address");

        pairFactory = _pairFactory;
        feeCollector = _feeCollector;
        makerFee = DEFAULT_MAKER_FEE;
        takerFee = DEFAULT_TAKER_FEE;
        initialized = true;

        // Add owner as initial operator
        operators[msg.sender] = true;
        emit OperatorAdded(msg.sender);
    }

    /**
     * @notice Add a new operator
     * @param operator Address to grant operator privileges
     * @dev Only owner can add operators
     */
    function addOperator(address operator) external onlyOwner {
        require(operator != address(0), "Invalid address");
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    /**
     * @notice Remove an operator
     * @param operator Address to remove operator privileges from
     * @dev Only owner can remove operators
     */
    function removeOperator(address operator) external onlyOwner {
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    /**
     * @notice Register a new trading pair
     * @param baseToken Base token address
     * @param quoteToken Quote token address
     * @dev Only operators can register pairs
     */
    function registerTradingPair(
        address baseToken,
        address quoteToken
    ) external nonReentrant {
        require(operators[msg.sender], "Not operator");
        require(!tradingPaused, "Trading is paused");
        require(baseToken != address(0) && quoteToken != address(0), "Invalid address");
        require(baseToken != quoteToken, "Tokens must be different");

        // Create deterministic pair hash
        bytes32 pairHash = getPairHash(baseToken, quoteToken);
        require(!tradingPairs[pairHash].active, "Pair already exists");

        // Deploy new pair contract via factory
        address pairContract = IPairFactory(pairFactory).createPair(
            baseToken,
            quoteToken,
            address(this)
        );

        // Store trading pair info
        tradingPairs[pairHash] = TradingPair({
            baseToken: baseToken,
            quoteToken: quoteToken,
            pairContract: pairContract,
            active: true,
            createdAt: block.timestamp
        });

        allPairHashes.push(pairHash);

        emit TradingPairRegistered(baseToken, quoteToken, pairContract, block.timestamp);
    }

    /**
     * @notice Set the maker fee
     * @param _makerFee New maker fee in basis points
     * @dev Only owner can update fees
     */
    function setMakerFee(uint256 _makerFee) external onlyOwner {
        require(_makerFee <= MAX_FEE, "Fee too high");
        makerFee = _makerFee;
        emit MakerFeeUpdated(_makerFee);
    }

    /**
     * @notice Set the taker fee
     * @param _takerFee New taker fee in basis points
     * @dev Only owner can update fees
     */
    function setTakerFee(uint256 _takerFee) external onlyOwner {
        require(_takerFee <= MAX_FEE, "Fee too high");
        takerFee = _takerFee;
        emit TakerFeeUpdated(_takerFee);
    }

    /**
     * @notice Pause all trading activity
     * @dev Emergency function - only owner can pause
     */
    function pauseTrading() external onlyOwner {
        tradingPaused = true;
        emit TradingPaused();
    }

    /**
     * @notice Resume trading activity
     * @dev Only owner can resume after pause
     */
    function resumeTrading() external onlyOwner {
        tradingPaused = false;
        emit TradingResumed();
    }

    /**
     * @notice Get fee configuration
     * @return config Current fee configuration
     */
    function getFeeConfiguration() external view returns (FeeConfig memory config) {
        config = FeeConfig({
            makerFee: makerFee,
            takerFee: takerFee,
            feeCollector: feeCollector
        });
    }

    /**
     * @notice Check if an address is an operator
     * @param account Address to check
     * @return True if the address is an operator
     */
    function isOperator(address account) external view returns (bool) {
        return operators[account];
    }

    /**
     * @notice Get all registered trading pairs
     * @return pairs Array of all trading pair info
     */
    function getAllTradingPairs() external view returns (TradingPair[] memory pairs) {
        uint256 length = allPairHashes.length;
        pairs = new TradingPair[](length);

        for (uint256 i = 0; i < length; i++) {
            pairs[i] = tradingPairs[allPairHashes[i]];
        }
    }

    /**
     * @notice Get trading pair by tokens
     * @param baseToken Base token address
     * @param quoteToken Quote token address
     * @return pair Trading pair information
     */
    function getTradingPair(
        address baseToken,
        address quoteToken
    ) external view returns (TradingPair memory pair) {
        bytes32 pairHash = getPairHash(baseToken, quoteToken);
        pair = tradingPairs[pairHash];
    }

    /**
     * @notice Update the pair factory address
     * @param _pairFactory New pair factory address
     * @dev Only owner can update
     */
    function updatePairFactory(address _pairFactory) external onlyOwner {
        require(_pairFactory != address(0), "Invalid address");
        pairFactory = _pairFactory;
        emit PairFactoryUpdated(_pairFactory);
    }

    /**
     * @notice Update the fee collector address
     * @param _feeCollector New fee collector address
     * @dev Only owner can update
     */
    function updateFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Invalid address");
        feeCollector = _feeCollector;
        emit FeeCollectorUpdated(_feeCollector);
    }

    /**
     * @notice Generate deterministic pair hash
     * @param token0 First token address
     * @param token1 Second token address
     * @return Deterministic hash for the pair
     */
    function getPairHash(
        address token0,
        address token1
    ) public pure returns (bytes32) {
        // Sort tokens to ensure consistent hash regardless of order
        (address tokenA, address tokenB) = token0 < token1
            ? (token0, token1)
            : (token1, token0);
        return keccak256(abi.encodePacked(tokenA, tokenB));
    }

    /**
     * @notice Get the number of registered trading pairs
     * @return Number of trading pairs
     */
    function getTradingPairCount() external view returns (uint256) {
        return allPairHashes.length;
    }

    /**
     * @notice Check if the contract is initialized
     * @return True if initialized
     */
    function isInitialized() external view returns (bool) {
        return initialized;
    }
}