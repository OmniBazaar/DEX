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
import { IPFSStorageNetwork } from '../../../Validator/src/services/storage/IPFSStorageNetwork';
import { logger } from '../../../Validator/src/utils/Logger';
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
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

export function createStorageRoutes(storage: IPFSStorageNetwork): Router {
  const router = Router();

  /**
   * Upload file to IPFS
   * POST /api/v1/storage/upload
   */
  router.post('/upload',
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            error: 'No file provided'
          });
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
    }
  );

  /**
   * Retrieve file from IPFS
   * GET /api/v1/storage/file/:hash
   */
  router.get('/file/:hash',
    [param('hash').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const { hash } = req.params;
        const result = await storage.retrieveData(hash);

        if (result.success && result.data) {
          res.set('Content-Type', result.contentType || 'application/octet-stream');
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
    }
  );

  /**
   * Get file metadata
   * GET /api/v1/storage/metadata/:hash
   */
  router.get('/metadata/:hash',
    [param('hash').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const { hash } = req.params;
        const metadata = await storage.getFileMetadata(hash);

        if (metadata) {
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
    }
  );

  /**
   * Get storage health status
   * GET /api/v1/storage/health
   */
  router.get('/health', async (_req: Request, res: Response) => {
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
  });

  return router;
}