import { ulid } from 'ulid';

export function generateId(): string {
  return ulid();
}
