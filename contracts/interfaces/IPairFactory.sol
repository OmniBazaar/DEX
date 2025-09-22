// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPairFactory
 * @notice Interface for the trading pair factory contract
 * @dev Factory pattern for deploying new trading pair contracts
 */
interface IPairFactory {
    /**
     * @notice Deploy a new trading pair contract
     * @param tokenA First token in the pair
     * @param tokenB Second token in the pair
     * @param registry Address of the DEX registry
     * @return pair Address of the newly created pair contract
     */
    function createPair(
        address tokenA,
        address tokenB,
        address registry
    ) external returns (address pair);

    /**
     * @notice Get the address of a pair without deploying
     * @param tokenA First token in the pair
     * @param tokenB Second token in the pair
     * @return pair Address where the pair would be deployed
     */
    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair);

    /**
     * @notice Check if a pair exists
     * @param tokenA First token in the pair
     * @param tokenB Second token in the pair
     * @return exists True if the pair has been deployed
     */
    function pairExists(
        address tokenA,
        address tokenB
    ) external view returns (bool exists);

    /**
     * @notice Get all deployed pairs
     * @return pairs Array of all pair addresses
     */
    function getAllPairs() external view returns (address[] memory pairs);

    /**
     * @notice Get the number of deployed pairs
     * @return count Number of pairs
     */
    function getPairCount() external view returns (uint256 count);
}