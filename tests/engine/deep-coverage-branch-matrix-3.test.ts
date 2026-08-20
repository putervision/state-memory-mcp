import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { importIssues, exportIssues } from '../../src/engine/issue-sync.js';
import { calculateSpecCompliance } from '../../src/engine/spec-compliance.js';
import { parseMarkdownSpec } from '../../src/engine/spec-parser.js';
import { SynergyEngine } from '../../src/engine/synergy.js';
import { vcsBranchSync, vcsMergeResolution } from '../../src/engine/vcs-sync.js';
import { getNextTasks } from '../../src/engine/work-queue.js';
import { parseNodeRow, parseEdgeRow } from '../../src/engine/row-mappers.js';
import {
  isPrivateIp,
  isSafeWebhookUrl,
  validateWebhookHostDns,
  contextNotifier,
} from '../../src/engine/notifications.js';

describe('Deep Coverage Branch Matrix 3 - VCS, Issues, Spec, Synergy, Notifications, Row Mappers', () => {
  let project: string;

  beforeEach(() => {
    project = `deep-matrix-3-${randomUUID()}`;
    closeAllDbs();
  });

  afterEach(() => {
    closeAllDbs();
  });

  it('should cover row-mappers with valid, empty, and corrupted metadata/tags', () => {
    // Valid node row
    const nodeRow1: any = {
      id: 'n1',
      type: 'task',
      title: 'Node 1',
      status: 'pending',
      metadata: '{"key": "val"}',
      tags: '["t1", "t2"]',
      project: 'p',
      git_branch: 'main',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
      version: 1,
    };
    const parsed1 = parseNodeRow(nodeRow1);
    expect(parsed1.metadata).toEqual({ key: 'val' });
    expect(parsed1.tags).toEqual(['t1', 't2']);

    // Corrupted JSON node row
    const nodeRowCorrupt: any = {
      ...nodeRow1,
      id: 'n_corrupt',
      metadata: '{invalid_json',
      tags: '[invalid_json',
    };
    const parsedCorrupt = parseNodeRow(nodeRowCorrupt);
    expect(parsedCorrupt.metadata).toEqual({});
    expect(parsedCorrupt.tags).toEqual([]);

    // Edge row parsing with corrupted JSON
    const edgeRow1: any = {
      id: 'e1',
      source_id: 's',
      target_id: 't',
      type: 'depends_on',
      metadata: '{corrupt_meta',
      project: 'p',
      created_at: '2026-01-01',
    };
    const parsedEdge = parseEdgeRow(edgeRow1);
    expect(parsedEdge.source_id).toBe('s');
  });

  it('should cover issue-sync import/export variations', () => {
    const db = getDb(project);
    const issues = [
      {
        external_id: 'JIRA-100',
        title: 'Fix auth login bug',
        body: 'Login throws 500 error',
        state: 'open' as const,
        labels: ['auth', 'critical'],
      },
      {
        external_id: 'JIRA-101',
        title: 'Deprecate old endpoint',
        body: 'Remove legacy v0 API',
        state: 'closed' as const,
        labels: ['api'],
      },
    ];

    // Import issues
    const impRes = importIssues({ project, issues });
    expect(impRes.imported_count).toBe(2);

    // Export issues as generic, github, and jira formats
    const expMd = exportIssues({ project, format: 'generic' });
    expect(expMd.issues.length).toBeGreaterThan(0);
    const expGh = exportIssues({ project, format: 'github' });
    expect(expGh.issues.length).toBeGreaterThan(0);
    const expJira = exportIssues({ project, format: 'jira' });
    expect(expJira.issues.length).toBeGreaterThan(0);
  });

  it('should cover spec-parser and spec-compliance branches', () => {
    const db = getDb(project);
    const specMarkdown = `
# Feature Spec: User Profile Management

## Overview
Allows users to edit display name and avatar.

### Requirements
- [x] Must support UTF-8 display names
- [ ] Must validate avatar image size <= 2MB
- [ ] Must provide rollback on failure

#### Acceptance Criteria
1. User receives 200 on valid upload
2. User receives 400 on file > 2MB
    `;

    const parsed = parseMarkdownSpec(specMarkdown);
    expect(parsed.title).toBe('Feature Spec: User Profile Management');
    expect(parsed.requirements.length).toBeGreaterThan(0);

    // Compliance calculation
    const specNode = GraphEngine.addNode({
      project,
      type: 'spec',
      title: 'User Profile Spec',
      status: 'active',
    });
    const req1 = GraphEngine.addNode({
      project,
      type: 'requirement',
      title: 'UTF-8 names',
      status: 'done',
    });
    const req2 = GraphEngine.addNode({
      project,
      type: 'requirement',
      title: 'Avatar size limit',
      status: 'pending',
    });
    const crit1 = GraphEngine.addNode({
      project,
      type: 'acceptance_criterion',
      title: 'Passes upload',
      status: 'done',
    });

    EdgeEngine.addEdge({ project, source_id: req1.id, target_id: specNode.id, type: 'part_of' });
    EdgeEngine.addEdge({ project, source_id: req2.id, target_id: specNode.id, type: 'part_of' });
    EdgeEngine.addEdge({ project, source_id: crit1.id, target_id: req1.id, type: 'part_of' });

    const compliance = calculateSpecCompliance(db, project);
    expect(compliance.total_requirements).toBeGreaterThanOrEqual(2);
  });

  it('should cover synergy metrics and joint trajectory exports', async () => {
    const db = getDb(project);
    const t = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Visual Workflow Task',
      status: 'done',
    });
    const vs = GraphEngine.addNode({ project, type: 'visual_state', title: 'Saved State 1' });

    // Add visual edge
    EdgeEngine.addEdge({ project, source_id: t.id, target_id: vs.id, type: 'renders_state' });

    const joint = await SynergyEngine.exportJointTrajectories({ project });
    expect(joint).toBeDefined();

    const synergy = await SynergyEngine.getSynergyMetrics({ project });
    expect(synergy).toBeDefined();
    expect(synergy.synergy_health).toBeDefined();
  });

  it('should cover vcsBranchSync and vcsMergeResolution branches', () => {
    const db = getDb(project);
    GraphEngine.addNode({ project, type: 'task', title: 'Feat Task' });

    const sync = vcsBranchSync({ project, target_branch: 'develop' });
    expect(sync).toBeDefined();

    const mergeAuto = vcsMergeResolution({
      project,
      source_branch: 'feat/auth',
      target_branch: 'main',
      strategy: 'auto_accept',
    });
    expect(mergeAuto).toBeDefined();

    const mergeFlag = vcsMergeResolution({
      project,
      source_branch: 'feat/auth',
      target_branch: 'main',
      strategy: 'flag_conflicts',
    });
    expect(mergeFlag).toBeDefined();
  });

  it('should cover work-queue prioritization with blocked, assigned, and capability filters', () => {
    const db = getDb(project);
    const t1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Base Task',
      status: 'pending',
    });
    const t2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Dependent Task',
      status: 'pending',
    });
    const b1 = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Blocker 1',
      status: 'active',
    });

    EdgeEngine.addEdge({ project, source_id: t2.id, target_id: t1.id, type: 'depends_on' });
    EdgeEngine.addEdge({ project, source_id: b1.id, target_id: t1.id, type: 'blocks' });

    const nextBlocked = getNextTasks(db, { project, limit: 5 });
    expect(nextBlocked.tasks).toBeDefined();

    // Resolve blocker by setting status to done
    GraphEngine.updateNode({ project, id: b1.id, status: 'done' });
    const nextRunnable = getNextTasks(db, { project, limit: 5 });
    expect(nextRunnable.tasks.length).toBeGreaterThan(0);
    expect(nextRunnable.tasks.some((t) => t.node.id === t1.id)).toBe(true);
  });

  it('should cover notification security and notifier branches', async () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);

    expect(isSafeWebhookUrl('http://127.0.0.1/webhook')).toBe(false);
    expect(isSafeWebhookUrl('https://hooks.slack.com/services/123')).toBe(true);
    expect(isSafeWebhookUrl('ftp://invalid-proto.com')).toBe(false);

    const dnsRes = await validateWebhookHostDns('localhost');
    expect(dnsRes).toBeDefined();

    // Notify listener
    let received = false;
    const listener = () => {
      received = true;
    };
    contextNotifier.on('change', listener);
    contextNotifier.notify({
      eventType: 'node_created',
      entityType: 'node',
      entityId: 'n1',
      project,
      timestamp: new Date().toISOString(),
    });
    expect(received).toBe(true);
    contextNotifier.off('change', listener);
  });
});
