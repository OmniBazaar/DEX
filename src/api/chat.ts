/**
 * Chat API Routes for Unified Validator DEX
 * 
 * Handles chat operations including:
 * - Message sending and receiving
 * - Channel management
 * - User presence
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { P2PChatNetwork } from '../../../Validator/src/services/chat/P2PChatNetwork';
import { logger } from '../../../Validator/src/utils/Logger';

export function createChatRoutes(chat: P2PChatNetwork): Router {
  const router = Router();

  /**
   * Send a message
   * POST /api/v1/chat/messages
   */
  router.post('/messages',
    [
      body('content').isString().notEmpty(),
      body('channelId').isString().notEmpty(),
      body('messageType').optional().isIn(['text', 'image', 'file'])
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const message = {
          content: req.body.content,
          channelId: req.body.channelId,
          messageType: req.body.messageType || 'text',
          userId: req.headers['x-user-id'] as string,
          timestamp: Date.now()
        };

        const result = await chat.sendMessage(message);

        res.status(201).json({
          success: result.success,
          messageId: result.messageId,
          timestamp: result.timestamp
        });

      } catch (error) {
        logger.error('Error sending message:', error);
        res.status(500).json({
          error: 'Failed to send message',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get messages for a channel
   * GET /api/v1/chat/messages/:channelId
   */
  router.get('/messages/:channelId',
    [
      param('channelId').isString().notEmpty(),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
      query('offset').optional().isInt({ min: 0 }).toInt()
    ],
    async (req: Request, res: Response) => {
      try {
        const { channelId } = req.params;
        const limit = (req.query.limit as number) || 50;
        const offset = (req.query.offset as number) || 0;

        const messages = await chat.getMessages(channelId, limit, offset);

        res.json({
          channelId,
          messages,
          limit,
          offset
        });

      } catch (error) {
        logger.error('Error getting messages:', error);
        res.status(500).json({
          error: 'Failed to get messages',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get chat health status
   * GET /api/v1/chat/health
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const health = await chat.getHealthStatus();
      res.json(health);
    } catch (error) {
      logger.error('Error getting chat health:', error);
      res.status(500).json({
        error: 'Failed to get chat health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}