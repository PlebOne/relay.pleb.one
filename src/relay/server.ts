import WS, { WebSocketServer } from "ws";
import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
import { nanoid } from "nanoid";
import { env } from "@/env";
import { db } from "@/server/db";
import { 
  Connection, 
  ServerMessage, 
  clientMessageSchema,
  nostrEventSchema,
  Filter,
  NostrEvent,
} from "./types";
import { nipRegistry } from "./nip-registry";

// Import and register all NIPs
import { NIP01 } from "./nips/nip01";
import { NIP09 } from "./nips/nip09";
import { NIP11 } from "./nips/nip11";

/**
 * Modular Nostr WebSocket Relay Server
 * 
 * This server is designed to be highly modular:
 * - NIPs are separate modules that can be easily added/removed
 * - Connection management is centralized
 * - Rate limiting and authentication are pluggable
 * - Easy to extend with new features
 */
export class NostrRelayServer {
  private wss: WebSocketServer;
  private server: ReturnType<typeof createServer>;
  private connections: Map<string, Connection> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Register all supported NIPs
    this.registerNIPs();
    
    // Create HTTP server for WebSocket upgrades and NIP-11
    this.server = createServer(this.handleHTTPRequest.bind(this));
    
    // Create WebSocket server
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: "/",
    });
    
    this.wss.on("connection", this.handleConnection.bind(this));
    
    // Cleanup inactive connections every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupConnections();
    }, 30000);
  }

  /**
   * Register all supported NIPs
   * This modular approach makes it easy to add/remove NIPs
   */
  private registerNIPs(): void {
    nipRegistry.register(new NIP01());
    nipRegistry.register(new NIP09());
    nipRegistry.register(new NIP11());
    
    // TODO: Add more NIPs as needed:
    // nipRegistry.register(new NIP17()); // Private Direct Messages
    // nipRegistry.register(new NIP23()); // Long-form Content
    // nipRegistry.register(new NIP40()); // Expiration Timestamp
    // nipRegistry.register(new NIP42()); // Authentication of clients to relays
    // nipRegistry.register(new NIP50()); // Search Capability
    // nipRegistry.register(new NIP56()); // Reporting
    // nipRegistry.register(new NIP62()); // Live Activities
    // nipRegistry.register(new NIP77()); // Negentropy Protocol Sync
    // nipRegistry.register(new NIP86()); // Relay Management API
  }

  /**
   * Handle HTTP requests (mainly for NIP-11)
   */
  private async handleHTTPRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = parse(req.url ?? "");
    const pathname = parsedUrl.pathname;
    
    // NIP-11: Relay Information Document
    if (req.method === "GET" && pathname === "/") {
      const nip11 = nipRegistry.get(11);
      if (nip11 instanceof NIP11) {
        const supportedNips = nipRegistry.getSupportedNips();
        const relayInfo = nip11.generateRelayDocument(supportedNips);
        
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify(relayInfo, null, 2));
        return;
      }
    }
    
    // Handle other HTTP requests (health check, etc.)
    if (pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
      return;
    }
    
    res.statusCode = 404;
    res.end("Not Found");
  }

  /**
   * Handle new WebSocket connections
   */
  private handleConnection(ws: WS, req: IncomingMessage): void {
    const connectionId = nanoid();
    const ip = req.socket.remoteAddress || "unknown";
    
    const connection: Connection = {
      id: connectionId,
      ws,
      subscriptions: new Map(),
      authenticated: false,
      ip,
      created_at: Date.now(),
      last_activity: Date.now(),
      rate_limit: {
        events: 0,
        last_reset: Date.now(),
      },
    };
    
    this.connections.set(connectionId, connection);
    
    console.log(`New connection: ${connectionId} from ${ip}`);
    
    ws.on("message", (data) => this.handleMessage(connection, data));
    ws.on("close", () => this.handleDisconnection(connectionId));
    ws.on("error", (error) => {
      console.error(`Connection ${connectionId} error:`, error);
      this.handleDisconnection(connectionId);
    });
  }

  /**
   * Handle WebSocket messages from clients
   */
  private async handleMessage(connection: Connection, data: WS.RawData): Promise<void> {
    connection.last_activity = Date.now();
    
    try {
      // Check rate limiting
      if (!this.checkRateLimit(connection)) {
        this.sendError(connection, "Rate limit exceeded");
        return;
      }
      
      // Parse message
      let message: unknown;
      try {
        const payload = typeof data === "string" ? data : data.toString();
        message = JSON.parse(payload) as unknown;
      } catch (parseError) {
        console.warn("Invalid JSON payload", parseError);
        this.sendError(connection, "Invalid JSON");
        return;
      }
      
      if (!Array.isArray(message) || typeof message[0] !== "string") {
        this.sendError(connection, "Invalid message format");
        return;
      }
      
      const payload = this.parseMessageData(message[0], message);
      if (!payload) {
        this.sendError(connection, "Invalid message structure");
        return;
      }
      
      // Validate message format
      const parsedMessage = clientMessageSchema.safeParse({
        type: message[0],
        ...payload,
      });
      
      if (!parsedMessage.success) {
        this.sendError(connection, "Invalid message format");
        return;
      }
      
      // Route message to appropriate handler
      switch (parsedMessage.data.type) {
        case "EVENT":
          await this.handleEventMessage(connection, parsedMessage.data.event);
          break;
        case "REQ":
          await this.handleReqMessage(
            connection, 
            parsedMessage.data.subscription_id,
            parsedMessage.data.filters
          );
          break;
        case "CLOSE":
          await this.handleCloseMessage(connection, parsedMessage.data.subscription_id);
          break;
        case "AUTH":
          await this.handleAuthMessage(connection, parsedMessage.data.event);
          break;
      }
      
    } catch (error) {
      console.error("Message handling error:", error);
      this.sendError(connection, "Internal server error");
    }
  }

  /**
   * Parse message data from array format to object format
   */
  private parseMessageData(type: string, message: unknown[]): Record<string, unknown> | null {
    switch (type) {
      case "EVENT":
        return { event: message[1] };
      case "REQ":
        if (typeof message[1] !== "string") {
          return null;
        }
        return { 
          subscription_id: message[1],
          filters: message.slice(2),
        };
      case "CLOSE":
        if (typeof message[1] !== "string") {
          return null;
        }
        return { subscription_id: message[1] };
      case "AUTH":
        return { event: message[1] };
      default:
        return null;
    }
  }

  /**
   * Handle EVENT messages
   */
  private async handleEventMessage(connection: Connection, event: unknown): Promise<void> {
    // Validate event format
    const parsedEvent = nostrEventSchema.safeParse(event);
    if (!parsedEvent.success) {
      const fallbackId =
        typeof event === "object" && event !== null && "id" in event && typeof (event as { id: unknown }).id === "string"
          ? (event as { id: string }).id
          : "";
      this.sendResponse(connection, {
        type: "OK",
        event_id: fallbackId,
        accepted: false,
        message: "Invalid event format",
      });
      return;
    }
    
    // Check if user is authorized to post
    if (!await this.isAuthorizedToPost(connection)) {
      this.sendResponse(connection, {
        type: "OK",
        event_id: parsedEvent.data.id,
        accepted: false,
        message: "Authorization required or subscription needed",
      });
      return;
    }
    
    // Validate event with all applicable NIPs
    const validation = await nipRegistry.validateEvent(parsedEvent.data);
    if (!validation.valid) {
      this.sendResponse(connection, {
        type: "OK",
        event_id: parsedEvent.data.id,
        accepted: false,
        message: validation.reason || "Event validation failed",
      });
      return;
    }
    
    // Process event with all applicable NIPs
    try {
      await nipRegistry.processEvent(parsedEvent.data);
      
      this.sendResponse(connection, {
        type: "OK",
        event_id: parsedEvent.data.id,
        accepted: true,
        message: "",
      });
      
      // Broadcast event to subscribers
      await this.broadcastEvent(parsedEvent.data);
      
    } catch (error) {
      console.error("Event processing error:", error);
      this.sendResponse(connection, {
        type: "OK",
        event_id: parsedEvent.data.id,
        accepted: false,
        message: "Internal server error",
      });
    }
  }

  /**
   * Check if connection is authorized to post events
   */
  private async isAuthorizedToPost(connection: Connection): Promise<boolean> {
    // Admin is always authorized
    if (connection.pubkey && this.isAdmin(connection.pubkey)) {
      return true;
    }
    
    // Check if user has active subscription
    if (connection.pubkey) {
      const user = await db.user.findUnique({
        where: { pubkey: connection.pubkey },
        include: {
          subscriptions: {
            where: {
              status: "ACTIVE",
              expiresAt: { gt: new Date() },
            },
          },
        },
      });
      
      return (user?.subscriptions?.length ?? 0) > 0;
    }
    
    return false;
  }

  private isAdmin(pubkey: string): boolean {
    // Convert npub to hex for comparison if needed
    const adminNpub = env.ADMIN_NPUB;
    return pubkey === adminNpub;
  }

  // Additional methods for REQ, CLOSE, AUTH, etc. would go here...
  // This is getting quite long, so I'll create separate files for these

  /**
   * Start the relay server
   */
  start(): void {
    this.server.listen(env.RELAY_PORT, () => {
      console.log(`Nostr relay server listening on port ${env.RELAY_PORT}`);
      console.log(`Supported NIPs: ${nipRegistry.getSupportedNips().join(", ")}`);
    });
  }

  /**
   * Stop the relay server
   */
  stop(): void {
    clearInterval(this.cleanupInterval);
    this.wss.close();
    this.server.close();
  }

  // Placeholder methods - would be implemented in full version
  private checkRateLimit(connection: Connection): boolean {
    void connection;
    return true;
  }
  private sendError(connection: Connection, message: string): void {
    this.sendResponse(connection, { type: "NOTICE", message });
  }
  private sendResponse(connection: Connection, response: ServerMessage): void {
    if (connection.ws.readyState !== WS.OPEN) {
      return;
    }
    const payload = this.formatServerMessage(response);
    connection.ws.send(JSON.stringify(payload));
  }
  private formatServerMessage(response: ServerMessage): unknown[] {
    switch (response.type) {
      case "EVENT":
        return ["EVENT", response.subscription_id, response.event];
      case "OK":
        return ["OK", response.event_id, response.accepted, response.message];
      case "EOSE":
        return ["EOSE", response.subscription_id];
      case "CLOSED":
        return ["CLOSED", response.subscription_id, response.message];
      case "NOTICE":
        return ["NOTICE", response.message];
      case "AUTH":
        return ["AUTH", response.challenge];
      default:
        return ["NOTICE", "Unknown server message"];
    }
  }
  private handleReqMessage(connection: Connection, subId: string, filters: Filter[]): Promise<void> {
    void connection;
    void subId;
    void filters;
    return Promise.resolve();
  }
  private handleCloseMessage(connection: Connection, subId: string): Promise<void> {
    void connection;
    void subId;
    return Promise.resolve();
  }
  private handleAuthMessage(connection: Connection, event: NostrEvent): Promise<void> {
    void connection;
    void event;
    return Promise.resolve();
  }
  private handleDisconnection(connectionId: string): void {
    void connectionId;
  }
  private cleanupConnections(): void {}
  private broadcastEvent(event: NostrEvent): Promise<void> {
    void event;
    return Promise.resolve();
  }
}