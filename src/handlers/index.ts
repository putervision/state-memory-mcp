import { nodeHandlers } from './node.js';
import { edgeHandlers } from './edge.js';
import { graphHandlers } from './graph.js';
import { analyticsHandlers } from './analytics.js';
import { sessionHandlers } from './session.js';
import { snapshotHandlers } from './snapshot.js';
import { batchHandlers } from './batch.js';
import { specHandlers } from './spec.js';

export const toolHandlers: Record<string, (args: any) => Promise<any> | any> = {
  ...nodeHandlers,
  ...edgeHandlers,
  ...graphHandlers,
  ...analyticsHandlers,
  ...sessionHandlers,
  ...snapshotHandlers,
  ...batchHandlers,
  ...specHandlers,
};
