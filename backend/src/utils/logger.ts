// Estate Standard - Winston Logger Configuration
// Comprehensive logging with rotation and structured format

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

// Tell winston about our colors
winston.addColors(colors);

// Define format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Development format (more readable)
const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define which transports to use
const transports: winston.transport[] = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? format : devFormat
  })
);

// File transports (production only)
if (process.env.NODE_ENV === 'production') {
  // Error logs (separate file)
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format
    })
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format
    })
  );

  // HTTP logs
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxSize: '20m',
      maxFiles: '14d',
      format
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  levels,
  format,
  transports,
  exitOnError: false
});

// Morgan stream for HTTP logging
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  }
};

// Helper functions for structured logging
export const logError = (message: string, error: Error, context?: any) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    ...context
  });
};

export const logWarning = (message: string, context?: any) => {
  logger.warn(message, context);
};

export const logInfo = (message: string, context?: any) => {
  logger.info(message, context);
};

export const logDebug = (message: string, context?: any) => {
  logger.debug(message, context);
};

// Security event logging
export const logSecurityEvent = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: any
) => {
  logger.warn(`[SECURITY] ${event}`, {
    severity,
    timestamp: new Date().toISOString(),
    ...details
  });
};

export default logger;
