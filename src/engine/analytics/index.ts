import { traceDependencies, findBlockers, getProjectSummary } from './dependencies.js';
import { criticalPath } from './critical-path.js';
import { impactAnalysis } from './impact.js';
import { detectContradictions } from './contradictions.js';
import { valueMetrics } from './metrics.js';
import { getContextSnapshot, findRelatedDecisions, findBlockedTasks } from './context.js';
import { decisionTrail } from './decision-trail.js';

export class AnalyticsEngine {
  static traceDependencies = traceDependencies;
  static findBlockers = findBlockers;
  static findBlockedTasks = findBlockedTasks;
  static criticalPath = criticalPath;
  static impactAnalysis = impactAnalysis;
  static detectContradictions = detectContradictions;
  static getProjectSummary = getProjectSummary;
  static decisionTrail = decisionTrail;
  static getContextSnapshot = getContextSnapshot;
  static findRelatedDecisions = findRelatedDecisions;
  static valueMetrics = valueMetrics;
}

export * from './dependencies.js';
export * from './critical-path.js';
export * from './impact.js';
export * from './contradictions.js';
export * from './context.js';
export * from './decision-trail.js';
export * from './metrics.js';
