import EventEmitter from 'node:events';
import * as http from 'node:http';
import * as https from 'node:https';
import { logger } from '../utils/logger.js';

export interface ContextChangeEvent {
  project: string;
  eventType: string;
  entityType: 'node' | 'edge';
  entityId: string;
  timestamp: string;
  payload?: any;
}

/**
 * Validates a webhook URL to prevent SSRF against internal private IP addresses.
 */
export function isSafeWebhookUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const allowPrivate =
      process.env.ALLOW_PRIVATE_WEBHOOKS === 'true' ||
      process.env.STATE_MEMORY_ALLOW_PRIVATE_WEBHOOKS === 'true';

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

    // Check private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    const ipMatch = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const p1 = parseInt(ipMatch[1], 10);
      const p2 = parseInt(ipMatch[2], 10);
      if (p1 === 10) return false;
      if (p1 === 172 && p2 >= 16 && p2 <= 31) return false;
      if (p1 === 192 && p2 === 168) return false;
      if (p1 === 127) return false;
    }

    return true;
  } catch {
    return false;
  }
}

class ContextStoreNotifier extends EventEmitter {
  constructor() {
    super();
    this.on('change', (event: ContextChangeEvent) => {
      this.dispatchWebhook(event);
    });
  }

  notify(event: ContextChangeEvent): void {
    logger.debug(
      `[CA-MCP Shared Context Store] Notification: ${event.eventType} on ${event.entityId}`
    );
    this.emit('change', event);
    this.emit(`change:${event.project}`, event);
  }

  private dispatchWebhook(event: ContextChangeEvent): void {
    const webhookUrl = process.env.STATE_MEMORY_WEBHOOK_URL;
    if (!webhookUrl) return;

    if (!isSafeWebhookUrl(webhookUrl)) {
      logger.warn(`Rejected unsafe or private webhook URL: ${webhookUrl}`);
      return;
    }

    try {
      const payload = JSON.stringify(event);
      const url = new URL(webhookUrl);
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'state-memory-mcp-webhook/0.9.0',
        },
        timeout: 5000,
      });

      req.on('error', (err) => {
        logger.warn(`Webhook HTTP POST failed to ${webhookUrl}: ${err.message}`);
      });

      req.write(payload);
      req.end();
    } catch (err: any) {
      logger.warn(`Failed to dispatch webhook notification: ${err.message}`);
    }
  }
}

export const contextNotifier = new ContextStoreNotifier();
