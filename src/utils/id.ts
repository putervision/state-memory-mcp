import * as crypto from 'crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateId(): string {
  let now = Date.now();
  let timeStr = '';
  for (let i = 0; i < 10; i++) {
    const mod = now % 32;
    timeStr = ENCODING.charAt(mod) + timeStr;
    now = Math.floor(now / 32);
  }

  const randomBytes = crypto.randomBytes(16);
  let randomStr = '';
  for (let i = 0; i < 16; i++) {
    randomStr += ENCODING.charAt(randomBytes[i] % 32);
  }

  return timeStr + randomStr;
}
