/**
 * Trace Listener Service - Optional debug trace collection
 * Captures 80% of current logging information without cluttering main application
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { logger } from '../utils/logger';
import { TraceLevel } from '@microsoft/dev-tunnels-ssh';

export interface TraceMessage {
  timestamp: Date;
  level: string | number;
  eventId: string | number;
  message: string;
  error?: Error;
  category: 'port_forwarding' | 'connection' | 'auth' | 'general';
  parsedData?: Record<string, unknown>;
}

export interface PortForwardingTrace extends TraceMessage {
  category: 'port_forwarding';
  parsedData: {
    localPort?: number;
    remotePort?: number;
    direction?: 'forward' | 'reverse';
    protocol?: string;
  };
}

export interface TraceListenerOptions {
  enablePortParsing?: boolean;
  enableConnectionLogging?: boolean;
  enableAuthLogging?: boolean;
  logLevel?: 'all' | 'errors' | 'warnings' | 'info';
  maxTraceHistory?: number;
}

/**
 * Optional trace listener that can be attached to tunnel clients for debugging
 * Separates trace/debug logic from main application flow
 */
export class TraceListenerService {
  private traces: TraceMessage[] = [];
  private options: Required<TraceListenerOptions>;
  private originalTraceFunctions = new WeakMap<TunnelRelayTunnelClient, (level: TraceLevel, eventId: number, msg: string, err?: Error) => void>();
  private attachedClients = new Set<TunnelRelayTunnelClient>();

  constructor(options: TraceListenerOptions = {}) {
    this.options = {
      enablePortParsing: true,
      enableConnectionLogging: true,
      enableAuthLogging: false, // Disabled by default for security
      logLevel: 'all',
      maxTraceHistory: 1000,
      ...options
    };
  }

  /**
   * Attach trace listener to a tunnel client
   */
  attachToClient(client: TunnelRelayTunnelClient): void {
    if (this.attachedClients.has(client)) {
      logger.warn('⚠️  Trace listener already attached to this client');
      return;
    }

    logger.info('🎧 Attaching trace listener to tunnel client...');

    // Store original trace function
    const originalTrace = client.trace;
    this.originalTraceFunctions.set(client, originalTrace);

    // Override trace function with our interceptor
    client.trace = (level: TraceLevel, eventId: number, msg: string, err?: Error)=> {
      // Call original trace first
      if (originalTrace && typeof originalTrace === 'function') {
        originalTrace.call(client, level, eventId, msg, err);
      }

      // Process with our trace listener
      this.processTraceMessage(level, eventId, msg, err);
    };

    this.attachedClients.add(client);
    logger.info('✅ Trace listener attached successfully');
  }

  /**
   * Detach trace listener from a tunnel client
   */
  detachFromClient(client: TunnelRelayTunnelClient): void {
    if (!this.attachedClients.has(client)) {
      logger.warn('⚠️  Trace listener not attached to this client');
      return;
    }

    logger.info('🔌 Detaching trace listener from tunnel client...');

    // Restore original trace function
    const originalTrace = this.originalTraceFunctions.get(client);
    if (originalTrace && typeof originalTrace === 'function') {
      client.trace = originalTrace;
      this.originalTraceFunctions.delete(client);
    }

    this.attachedClients.delete(client);
    logger.info('✅ Trace listener detached successfully');
  }

  /**
   * Process incoming trace message
   */
  private processTraceMessage(level: TraceLevel, eventId: number, msg: string, err?: Error): void {
    try {
      const messageStr = typeof msg === 'string' ? msg : String(msg);
      
      // Determine message category and parse relevant data
      const traceMessage = this.categorizeAndParseMessage(level, eventId, messageStr, err);
      
      // Apply log level filtering
      if (!this.shouldLogMessage(traceMessage)) {
        return;
      }

      // Add to trace history
      this.addToTraceHistory(traceMessage);

      // Optional: Log to console based on category
      this.logTraceMessage(traceMessage);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('⚠️  Error processing trace message:', new Error(errorMessage));
    }
  }

  /**
   * Categorize message and extract structured data
   */
  private categorizeAndParseMessage(level: TraceLevel, eventId: number, msg: string, err?: Error): TraceMessage {
    const timestamp = new Date();
    
    // Port forwarding messages
    if (this.options.enablePortParsing && this.isPortForwardingMessage(msg)) {
      return this.parsePortForwardingMessage(timestamp, level, eventId, msg, err);
    }

    // Connection messages
    if (this.options.enableConnectionLogging && this.isConnectionMessage(msg)) {
      return this.parseConnectionMessage(timestamp, level, eventId, msg, err);
    }

    // Auth messages
    if (this.options.enableAuthLogging && this.isAuthMessage(msg)) {
      return this.parseAuthMessage(timestamp, level, eventId, msg, err);
    }

    // General message
    return {
      timestamp,
      level,
      eventId,
      message: msg,
      error: err,
      category: 'general'
    };
  }

