/**
 * Structured logging utility for Cloudflare Workers
 */

export interface LogContext {
  [key: string]: unknown;
}

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  private log(level: string, message: string, data?: LogContext) {
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...data,
    };

    console.log(JSON.stringify(logEntry));
  }

  info(message: string, data?: LogContext) {
    this.log('info', message, data);
  }

  error(message: string, error?: Error | unknown, data?: LogContext) {
    const errorData: LogContext = {
      ...data,
    };

    if (error instanceof Error) {
      errorData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    } else if (error) {
      errorData.error = error;
    }

    this.log('error', message, errorData);
  }

  warn(message: string, data?: LogContext) {
    this.log('warn', message, data);
  }

  debug(message: string, data?: LogContext) {
    this.log('debug', message, data);
  }

  withContext(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context });
  }
}

export const logger = new Logger();
