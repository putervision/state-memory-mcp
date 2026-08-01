import EventEmitter from 'node:events';
import * as http from 'node:http';
import * as https from 'node:https';
import * as dns from 'node:dns/promises';
import { logger } from '../utils/logger.js';
import { VERSION } from '../utils/version.js';

export interface ContextChangeEvent {
  project: string;
  eventType: string;
  entityType: 'node' | 'edge';
  entityId: string;
  timestamp: string;
  payload?: any;
}

export function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '0.0.0.0' || ip === '::1') return true;
  const v4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4Match) {
    const p1 = parseInt(v4Match[1], 10);
    const p2 = parseInt(v4Match[2], 10);
    if (p1 === 10) return true;
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
    if (p1 === 192 && p2 === 168) return true;
    if (p1 === 127) return true;
    if (p1 === 169 && p2 === 254) return true;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6.startsWith('fe80:') || v6.startsWith('fc') || v6.startsWith('fd')) {
    return true;
  }
  return false;
}

/**
 * Synchronously validates a webhook URL string structure.
 */
export function isSafeWebhookUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const allowPrivate =
      process.env.ALLOW_PRIVATE_WEBHOOKS === 'true' ||
      process.env.STATE_MEMORY_ALLOW_PRIVATE_WEBHOOKS === 'true';

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    if (allowPrivate) {
      return true;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return false;
    }

    if (isPrivateIp(host)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Asynchronously pre-resolves DNS hostnames to ensure resolved IPs are not private (SSRF protection).
 * Returns the verified safe IP address string, or null if unsafe/failed.
 */
export async function validateWebhookHostDns(urlStr: string): Promise<string | null> {
  if (!isSafeWebhookUrl(urlStr)) return null;

  const allowPrivate =
    process.env.ALLOW_PRIVATE_WEBHOOKS === 'true' ||
    process.env.STATE_MEMORY_ALLOW_PRIVATE_WEBHOOKS === 'true';

  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname;
    const addresses = await dns.lookup(host, { all: true });
    if (!addresses || addresses.length === 0) return null;

    for (const addr of addresses) {
      if (!allowPrivate && isPrivateIp(addr.address)) {
        logger.warn(
          `Webhook hostname "${host}" resolved to private IP "${addr.address}". Rejecting.`
        );
        return null;
      }
    }
    return addresses[0].address;
  } catch (err: any) {
    logger.warn(`DNS pre-resolution failed for webhook host "${urlStr}": ${err.message}`);
    return null;
  }
}

class ContextStoreNotifier extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.on('change', (event: ContextChangeEvent) => {
      this.dispatchWebhook(event).catch((err) => {
        logger.warn(`Unhandled error in dispatchWebhook: ${err.message}`);
      });
    });
  }

  notify(event: ContextChangeEvent): void {
    logger.debug(
      `[CA-MCP Shared Context Store] Notification: ${event.eventType} on ${event.entityId}`
    );
    this.emit('change', event);
    this.emit(`change:${event.project}`, event);
  }

  private async dispatchWebhook(event: ContextChangeEvent): Promise<void> {
    const webhookUrl = process.env.STATE_MEMORY_WEBHOOK_URL;
    if (!webhookUrl) return;

    const safeIp = await validateWebhookHostDns(webhookUrl);
    if (!safeIp) {
      logger.warn(`Rejected unsafe or unverified webhook URL: ${webhookUrl}`);
      return;
    }

    try {
      const payload = JSON.stringify(event);
      const url = new URL(webhookUrl);
      const client = url.protocol === 'https:' ? https : http;

      const ac = new AbortController();
      const timeoutMs = parseInt(process.env.STATE_MEMORY_WEBHOOK_TIMEOUT || '5000', 10);
      const timer = setTimeout(() => ac.abort(), timeoutMs);

      const headers: Record<string, string | number> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': `state-memory-mcp-webhook/${VERSION}`,
      };

      const secret =
        process.env.STATE_MEMORY_WEBHOOK_SECRET || process.env.STATE_MEMORY_WEBHOOK_TOKEN;
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }

      // Pin resolution to verified safe IP to prevent DNS rebinding TOCTOU attacks
      const req = client.request(url, {
        method: 'POST',
        headers,
        signal: ac.signal,
        lookup: (_hostname, _opts, callback) => {
          const family = safeIp.includes(':') ? 6 : 4;
          callback(null, safeIp, family);
        },
      });

      req.on('error', (err) => {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          logger.warn(`Webhook HTTP POST timed out after ${timeoutMs}ms to ${webhookUrl}`);
        } else {
          logger.warn(`Webhook HTTP POST failed to ${webhookUrl}: ${err.message}`);
        }
      });

      req.on('response', (res) => {
        clearTimeout(timer);
        res.resume(); // Consume response data to free memory
      });

      req.write(payload);
      req.end();
    } catch (err: any) {
      logger.warn(`Failed to dispatch webhook notification: ${err.message}`);
    }
  }
}

export const contextNotifier = new ContextStoreNotifier();
