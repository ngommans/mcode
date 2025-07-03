/**
 * Logging utility
 */

import type { LogLevel, LogEntry } from '@minimal-terminal-client/shared';

class Logger {
  private logLevel: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
    return levels[level] <= levels[this.logLevel];
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
    };

    const output = process.env.NODE_ENV === 'production' 
      ? JSON.stringify(entry)
      : `[${entry.timestamp}] ${level.toUpperCase()}: ${message}${context ? ` ${JSON.stringify(context)}` : ''}${error ? ` ${error.stack}` : ''}`;

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  error(message: string, error?: Error | Record<string, any>): void {
    if (error instanceof Error) {
      this.log('error', message, undefined, error);
    } else {
      this.log('error', message, error);
    }
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);