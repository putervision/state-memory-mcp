import EventEmitter from 'node:events';
import { logger } from '../utils/logger.js';

export interface ContextChangeEvent {
  project: string;
  eventType: string;
  entityType: 'node' | 'edge';
  entityId: string;
  timestamp: string;
  payload?: any;
}

class ContextStoreNotifier extends EventEmitter {
  notify(event: ContextChangeEvent): void {
    logger.debug(
      `[CA-MCP Shared Context Store] Notification: ${event.eventType} on ${event.entityId}`
    );
    this.emit('change', event);
    this.emit(`change:${event.project}`, event);
  }
}

export const contextNotifier = new ContextStoreNotifier();
