// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFeeCollector
 * @notice Interface for the fee collector contract
 * @dev Manages fee collection and distribution
 */
interface IFeeCollector {
    /**
     * @notice Collect fees from a trading pair
     * @param token Token in which fees are collected
     * @param amount Amount of fees to collect
     */
    function collectFees(address token, uint256 amount) external;

    /**
     * @notice Get the balance of a specific token
     * @param token Token address to check
     * @return balance Current balance of the token
     */
    function getBalance(address token) external view returns (uint256 balance);

    /**
     * @notice Withdraw fees to the owner
     * @param token Token to withdraw
     * @param amount Amount to withdraw
     */
    function withdraw(address token, uint256 amount) external;

    /**
     * @notice Request withdrawal for large amounts
     * @param token Token to withdraw
     * @param amount Amount to withdraw
     */
    function requestWithdrawal(address token, uint256 amount) external;

    /**
     * @notice Execute pending withdrawal after timelock
     * @param token Token to withdraw
     */
    function executeWithdrawal(address token) external;
}