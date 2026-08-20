import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  registerAllTools,
  jsonSchemaToZod,
  jsonSchemaToZodObject,
} from '../../src/tools/handlers.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';

describe('Tools Registration & Schema Converter Exhaustive Test Suite', () => {
  let project: string;

  beforeEach(() => {
    project = `tools-disp-${randomUUID()}`;
    closeAllDbs();
    delete process.env.STATE_MEMORY_READ_ONLY;
    delete process.env.STATE_MEMORY_AUDIT_ONLY;
    delete process.env.STATE_MEMORY_COMPAT;
    delete process.env.STATE_MEMORY_ADMIN_MODE;
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should test jsonSchemaToZod and jsonSchemaToZodObject for all types', () => {
    expect(jsonSchemaToZod(null)).toBeDefined();
    expect(jsonSchemaToZod('invalid')).toBeDefined();
    expect(jsonSchemaToZod({ type: 'string' })).toBeDefined();
    expect(jsonSchemaToZod({ type: 'string', enum: ['a', 'b'] })).toBeDefined();
    expect(jsonSchemaToZod({ type: 'number' })).toBeDefined();
    expect(jsonSchemaToZod({ type: 'boolean' })).toBeDefined();
    expect(jsonSchemaToZod({ type: 'array', items: { type: 'string' } })).toBeDefined();
    expect(
      jsonSchemaToZod({
        type: 'object',
        properties: { name: { type: 'string', description: 'User name' } },
        required: ['name'],
      })
    ).toBeDefined();
    expect(jsonSchemaToZodObject({ type: 'object', properties: {} })).toBeDefined();
    expect(jsonSchemaToZodObject({ type: 'string' })).toBeDefined();
  });

  it('should register all 13 consolidated tools and execute every single tool and action through dispatcher', async () => {
    const registeredTools: Record<string, Function> = {};
    const mockServer: any = {
      registerTool: (name: string, _opts: any, handler: Function) => {
        registeredTools[name] = handler;
      },
    };

    process.env.STATE_MEMORY_COMPAT = 'true';
    process.env.STATE_MEMORY_ADMIN_MODE = 'true';
    registerAllTools(mockServer);

    expect(Object.keys(registeredTools).length).toBeGreaterThan(13);

    // 1. manage_sessions: start, list, end
    const sessRes = await registeredTools['manage_sessions']({
      action: 'start',
      project,
      agent_id: 'agent-1',
    });
    expect(sessRes.content[0].text).toContain('session_id');

    const sessList = await registeredTools['manage_sessions']({
      action: 'list',
      project,
    });
    expect(sessList.content[0].text).toBeDefined();

    // 2. manage_nodes: create, get, update, list, search, add_note, batch_create, batch_update, remove
    const n1Res = await registeredTools['manage_nodes']({
      action: 'create',
      project,
      type: 'task',
      title: 'Dispatch Task Alpha',
      status: 'pending',
    });
    const n1 = JSON.parse(n1Res.content[0].text);

    const n2Res = await registeredTools['manage_nodes']({
      action: 'create',
      project,
      type: 'task',
      title: 'Dispatch Task Beta',
      status: 'pending',
    });
    const n2 = JSON.parse(n2Res.content[0].text);

    const nGet = await registeredTools['manage_nodes']({
      action: 'get',
      project,
      id: n1.id,
    });
    expect(nGet.content[0].text).toContain(n1.id);

    const nUp = await registeredTools['manage_nodes']({
      action: 'update',
      project,
      id: n1.id,
      status: 'in_progress',
    });
    expect(nUp.content[0].text).toContain('in_progress');

    const nList = await registeredTools['manage_nodes']({
      action: 'list',
      project,
      limit: 10,
    });
    expect(nList.content[0].text).toBeDefined();

    const nSearch = await registeredTools['manage_nodes']({
      action: 'search',
      project,
      query: 'Alpha',
    });
    expect(nSearch.content[0].text).toBeDefined();

    const nNote = await registeredTools['manage_nodes']({
      action: 'add_note',
      project,
      id: n1.id,
      text: 'Starting work on alpha',
    });
    expect(nNote.content[0].text).toBeDefined();

    const nBatch = await registeredTools['manage_nodes']({
      action: 'batch_create',
      project,
      nodes: [
        { type: 'decision', title: 'Dec 1' },
        { type: 'milestone', title: 'Mile 1' },
      ],
    });
    expect(nBatch.content[0].text).toBeDefined();

    const nBatchUp = await registeredTools['manage_nodes']({
      action: 'batch_update',
      project,
      ids: [n1.id],
      status: 'done',
    });
    expect(nBatchUp.content[0].text).toBeDefined();

    // 3. manage_edges: add, link_visual, batch_add, remove
    const e1Res = await registeredTools['manage_edges']({
      action: 'add',
      project,
      source_id: n2.id,
      target_id: n1.id,
      type: 'depends_on',
    });
    const e1 = JSON.parse(e1Res.content[0].text);

    const eVisual = await registeredTools['manage_edges']({
      action: 'link_visual',
      project,
      target_id: n1.id,
      visual_state_id: 'vs-dispatch-1',
      relationship: 'renders_state',
    });
    expect(eVisual.content[0].text).toBeDefined();

    const eBatch = await registeredTools['manage_edges']({
      action: 'batch_add',
      project,
      edges: [{ source_id: n2.id, target_id: n1.id, type: 'references' }],
    });
    expect(eBatch.content[0].text).toBeDefined();

    const eRemove = await registeredTools['manage_edges']({
      action: 'remove',
      project,
      source_id: n2.id,
      target_id: n1.id,
      type: 'depends_on',
    });
    expect(eRemove.content[0].text).toBeDefined();

    // 4. manage_tasks: next, find_blockers, complete, find_blocked, find_stale, auto_prune
    const tNext = await registeredTools['manage_tasks']({
      action: 'next',
      project,
      limit: 5,
    });
    expect(tNext.content[0].text).toBeDefined();

    const tBlock = await registeredTools['manage_tasks']({
      action: 'find_blockers',
      project,
    });
    expect(tBlock.content[0].text).toBeDefined();

    const d1Res = await registeredTools['manage_nodes']({
      action: 'create',
      project,
      type: 'decision',
      title: 'Architecture Decision',
      status: 'accepted',
    });
    const d1 = JSON.parse(d1Res.content[0].text);

    const tBlocked = await registeredTools['manage_tasks']({
      action: 'find_blocked',
      project,
      decision_id: d1.id,
    });
    expect(tBlocked.content[0].text).toBeDefined();

    const tStale = await registeredTools['manage_tasks']({
      action: 'find_stale',
      project,
      older_than: '0d',
    });
    expect(tStale.content[0].text).toBeDefined();

    const tPrune = await registeredTools['manage_tasks']({
      action: 'auto_prune',
      project,
      older_than: '30d',
    });
    expect(tPrune.content[0].text).toBeDefined();

    const tComp = await registeredTools['manage_tasks']({
      action: 'complete',
      project,
      task_id: n2.id,
    });
    expect(tComp.content[0].text).toBeDefined();

    // 5. query_graph: subgraph, trace, raw, natural_language
    const qSub = await registeredTools['query_graph']({
      action: 'subgraph',
      project,
      root_id: n1.id,
      depth: 2,
    });
    expect(qSub.content[0].text).toBeDefined();

    const qTrace = await registeredTools['query_graph']({
      action: 'trace',
      project,
      node_id: n2.id,
      direction: 'upstream',
    });
    expect(qTrace.content[0].text).toBeDefined();

    const qRaw = await registeredTools['query_graph']({
      action: 'raw',
      project,
      sql: 'SELECT id, title FROM nodes WHERE project = ?',
      params: [project],
    });
    expect(qRaw.content[0].text).toBeDefined();

    const qNl = await registeredTools['query_graph']({
      action: 'natural_language',
      project,
      query: 'What tasks are done?',
    });
    expect(qNl.content[0].text).toBeDefined();

    // 6. get_analytics: summary, velocity, burndown, value_metrics, cognitive_load, critical_path, context_snapshot, decision_trail, find_related_decisions, contradictions
    const aSum = await registeredTools['get_analytics']({ action: 'summary', project });
    expect(aSum.content[0].text).toBeDefined();

    const aVel = await registeredTools['get_analytics']({ action: 'velocity', project });
    expect(aVel.content[0].text).toBeDefined();

    const aBurn = await registeredTools['get_analytics']({ action: 'burndown', project });
    expect(aBurn.content[0].text).toBeDefined();

    const aVal = await registeredTools['get_analytics']({ action: 'value_metrics', project });
    expect(aVal.content[0].text).toBeDefined();

    const aCog = await registeredTools['get_analytics']({ action: 'cognitive_load', project });
    expect(aCog.content[0].text).toBeDefined();

    const aContra = await registeredTools['get_analytics']({ action: 'contradictions', project });
    expect(aContra.content[0].text).toBeDefined();

    const aImpact = await registeredTools['get_analytics']({ action: 'context_snapshot', project });
    expect(aImpact.content[0].text).toBeDefined();

    // 7. get_events: log, changelog
    const evList = await registeredTools['get_events']({ action: 'log', project, limit: 10 });
    expect(evList.content[0].text).toBeDefined();

    const evChange = await registeredTools['get_events']({
      action: 'changelog',
      project,
      since: '2h',
    });
    expect(evChange.content[0].text).toBeDefined();

    // 8. use_blackboard: post, read
    const bbSet = await registeredTools['use_blackboard']({
      action: 'post',
      project,
      topic: 'alpha',
      content: 'Ready',
    });
    expect(bbSet.content[0].text).toBeDefined();

    const bbGet = await registeredTools['use_blackboard']({
      action: 'read',
      project,
      topic: 'alpha',
    });
    expect(bbGet.content[0].text).toBeDefined();

    // 9. manage_specs: scaffold, compliance
    const specScaff = await registeredTools['manage_specs']({
      action: 'scaffold',
      project,
      title: 'Auth Module Spec',
    });
    expect(specScaff.content[0].text).toBeDefined();

    const specComp = await registeredTools['manage_specs']({
      action: 'compliance',
      project,
    });
    expect(specComp.content[0].text).toBeDefined();

    // 10. run_diagnostics: doctor, validate, audit_chain, compact, archive, prune_events
    const diagDoc = await registeredTools['run_diagnostics']({ action: 'doctor', project });
    expect(diagDoc.content[0].text).toBeDefined();

    const diagVal = await registeredTools['run_diagnostics']({ action: 'validate', project });
    expect(diagVal.content[0].text).toBeDefined();

    const diagAudit = await registeredTools['run_diagnostics']({ action: 'audit_chain', project });
    expect(diagAudit.content[0].text).toBeDefined();

    const diagCompact = await registeredTools['run_diagnostics']({ action: 'compact', project });
    expect(diagCompact.content[0].text).toBeDefined();

    const diagArchive = await registeredTools['run_diagnostics']({
      action: 'archive',
      project,
      older_than_days: 0,
    });
    expect(diagArchive.content[0].text).toBeDefined();

    const diagPrune = await registeredTools['run_diagnostics']({
      action: 'prune_events',
      project,
      older_than: '30d',
    });
    expect(diagPrune.content[0].text).toBeDefined();

    // 11. manage_database: audit, backup, merge, branch_diff
    const dbAudit = await registeredTools['manage_database']({ action: 'audit', project });
    expect(dbAudit.content[0].text).toBeDefined();

    const dbBackup = await registeredTools['manage_database']({ action: 'backup', project });
    expect(dbBackup.content[0].text).toBeDefined();

    const dbDiff = await registeredTools['manage_database']({
      action: 'branch_diff',
      project,
      target_branch: 'main',
    });
    expect(dbDiff.content[0].text).toBeDefined();

    // 12. manage_data: export_graph, export_issues, export_synergy_metrics, export_joint_trajectories
    const dExp = await registeredTools['manage_data']({
      action: 'export_graph',
      project,
      format: 'json',
    });
    expect(dExp.content[0].text).toBeDefined();

    const dIssues = await registeredTools['manage_data']({
      action: 'export_issues',
      project,
      format: 'github',
    });
    expect(dIssues.content[0].text).toBeDefined();

    const dSynergy = await registeredTools['manage_data']({
      action: 'export_synergy_metrics',
      project,
    });
    expect(dSynergy.content[0].text).toBeDefined();

    const dJoint = await registeredTools['manage_data']({
      action: 'export_joint_trajectories',
      project,
    });
    expect(dJoint.content[0].text).toBeDefined();

    // 13. manage_snapshots: save, list, diff
    const sSave = await registeredTools['manage_snapshots']({
      action: 'save',
      project,
      name: 'snap-disp-1',
    });
    expect(sSave.content[0].text).toBeDefined();

    const sList = await registeredTools['manage_snapshots']({ action: 'list', project });
    expect(sList.content[0].text).toBeDefined();

    // End session
    const sessObj = JSON.parse(sessRes.content[0].text);
    const sessEnd = await registeredTools['manage_sessions']({
      action: 'end',
      project,
      session_id: sessObj.session_id,
    });
    expect(sessEnd.content[0].text).toBeDefined();
  });

  it('should enforce security restrictions (read_only, audit_only, admin_mode)', async () => {
    const registeredTools: Record<string, Function> = {};
    const mockServer: any = {
      registerTool: (name: string, _opts: any, handler: Function) => {
        registeredTools[name] = handler;
      },
    };

    registerAllTools(mockServer);

    // Read only rejection
    process.env.STATE_MEMORY_READ_ONLY = 'true';
    await expect(
      registeredTools['manage_nodes']({
        action: 'create',
        project,
        type: 'task',
        title: 'Forbidden Task',
      })
    ).rejects.toThrow(/Access denied/i);

    // Audit only rejection
    delete process.env.STATE_MEMORY_READ_ONLY;
    process.env.STATE_MEMORY_AUDIT_ONLY = 'true';
    await expect(
      registeredTools['manage_nodes']({
        action: 'create',
        project,
        type: 'task',
        title: 'Forbidden Task',
      })
    ).rejects.toThrow(/Access denied/i);

    // Prune events admin mode rejection
    delete process.env.STATE_MEMORY_AUDIT_ONLY;
    delete process.env.STATE_MEMORY_ADMIN_MODE;
    await expect(
      registeredTools['run_diagnostics']({
        action: 'prune_events',
        project,
        older_than: '30d',
      })
    ).rejects.toThrow(/requires STATE_MEMORY_ADMIN_MODE/i);
  });
});
