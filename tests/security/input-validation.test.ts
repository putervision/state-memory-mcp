import { describe, it, expect } from 'vitest';
import { MetadataSchema, PropertiesSchema } from '../../src/schema/schemas.js';
import { isSafeWebhookUrl } from '../../src/engine/notifications.js';

describe('Security & Input Validation Tests', () => {
  describe('Metadata Payload Size Cap (500 KB Limit)', () => {
    it('should pass for metadata under 500 KB', () => {
      const smallMeta = { key: 'a'.repeat(1000) };
      const parsed = MetadataSchema.parse(smallMeta);
      expect(parsed).toEqual(smallMeta);
    });

    it('should throw validation error for metadata exceeding 512,000 characters', () => {
      const hugeMeta = { key: 'a'.repeat(600000) };
      expect(() => MetadataSchema.parse(hugeMeta)).toThrow(
        'Metadata must be a JSON-serializable object of max 500 KB'
      );
    });

    it('should enforce 500 KB limit on edge properties', () => {
      const hugeProps = { key: 'b'.repeat(600000) };
      expect(() => PropertiesSchema.parse(hugeProps)).toThrow(
        'Properties must be a JSON-serializable object of max 500 KB'
      );
    });
  });

  describe('SSRF Webhook URL Validation', () => {
    it('should allow valid public HTTPS and HTTP webhooks', () => {
      expect(isSafeWebhookUrl('https://api.example.com/webhook')).toBe(true);
      expect(isSafeWebhookUrl('http://hooks.slack.com/services/123')).toBe(true);
    });

    it('should reject non-HTTP protocols', () => {
      expect(isSafeWebhookUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeWebhookUrl('gopher://internal.server')).toBe(false);
    });

    it('should reject private IP ranges by default', () => {
      expect(isSafeWebhookUrl('http://127.0.0.1/webhook')).toBe(false);
      expect(isSafeWebhookUrl('http://localhost:8080/hook')).toBe(false);
      expect(isSafeWebhookUrl('http://192.168.1.50/hook')).toBe(false);
      expect(isSafeWebhookUrl('http://10.0.0.1/hook')).toBe(false);
    });
  });
});
