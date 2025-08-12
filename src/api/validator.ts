/**
 * Validator API Routes for Unified Validator DEX
 * 
 * Handles validator operations including:
 * - Validator status and health
 * - Network information
 * - Resource monitoring
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

interface ValidatorHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  version: string;
  currentBlock: number;
  syncStatus: 'synced' | 'syncing' | 'behind';
  lastError?: string;
}

interface ResourceUsage {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    usage: number;
  };
  disk: {
    used: number;
    total: number;
    usage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connections: number;
  };
}

interface NetworkInfo {
  chainId: string;
  networkName: string;
  nodeId: string;
  totalPeers: number;
  blockHeight: number;
  validatorCount: number;
  consensusStatus: string;
}

interface ValidatorPeer {
  id: string;
  address: string;
  isValidator: boolean;
  lastSeen: number;
  blockHeight: number;
  status: 'connected' | 'disconnected' | 'syncing';
}

// TODO: Replace with actual UnifiedValidatorNode implementation
interface UnifiedValidatorNode {
  getHealthStatus(): Promise<ValidatorHealthStatus>;
  getResourceUsage(): Promise<ResourceUsage>;
  getNetworkInfo(): Promise<NetworkInfo>;
  getPeers(): Promise<ValidatorPeer[]>;
}

export function createValidatorRoutes(validatorNode: UnifiedValidatorNode): Router {
  const router = Router();

  /**
   * Get validator status
   * GET /api/v1/validator/status
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await validatorNode.getHealthStatus();
      return res.json(status);
    } catch (error) {
      logger.error('Error getting validator status:', error);
      return res.status(500).json({
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
      return res.json(resources);
    } catch (error) {
      logger.error('Error getting resource usage:', error);
      return res.status(500).json({
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
      return res.json(networkInfo);
    } catch (error) {
      logger.error('Error getting network information:', error);
      return res.status(500).json({
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
      return res.json({ peers });
    } catch (error) {
      logger.error('Error getting validator peers:', error);
      return res.status(500).json({
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
      return res.json(health);
    } catch (error) {
      logger.error('Error getting validator health:', error);
      return res.status(500).json({
        error: 'Failed to get validator health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}