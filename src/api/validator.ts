/**
 * Validator API Routes for Unified Validator DEX
 * 
 * Handles validator operations including:
 * - Validator status and health
 * - Network information
 * - Resource monitoring
 */

import { Router, Request, Response } from 'express';
import { UnifiedValidatorNode } from '../../../Validator/src/UnifiedValidatorNode';
import { logger } from '../../../Validator/src/utils/Logger';

export function createValidatorRoutes(validatorNode: UnifiedValidatorNode): Router {
  const router = Router();

  /**
   * Get validator status
   * GET /api/v1/validator/status
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await validatorNode.getHealthStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error getting validator status:', error);
      res.status(500).json({
        error: 'Failed to get validator status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get resource usage
   * GET /api/v1/validator/resources
   */
  router.get('/resources', async (_req: Request, res: Response) => {
    try {
      const resources = await validatorNode.getResourceUsage();
      res.json(resources);
    } catch (error) {
      logger.error('Error getting resource usage:', error);
      res.status(500).json({
        error: 'Failed to get resource usage',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get validator network information
   * GET /api/v1/validator/network
   */
  router.get('/network', async (_req: Request, res: Response) => {
    try {
      const networkInfo = await validatorNode.getNetworkInfo();
      res.json(networkInfo);
    } catch (error) {
      logger.error('Error getting network information:', error);
      res.status(500).json({
        error: 'Failed to get network information',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get validator peers
   * GET /api/v1/validator/peers
   */
  router.get('/peers', async (_req: Request, res: Response) => {
    try {
      const peers = await validatorNode.getPeers();
      res.json({ peers });
    } catch (error) {
      logger.error('Error getting validator peers:', error);
      res.status(500).json({
        error: 'Failed to get validator peers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get validator health
   * GET /api/v1/validator/health
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const health = await validatorNode.getHealthStatus();
      res.json(health);
    } catch (error) {
      logger.error('Error getting validator health:', error);
      res.status(500).json({
        error: 'Failed to get validator health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}