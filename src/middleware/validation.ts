/**
 * Request validation middleware for DEX API endpoints
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Validation error details
 */
interface ValidationError {
  /** Field that failed validation */
  field: string;
  /** Error message */
  message: string;
  /** Invalid value provided */
  value?: unknown;
}

/**
 * Validates that required fields are present in request body
 * @param fields - Array of required field names
 * @returns Express middleware function
 */
export const validateRequired = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];
    
    for (const field of fields) {
      const body = req.body as Record<string, unknown>;
      if (!(field in body) || body[field] === undefined || body[field] === null || body[field] === '') {
        errors.push({
          field,
          message: `${field} is required`,
          value: body[field]
        });
      }
    }
    
    if (errors.length > 0) {
      res.status(400).json({
        error: 'Validation failed',
        errors
      });
      return;
    }
    
    next();
  };
};

/**
 * Validates numeric fields are valid numbers
 * @param fields - Array of numeric field names
 * @returns Express middleware function
 */
export const validateNumeric = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];
    
    for (const field of fields) {
      const body = req.body as Record<string, unknown>;
      if (field in body && body[field] !== undefined) {
        const fieldValue = body[field];
        const value = Number(fieldValue);
        if (isNaN(value)) {
          errors.push({
            field,
            message: `${field} must be a valid number`,
            value: fieldValue
          });
        }
      }
    }
    
    if (errors.length > 0) {
      res.status(400).json({
        error: 'Validation failed',
        errors
      });
      return;
    }
    
    next();
  };
};

/**
 * Validates enum fields have allowed values
 * @param field - Field name to validate
 * @param allowedValues - Array of allowed values
 * @returns Express middleware function
 */
export const validateEnum = (field: string, allowedValues: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body as Record<string, unknown>;
    if (field in body && body[field] !== undefined && body[field] !== null && body[field] !== '') {
      const fieldValue = String(body[field]);
      if (!allowedValues.includes(fieldValue)) {
        res.status(400).json({
          error: 'Validation failed',
          errors: [{
            field,
            message: `${field} must be one of: ${allowedValues.join(', ')}`,
            value: fieldValue
          }]
        });
        return;
      }
    }
    
    next();
  };
};

/**
 * Validates leverage is within acceptable range
 * @param maxLeverage - Maximum allowed leverage
 * @returns Express middleware function
 */
export const validateLeverage = (maxLeverage: number = 100) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body as Record<string, unknown>;
    if ('leverage' in body && body.leverage !== undefined && body.leverage !== null && body.leverage !== '') {
      const leverageValue = body.leverage;
      const leverage = Number(leverageValue);
      if (leverage < 1 || leverage > maxLeverage) {
        res.status(400).json({
          error: 'Validation failed',
          errors: [{
            field: 'leverage',
            message: `Leverage must be between 1 and ${maxLeverage}`,
            value: leverageValue
          }]
        });
        return;
      }
    }
    
    next();
  };
};