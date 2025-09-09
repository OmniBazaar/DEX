/**
 * Authentication middleware for DEX API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { ethers } from 'ethers';

/**
 * JWT payload structure
 */
interface JWTPayload {
  userId: string;
  walletAddress: string;
  iat?: number;
  exp?: number;
}

/**
 * Extended request interface with user authentication
 */
export interface AuthRequest extends Request {
  /** Authenticated user ID */
  userId?: string;
  /** User's wallet address */
  walletAddress?: string;
}

// Get JWT secret from environment or use secure default for development
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'omnibazaar-dex-secret-key-change-in-production';

/**
 * Authentication middleware
 * Validates JWT tokens for secure access
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  if (typeof authHeader !== 'string' || authHeader.length === 0) {
    res.status(401).json({ error: 'No authorization header' });
    return;
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    if (token.length === 0) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      // Validate wallet address format
      if (!ethers.isAddress(decoded.walletAddress)) {
        res.status(401).json({ error: 'Invalid wallet address in token' });
        return;
      }
      
      // Set user info on request
      req.userId = decoded.userId;
      req.walletAddress = decoded.walletAddress;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Token expired' });
      } else if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid token' });
      } else {
        res.status(401).json({ error: 'Authentication failed' });
      }
    }
  } else {
    res.status(401).json({ error: 'Invalid authorization format' });
  }
};

/**
 * Generate JWT token for authenticated user
 * @param userId - User identifier
 * @param walletAddress - User's wallet address
 * @returns Signed JWT token
 */
export const generateToken = (userId: string, walletAddress: string): string => {
  const payload: JWTPayload = {
    userId,
    walletAddress
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '24h' // Token expires in 24 hours
  });
};

/**
 * Optional authentication middleware
 * Allows unauthenticated access but adds user info if available
 * @param req - Express request with optional user info
 * @param _res - Express response (unused)
 * @param next - Next middleware function
 */
export const optionalAuth = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token.length > 0) {
      try {
        // Try to verify JWT token
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        
        // Validate wallet address format
        if (ethers.isAddress(decoded.walletAddress)) {
          req.userId = decoded.userId;
          req.walletAddress = decoded.walletAddress;
        }
      } catch {
        // Ignore errors - this is optional auth
        // User will proceed without authentication
      }
    }
  }
  
  next();
};