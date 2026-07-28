/**
 * Privacy & Governance Layer: Sensitive Data Redaction Utility
 */

export function redactText(text: string): string {
  if (!text) return text;
  let redacted = text;

  // Specific regex replacements
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]');
  redacted = redacted.replace(
    /(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{30,}|AKIA[0-9A-Z]{16})/g,
    '[REDACTED_API_KEY]'
  );
  redacted = redacted.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    '[REDACTED_EMAIL]'
  );
  redacted = redacted.replace(
    /(["']?(?:api[_-]?key|password|passwd|secret|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*["']?)([^"'\s,;}]+)(["']?)/gi,
    '$1[REDACTED]$3'
  );

  return redacted;
}

export function redactData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    return redactText(data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((item) => redactData(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (/password|secret|key|token|auth|credential/i.test(key) && typeof val === 'string') {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactData(val);
      }
    }
    return result as unknown as T;
  }
  return data;
}
