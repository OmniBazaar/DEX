// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title FeeCollector
 * @notice Collects and manages DEX trading fees
 * @dev Implements withdrawal controls and time locks for security
 */
contract FeeCollector is Ownable {
    using SafeERC20 for IERC20;

    constructor() Ownable(msg.sender) {}

    /// @notice Withdrawal request structure
    struct WithdrawalRequest {
        uint256 amount;
        uint256 requestTime;
        bool executed;
    }

    /// @notice Time lock duration for large withdrawals (24 hours)
    uint256 public constant TIME_LOCK_DURATION = 24 hours;

    /// @notice Large withdrawal threshold
    uint256 public constant LARGE_WITHDRAWAL_THRESHOLD = 10000 * 1e18;

    /// @notice Daily withdrawal limit
    uint256 public constant DAILY_WITHDRAWAL_LIMIT = 50000 * 1e18;

    /// @notice Mapping of token to withdrawal requests
    mapping(address => WithdrawalRequest) public withdrawalRequests;

    /// @notice Mapping of token to daily withdrawal amount
    mapping(address => mapping(uint256 => uint256)) public dailyWithdrawals;

    /// @notice Events
    event FeesCollected(address indexed token, uint256 amount);
    event WithdrawalRequested(address indexed token, uint256 amount);
    event WithdrawalExecuted(address indexed token, uint256 amount);

    /**
     * @notice Request withdrawal for large amounts
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function requestWithdrawal(address token, uint256 amount) external onlyOwner {
        require(amount >= LARGE_WITHDRAWAL_THRESHOLD, "Use direct withdrawal");

        withdrawalRequests[token] = WithdrawalRequest({
            amount: amount,
            requestTime: block.timestamp,
            executed: false
        });

        emit WithdrawalRequested(token, amount);
    }

    /**
     * @notice Execute pending withdrawal after time lock
     * @param token Token address
     */
    function executeWithdrawal(address token) external onlyOwner {
        WithdrawalRequest storage request = withdrawalRequests[token];
        require(request.amount > 0, "No pending withdrawal");
        require(!request.executed, "Already executed");
        require(
            block.timestamp >= request.requestTime + TIME_LOCK_DURATION,
            "Withdrawal time lock active"
        );

        request.executed = true;
        IERC20(token).safeTransfer(owner(), request.amount);

        emit WithdrawalExecuted(token, request.amount);
    }

    /**
     * @notice Direct withdrawal for small amounts
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function withdraw(address token, uint256 amount) external onlyOwner {
        require(amount < LARGE_WITHDRAWAL_THRESHOLD, "Use time-locked withdrawal");

        // Check daily limit
        uint256 today = block.timestamp / 1 days;
        uint256 withdrawnToday = dailyWithdrawals[token][today];
        require(
            withdrawnToday + amount <= DAILY_WITHDRAWAL_LIMIT,
            "Daily withdrawal limit exceeded"
        );

        dailyWithdrawals[token][today] = withdrawnToday + amount;
        IERC20(token).safeTransfer(owner(), amount);

        emit WithdrawalExecuted(token, amount);
    }

    /**
     * @notice Receive fees from order book
     * @param token Token address
     * @param amount Fee amount
     */
    function collectFees(address token, uint256 amount) external {
        // In production, would check caller is valid order book
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit FeesCollected(token, amount);
    }

    /**
     * @notice Get token balance
     * @param token Token address
     * @return Balance
     */
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}