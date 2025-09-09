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
import { logger } from '../utils/logger';

/**
 * Chat message structure
 */
interface ChatMessage {
  /** Message content */
  content: string;
  /** Channel identifier */
  channelId: string;
  /** Type of message */
  messageType: 'text' | 'image' | 'file';
  /** User identifier */
  userId: string;
  /** Message timestamp */
  timestamp: number;
}

/**
 * Stored chat message with ID
 */
interface StoredMessage extends ChatMessage {
  /** Unique message identifier */
  messageId: string;
}

/**
 * Result of message sending operation
 */
interface MessageResult {
  /** Whether message was sent successfully */
  success: boolean;
  /** Generated message ID */
  messageId: string;
  /** Send timestamp */
  timestamp: number;
}

/**
 * Chat network health status
 */
interface ChatHealthStatus {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Number of active connections */
  activeConnections: number;
  /** Size of message queue */
  messageQueueSize: number;
  /** Service uptime in seconds */
  uptime: number;
  /** Last error message */
  lastError?: string;
}

/**
 * P2P chat network interface
 */
interface P2PChatNetwork {
  sendMessage(message: ChatMessage): Promise<MessageResult>;
  getMessages(channelId: string, limit: number, offset: number): Promise<StoredMessage[]>;
  getHealthStatus(): Promise<ChatHealthStatus>;
}

/**
 * Request body for sending messages
 */
interface SendMessageBody {
  content?: unknown;
  channelId?: unknown;
  messageType?: unknown;
}

/**
 * Create chat API routes for the unified validator DEX
 * Handles P2P messaging and communication
 * @param chat - P2P chat network implementation
 * @returns Express router with chat endpoints
 * @example
 * ```typescript
 * const router = createChatRoutes(chatNetwork);
 * app.use('/api/v1/chat', router);
 * ```
 */
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

          const body = req.body as SendMessageBody;
          const userIdHeader = req.headers['x-user-id'] as string | undefined;
          
          const message: ChatMessage = {
            content: body.content as string,
            channelId: body.channelId as string,
            messageType: (body.messageType as 'text' | 'image' | 'file' | undefined) ?? 'text',
            userId: (userIdHeader !== undefined && userIdHeader !== '') ? userIdHeader : 'anonymous',
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
      }).catch((error) => {
        logger.error('Error sending message:', error);
        res.status(500).json({
          error: 'Failed to send message',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
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
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const { channelId } = req.params;
          const limitParam = req.query['limit'] as string;
          const offsetParam = req.query['offset'] as string;
          const limit = (limitParam !== undefined && parseInt(limitParam) > 0) ? parseInt(limitParam) : 50;
          const offset = (offsetParam !== undefined && parseInt(offsetParam) >= 0) ? parseInt(offsetParam) : 0;

          if (channelId === undefined || channelId === '') {
            res.status(400).json({
              error: 'Channel ID is required'
            });
            return;
          }

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
      }).catch((error) => {
        logger.error('Error getting messages:', error);
        res.status(500).json({
          error: 'Failed to get messages',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get chat health status
   * GET /api/v1/chat/health
   */
  router.get('/health', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
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
    }).catch((error) => {
      logger.error('Error getting chat health:', error);
      res.status(500).json({
        error: 'Failed to get chat health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  return router;
}