/**
 * Storage API Routes for Unified Validator DEX
 * 
 * Handles IPFS storage operations including:
 * - File upload and storage
 * - File retrieval
 * - Storage management
 */

import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { logger } from '../utils/logger';

/**
 * IPFS file metadata
 */
interface FileMetadata {
  /** IPFS content hash */
  hash: string;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** MIME content type */
  contentType: string;
  /** Uploader user ID */
  uploadedBy: string;
  /** Upload timestamp */
  uploadedAt: number;
  /** IPFS pin status */
  pinStatus: string;
}

/**
 * IPFS storage network health status
 */
interface StorageHealthStatus {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Number of connected IPFS peers */
  connectedPeers: number;
  /** Total storage capacity in bytes */
  totalStorage: number;
  /** Used storage in bytes */
  usedStorage: number;
  /** Number of pinned files */
  pinnedFiles: number;
  /** Last error message */
  lastError?: string;
}

/**
 * IPFS storage network interface
 */
interface IPFSStorageNetwork {
  storeData(buffer: Buffer, filename: string, contentType: string, userId: string): Promise<StorageResult>;
  retrieveData(hash: string): Promise<RetrievalResult>;
  getFileMetadata(hash: string): Promise<FileMetadata | null>;
  getHealthStatus(): Promise<StorageHealthStatus>;
}

/**
 * Result of file storage operation
 */
interface StorageResult {
  /** Whether storage was successful */
  success: boolean;
  /** IPFS content hash */
  hash?: string;
  /** File size in bytes */
  size?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of file retrieval operation
 */
interface RetrievalResult {
  /** Whether retrieval was successful */
  success: boolean;
  /** File data */
  data?: Buffer;
  /** MIME content type */
  contentType?: string;
  /** Error message if failed */
  error?: string;
}
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow common file types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/json'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

/**
 * Create storage API routes for the unified validator DEX
 * Handles IPFS file storage and retrieval operations
 * @param storage - IPFS storage network implementation
 * @returns Express router with storage endpoints
 * @example
 * ```typescript
 * const router = createStorageRoutes(storageNetwork);
 * app.use('/api/v1/storage', router);
 * ```
 */
export function createStorageRoutes(storage: IPFSStorageNetwork): Router {
  const router = Router();

  /**
   * Upload file to IPFS
   * POST /api/v1/storage/upload
   */
  router.post('/upload',
    upload.single('file'),
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          if (req.file === null || req.file === undefined) {
            res.status(400).json({
              error: 'No file provided'
            });
            return;
          }

        const userId = req.headers['x-user-id'] as string;
        const result = await storage.storeData(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          userId
        );

          if (result.success) {
            res.status(201).json({
              success: true,
              hash: result.hash,
              size: result.size,
              filename: req.file.originalname,
              contentType: req.file.mimetype
            });
          } else {
            res.status(500).json({
              error: 'Failed to store file',
              message: result.error
            });
          }
        } catch (error) {
          logger.error('Error uploading file:', error);
          res.status(500).json({
            error: 'Failed to upload file',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error uploading file:', error);
        res.status(500).json({
          error: 'Failed to upload file',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Retrieve file from IPFS
   * GET /api/v1/storage/file/:hash
   */
  router.get('/file/:hash',
    [param('hash').isString().notEmpty()],
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const errors = validationResult(req);
          if (!errors.isEmpty()) {
            res.status(400).json({
              error: 'Validation failed',
              details: errors.array()
            });
            return;
          }

          const { hash } = req.params;
          if (hash === undefined || hash === '') {
            res.status(400).json({
              error: 'Hash parameter is required'
            });
            return;
          }
          
          const result = await storage.retrieveData(hash);

          if (result.success && result.data !== null && result.data !== undefined) {
            res.set('Content-Type', result.contentType ?? 'application/octet-stream');
            res.send(result.data);
          } else {
            res.status(404).json({
              error: 'File not found',
              message: result.error
            });
          }

        } catch (error) {
          logger.error('Error retrieving file:', error);
          res.status(500).json({
            error: 'Failed to retrieve file',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error retrieving file:', error);
        res.status(500).json({
          error: 'Failed to retrieve file',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get file metadata
   * GET /api/v1/storage/metadata/:hash
   */
  router.get('/metadata/:hash',
    [param('hash').isString().notEmpty()],
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const { hash } = req.params;
          if (hash === undefined || hash === '') {
            res.status(400).json({
              error: 'Hash parameter is required'
            });
            return;
          }
          
          const metadata = await storage.getFileMetadata(hash);

          if (metadata !== null && metadata !== undefined) {
            res.json(metadata);
          } else {
            res.status(404).json({
              error: 'File metadata not found'
            });
          }

        } catch (error) {
          logger.error('Error getting file metadata:', error);
          res.status(500).json({
            error: 'Failed to get file metadata',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error getting file metadata:', error);
        res.status(500).json({
          error: 'Failed to get file metadata',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get storage health status
   * GET /api/v1/storage/health
   */
  router.get('/health', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const health = await storage.getHealthStatus();
        res.json(health);
      } catch (error) {
        logger.error('Error getting storage health:', error);
        res.status(500).json({
          error: 'Failed to get storage health',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }).catch((error) => {
      logger.error('Error getting storage health:', error);
      res.status(500).json({
        error: 'Failed to get storage health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  return router;
}