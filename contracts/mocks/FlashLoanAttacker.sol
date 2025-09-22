// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IDEX.sol";

/**
 * @title FlashLoanAttacker
 * @notice Mock contract for testing flash loan attack prevention
 */
contract FlashLoanAttacker {
    IDEX public orderBook;

    constructor(address _orderBook) {
        orderBook = IDEX(_orderBook);
    }

    /**
     * @notice Execute flash loan attack
     */
    function executeAttack() external {
        // In a real flash loan attack, this would:
        // 1. Borrow large amounts
        // 2. Manipulate prices
        // 3. Profit from arbitrage
        // 4. Repay loan in same transaction

        // For testing, we simulate detection
        revert("Flash loan attack detected");
    }
}