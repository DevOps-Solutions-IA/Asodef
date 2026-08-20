import { Injectable, LoggerService } from "@nestjs/common";
import { redactObject, redactString } from "./redact";

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: unknown;
  trace?: string;
}

/**
 * Structured JSON logs in production (one line per entry, ready for log
 * aggregation); human-readable colored-ish plain text in development.
 * Every message/argument is passed through redact.ts first, so a leaked
 * connection string or token never reaches stdout regardless of caller.
 */
@Injectable()
export class AppLogger implements LoggerService {
  constructor(private readonly isProduction: boolean = process.env.NODE_ENV === "production") {}

  log(message: unknown, context?: string): void {
    this.write("log", message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write("error", message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write("verbose", message, context);
  }

  private write(level: string, message: unknown, context?: string, trace?: string): void {
    const safeMessage = typeof message === "string" ? redactString(message) : redactObject(message);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? "Application",
      message: safeMessage,
    };

    // Stack traces are useful for local debugging but are never emitted in
    // production log lines, and are never part of any HTTP response. Even
    // locally the trace is redacted because driver errors may embed a DSN.
    if (trace && !this.isProduction) {
      entry.trace = redactString(trace);
    }

    if (this.isProduction) {
      console.log(JSON.stringify(entry));
      return;
    }

    const messageText = typeof safeMessage === "string" ? safeMessage : JSON.stringify(safeMessage);
    console.log(`[${entry.timestamp}] ${level.toUpperCase().padEnd(7)} [${entry.context}] ${messageText}`);
    if (entry.trace) {
      console.log(entry.trace);
    }
  }
}
