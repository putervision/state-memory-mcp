import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import {
  isPrivateIp,
  isSafeWebhookUrl,
  validateWebhookHostDns,
  contextNotifier,
  ContextChangeEvent,
} from '../../src/engine/notifications.js';

describe('Webhook Notifications Engine Edge Cases', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should correctly classify private vs public IP addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('0.0.0.0')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('10.0.1.5')).toBe(true);
    expect(isPrivateIp('172.20.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.100')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('fe80::1234')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);

    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
  });

  it('should evaluate isSafeWebhookUrl protocols and hostnames', () => {
    expect(isSafeWebhookUrl('ftp://example.com/webhook')).toBe(false);
    expect(isSafeWebhookUrl('http://localhost:3000/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://127.0.0.1:8080')).toBe(false);
    expect(isSafeWebhookUrl('http://app.local/hook')).toBe(false);
    expect(isSafeWebhookUrl('invalid-url')).toBe(false);

    expect(isSafeWebhookUrl('https://hooks.example.com/notify')).toBe(true);

    process.env.ALLOW_PRIVATE_WEBHOOKS = 'true';
    expect(isSafeWebhookUrl('http://localhost:3000/hook')).toBe(true);
  });

  it('should validate DNS for webhook hostnames asynchronously', async () => {
    const isPublicValid = await validateWebhookHostDns('https://dns.google');
    expect(isPublicValid).toBeTruthy();

    const isNonExistent = await validateWebhookHostDns(
      'https://this-domain-should-never-exist-9999999.com'
    );
    expect(isNonExistent).toBeNull();
  });

  it('should dispatch webhook notification HTTP POST request to local server', async () => {
    let receivedHeader: string | undefined;
    let receivedBody: any;

    const server = http.createServer((req, res) => {
      receivedHeader = req.headers['authorization'] as string;
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedBody = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as any;
    const port = address.port;

    process.env.STATE_MEMORY_ALLOW_PRIVATE_WEBHOOKS = 'true';
    process.env.STATE_MEMORY_WEBHOOK_URL = `http://127.0.0.1:${port}/webhook`;
    process.env.STATE_MEMORY_WEBHOOK_SECRET = 'super-secret-token';

    const event: ContextChangeEvent = {
      project: 'webhook-test-project',
      eventType: 'node_created',
      entityType: 'node',
      entityId: 'node-123',
      timestamp: new Date().toISOString(),
    };

    contextNotifier.notify(event);

    // Wait for async HTTP request execution
    await new Promise((res) => setTimeout(res, 300));

    expect(receivedHeader).toBe('Bearer super-secret-token');
    expect(receivedBody).toBeDefined();
    expect(receivedBody.entityId).toBe('node-123');

    server.close();
  });
});