  /**
   * Parse port forwarding specific messages
   */
  private parsePortForwardingMessage(timestamp: Date, level: TraceLevel, eventId: number, msg: string, err?: Error): PortForwardingTrace {
    const parsedData: PortForwardingTrace['parsedData'] = {};

    // Pattern 1: "Forwarding from 127.0.0.1:XXXXX to host port YYYY" (with optional period)
    const forwardMatch = msg.match(/Forwarding from 127\.0\.0\.1:(\d+) to host port (\d+)\.?/);
    if (forwardMatch) {
      parsedData.localPort = parseInt(forwardMatch[1], 10);
      parsedData.remotePort = parseInt(forwardMatch[2], 10);
      parsedData.direction = 'forward';
    }

    // Pattern 1b: IPv6 forwarding "Forwarding from ::1:XXXXX to host port YYYY"
    if (!forwardMatch) {
      const ipv6ForwardMatch = msg.match(/Forwarding from ::1:(\d+) to host port (\d+)\.?/);
      if (ipv6ForwardMatch) {
        parsedData.localPort = parseInt(ipv6ForwardMatch[1], 10);
        parsedData.remotePort = parseInt(ipv6ForwardMatch[2], 10);
        parsedData.direction = 'forward';
        parsedData.protocol = 'ipv6';
      }
    }

    // Pattern 2: "Port forwarding established"
    const establishedMatch = msg.match(/Port (\d+) forwarding established/);
    if (establishedMatch) {
      parsedData.remotePort = parseInt(establishedMatch[1], 10);
    }

    // Pattern 3: "Listening on port XXXX"
    const listeningMatch = msg.match(/Listening on port (\d+)/);
    if (listeningMatch) {
      parsedData.localPort = parseInt(listeningMatch[1], 10);
      parsedData.direction = 'reverse';
    }

    // Pattern 4: Protocol detection
    if (msg.includes('ssh') || msg.includes('SSH')) {
      parsedData.protocol = 'ssh';
    } else if (msg.includes('http') || msg.includes('HTTP')) {
      parsedData.protocol = 'http';
    } else if (msg.includes('tcp') || msg.includes('TCP')) {
      parsedData.protocol = 'tcp';
    }

    return {
      timestamp,
      level,
      eventId,
      message: msg,
      error: err,
      category: 'port_forwarding',
      parsedData
    };
  }

  /**
   * Parse connection specific messages
   */
  private parseConnectionMessage(timestamp: Date, level: TraceLevel, eventId: number, msg: string, err?: Error): TraceMessage {
    const parsedData: Record<string, unknown> = {};

    // Connection state changes
    if (msg.includes('Connected') || msg.includes('connected')) {
      parsedData.state = 'connected';
    } else if (msg.includes('Disconnected') || msg.includes('disconnected')) {
      parsedData.state = 'disconnected';
    } else if (msg.includes('Connecting') || msg.includes('connecting')) {
      parsedData.state = 'connecting';
    }

    // Tunnel information
    const tunnelIdMatch = msg.match(/tunnel[:\s]+([a-zA-Z0-9-]+)/i);
    if (tunnelIdMatch) {
      parsedData.tunnelId = tunnelIdMatch[1];
    }

    return {
      timestamp,
      level,
      eventId,
      message: msg,
      error: err,
      category: 'connection',
      parsedData
    };
  }

  /**
   * Parse auth specific messages (careful with sensitive data)
   */
  private parseAuthMessage(timestamp: Date, level: TraceLevel, eventId: number, msg: string, err?: Error): TraceMessage {
    const parsedData: Record<string, unknown> = {};

    // Auth state (without exposing tokens)
    if (msg.includes('authenticated') || msg.includes('Authenticated')) {
      parsedData.authState = 'authenticated';
    } else if (msg.includes('authorization') || msg.includes('Authorization')) {
      parsedData.authState = 'authorizing';
    }

    // Remove any potential tokens from the message
    const sanitizedMessage = this.sanitizeAuthMessage(msg);

    return {
      timestamp,
      level,
      eventId,
      message: sanitizedMessage,
      error: err,
      category: 'auth',
      parsedData
    };
  }

  /**
   * Check if message is port forwarding related
   */
  private isPortForwardingMessage(msg: string): boolean {
    const portKeywords = [
      'forwarding', 'forward', 'port', 'listening', 'bind', 'tunnel port',
      'remote port', 'local port', '127.0.0.1:', 'localhost:'
    ];
    
    const lowerMsg = msg.toLowerCase();
    return portKeywords.some(keyword => lowerMsg.includes(keyword));
  }

  /**
   * Check if message is connection related
   */
  private isConnectionMessage(msg: string): boolean {
    const connectionKeywords = [
      'connect', 'disconnect', 'tunnel', 'session', 'channel', 'stream',
      'socket', 'connection', 'handshake', 'established', 'closed'
    ];
    
    const lowerMsg = msg.toLowerCase();
    return connectionKeywords.some(keyword => lowerMsg.includes(keyword));
  }

