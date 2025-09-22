// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IDEX.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ReentrancyAttacker
 * @notice Mock contract for testing reentrancy protection
 */
contract ReentrancyAttacker {
    IDEX public orderBook;
    bool public attacking;

    constructor(address _orderBook) {
        orderBook = IDEX(_orderBook);
    }

    /**
     * @notice Attempt reentrancy attack on order placement
     */
    function attackPlaceOrder() external {
        attacking = true;
        // This would trigger the reentrancy guard
        orderBook.placeLimitOrder(true, 1000 * 1e18, 1 * 1e18);
    }

    /**
     * @notice Attempt reentrancy attack on order cancellation
     * @param orderId Order to cancel
     */
    function attackCancelOrder(uint256 orderId) external {
        attacking = true;
        orderBook.cancelOrder(orderId);
    }

    /**
     * @notice Receive hook that attempts reentrancy
     */
    receive() external payable {
        if (attacking) {
            attacking = false;
            // Attempt to re-enter
            orderBook.placeLimitOrder(true, 1000 * 1e18, 1 * 1e18);
        }
    }
}