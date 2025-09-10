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

// Import the actual GatewayOmniValidator type
type GatewayOmniValidator = {
  getHealthStatus(): Promise<Record<string, unknown>>;
  getResourceUsage(): Promise<ResourceUsage>;
  getMetrics(): Promise<{
    chainId?: string;
    networkId?: string;
    nodeId?: string;
    peersConnected?: number;
    lastProcessedBlock?: number;
    validatorCount?: number;
    consensusStatus?: string;
  }>;
};

/**
 * Create validator API routes
 * @param validatorNode - Gateway validator node instance
 * @returns Express router with validator endpoints
 */
export function createValidatorRoutes(validatorNode: GatewayOmniValidator): Router {
  const router = Router();

  /**
   * Get validator status
   * GET /api/v1/validator/status
   */
  router.get('/status', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
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
    }).catch((error) => {
      logger.error('Error getting validator status:', error);
      res.status(500).json({
        error: 'Failed to get validator status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  /**
   * Get resource usage
   * GET /api/v1/validator/resources
   */
  router.get('/resources', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
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
    }).catch((error) => {
      logger.error('Error getting resource usage:', error);
      res.status(500).json({
        error: 'Failed to get resource usage',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  /**
   * Get validator network information
   * GET /api/v1/validator/network
   */
  router.get('/network', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const metrics = await validatorNode.getMetrics();
        // Extract network-related metrics
        const networkInfo: NetworkInfo = {
          chainId: metrics.chainId || '43114',
          networkName: metrics.networkId || 'omnibazaar-mainnet',
          nodeId: metrics.nodeId || 'node-1',
          totalPeers: metrics.peersConnected || 0,
          blockHeight: metrics.lastProcessedBlock || 0,
          validatorCount: metrics.validatorCount || 1,
          consensusStatus: metrics.consensusStatus || 'active'
        };
        res.json(networkInfo);
      } catch (error) {
        logger.error('Error getting network information:', error);
        res.status(500).json({
          error: 'Failed to get network information',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }).catch((error) => {
      logger.error('Error getting network information:', error);
      res.status(500).json({
        error: 'Failed to get network information',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  /**
   * Get validator peers
   * GET /api/v1/validator/peers
   */
  router.get('/peers', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const metrics = await validatorNode.getMetrics();
        // Return peer count as we don't have detailed peer info
        const peers: ValidatorPeer[] = [];
        const peerCount = metrics.peersConnected || 0;
        
        // Return summary instead of detailed peer list
        res.json({ 
          totalPeers: peerCount,
          connectedPeers: peerCount,
          peers: peers,
          message: 'Detailed peer information not available in current implementation'
        });
      } catch (error) {
        logger.error('Error getting validator peers:', error);
        res.status(500).json({
          error: 'Failed to get validator peers',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }).catch((error) => {
      logger.error('Error getting validator peers:', error);
      res.status(500).json({
        error: 'Failed to get validator peers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  /**
   * Get validator health
   * GET /api/v1/validator/health
   */
  router.get('/health', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
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
    }).catch((error) => {
      logger.error('Error getting validator health:', error);
      res.status(500).json({
        error: 'Failed to get validator health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  return router;
}