  /**
   * Check if message is auth related
   */
  private isAuthMessage(msg: string): boolean {
    const authKeywords = [
      'auth', 'token', 'credential', 'permission', 'access', 'bearer',
      'authorization', 'authenticated', 'login', 'oauth'
    ];
    
    const lowerMsg = msg.toLowerCase();
    return authKeywords.some(keyword => lowerMsg.includes(keyword));
  }

  /**
   * Remove potential sensitive data from auth messages
   */
  private sanitizeAuthMessage(msg: string): string {
    // Remove potential tokens (anything that looks like base64 or JWT)
    return msg
      .replace(/Bearer\s+[A-Za-z0-9+/=]{20,}/gi, 'Bearer [REDACTED]')
      .replace(/token[:\s]+[A-Za-z0-9+/=]{20,}/gi, 'token: [REDACTED]')
      .replace(/[A-Za-z0-9+/=]{50,}/g, '[REDACTED_TOKEN]');
  }

  /**
   * Check if message should be logged based on level filtering
   */
  private shouldLogMessage(traceMessage: TraceMessage): boolean {
    if (this.options.logLevel === 'all') {
      return true;
    }

    // Simple level filtering (would need proper level comparison for production)
    const levelStr = String(traceMessage.level).toLowerCase();
    
    switch (this.options.logLevel) {
      case 'errors':
        return levelStr.includes('error') || !!traceMessage.error;
      case 'warnings':
        return levelStr.includes('error') || levelStr.includes('warn') || !!traceMessage.error;
      case 'info':
        return !levelStr.includes('debug') && !levelStr.includes('trace');
      default:
        return true;
    }
  }

  /**
   * Add message to trace history with size management
   */
  private addToTraceHistory(traceMessage: TraceMessage): void {
    this.traces.push(traceMessage);
    
    // Maintain max history size
    if (this.traces.length > this.options.maxTraceHistory) {
      this.traces.splice(0, this.traces.length - this.options.maxTraceHistory);
    }
  }

  /**
   * Log trace message to console (optional debug output)
   */
  private logTraceMessage(traceMessage: TraceMessage): void {
    // Only log to console in debug mode or for important messages
    if (traceMessage.error || traceMessage.level === 'error') {
      logger.error(`🔴 [${traceMessage.category}] ${traceMessage.message}`, traceMessage.error);
    } else if (traceMessage.category === 'port_forwarding') {
      logger.info(`🔌 [PORT] ${traceMessage.message}`);
    }
    // Other categories are captured but not logged to reduce noise
  }

  /**
   * Get all traces for a specific category
   */
  getTracesByCategory(category: TraceMessage['category']): TraceMessage[] {
    return this.traces.filter(trace => trace.category === category);
  }

  /**
   * Get port forwarding traces with parsed data
   */
  getPortForwardingTraces(): PortForwardingTrace[] {
    return this.traces.filter(trace => trace.category === 'port_forwarding') as PortForwardingTrace[];
  }

  /**
   * Extract port mappings from trace history (fallback method)
   */
  extractPortMappingsFromTraces(): Array<{ localPort: number; remotePort: number; protocol?: string }> {
    const portTraces = this.getPortForwardingTraces();
    const mappings: Array<{ localPort: number; remotePort: number; protocol?: string }> = [];
    
    for (const trace of portTraces) {
      if (trace.parsedData.localPort && trace.parsedData.remotePort) {
        // Check if we already have this mapping
        const exists = mappings.find(m => 
          m.localPort === trace.parsedData.localPort && 
          m.remotePort === trace.parsedData.remotePort
        );
        
        if (!exists) {
          mappings.push({
            localPort: trace.parsedData.localPort ?? 0,
            remotePort: trace.parsedData.remotePort ?? 0,
            protocol: trace.parsedData.protocol
          });
        }
      }
    }
    
    return mappings;
  }

  /**
   * Get recent traces (last N messages)
   */
  getRecentTraces(count = 50): TraceMessage[] {
    return this.traces.slice(-count);
  }

  /**
   * Clear trace history
   */
  clearTraces(): void {
    this.traces = [];
    logger.info('🗑️  Trace history cleared');
  }

  /**
   * Get trace statistics
   */
  getTraceStats(): Record<string, number> {
    const stats: Record<string, number> = {
      total: this.traces.length,
      port_forwarding: 0,
      connection: 0,
      auth: 0,
      general: 0,
      errors: 0
    };
    
    for (const trace of this.traces) {
      stats[trace.category]++;
      if (trace.error || String(trace.level).toLowerCase().includes('error')) {
        stats.errors++;
      }
    }
    
    return stats;
  }

  /**
   * Export traces as JSON for debugging
   */
  exportTraces(): string {
    return JSON.stringify({
      exported: new Date().toISOString(),
      options: this.options,
      stats: this.getTraceStats(),
      traces: this.traces
    }, null, 2);
  }

  /**
   * Detach from all clients (cleanup)
   */
  detachFromAllClients(): void {
    for (const client of this.attachedClients) {
      this.detachFromClient(client);
    }
    logger.info('🧹 Detached trace listener from all clients');
  }
}

export default TraceListenerService;