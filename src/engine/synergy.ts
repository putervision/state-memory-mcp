import { McpError, ErrorCode } from '../utils/errors.js';
import { GraphEngine } from './graph.js';
import { EdgeEngine } from './edges.js';
import { getDb, getProjectSlug, resolveProjectRoot } from './db.js';
import { redactData } from '../utils/redact.js';
import path from 'path';
import fs from 'fs';

export class SynergyEngine {
  static linkVisualState(params: {
    project?: string;
    target_id: string;
    visual_state_id: string;
    relationship?: string;
    visual_description?: string;
    source_url?: string;
    metadata?: Record<string, unknown>;
  }) {
    const projectSlug = getProjectSlug(params.project);
    const targetId = params.target_id;
    const visualStateId = params.visual_state_id;
    const relationship = params.relationship || 'renders_state';
    const visualDescription = params.visual_description || `Visual State ${visualStateId}`;
    const sourceUrl = params.source_url || '';
    const metadata = params.metadata || {};

    if (!targetId || !visualStateId) {
      throw new McpError(ErrorCode.InvalidRequest, 'target_id and visual_state_id are required.');
    }

    // 1. Ensure target node exists
    const targetNode = GraphEngine.getNode({
      project: projectSlug,
      id: targetId,
      include_edges: false,
    });
    if (!targetNode) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Target node ${targetId} not found in project ${projectSlug}.`
      );
    }

    let visualNodeObj: any = GraphEngine.getNode({
      project: projectSlug,
      id: visualStateId,
      include_edges: false,
    });
    if (!visualNodeObj) {
      visualNodeObj = GraphEngine.addNode({
        project: projectSlug,
        type: 'visual_state' as any,
        title: visualDescription,
        status: 'active',
        metadata: redactData({
          visual_state_id: visualStateId,
          description: visualDescription,
          source_url: sourceUrl,
          ...metadata,
        }),
      });
    }

    const visualStateNodeId = visualNodeObj.node ? visualNodeObj.node.id : visualNodeObj.id;
    const targetNodeId = targetNode.node ? targetNode.node.id : (targetNode as any).id;

    // 2. Add edge connecting target to visual_state (or vice versa for blocked_by_visual_state)
    const isBlockedBy = relationship === 'blocked_by_visual_state';
    const actualSource = isBlockedBy
      ? targetNodeId
      : relationship === 'renders_state' || relationship === 'verifies_visual_state'
        ? targetNodeId
        : visualStateNodeId;
    const actualTarget = isBlockedBy
      ? visualStateNodeId
      : relationship === 'renders_state' || relationship === 'verifies_visual_state'
        ? visualStateNodeId
        : targetNodeId;

    const edge = EdgeEngine.addEdge({
      project: projectSlug,
      source_id: actualSource,
      target_id: actualTarget,
      type: relationship as any,
    });

    return {
      success: true,
      project: projectSlug,
      edge_id: edge.id,
      relationship,
      source_id: actualSource,
      target_id: actualTarget,
      visual_state_id: visualStateId,
    };
  }

  static async exportJointTrajectories(params: {
    project?: string;
    session_id?: string;
    limit?: number;
  }) {
    const projectSlug = getProjectSlug(params.project);
    const sessionId = params.session_id;
    const limit = params.limit || 100;
    const db = getDb(projectSlug);

    // Fetch state memory events
    let query = `SELECT id, event_type, entity_type, entity_id, before_state, after_state, timestamp, session_id FROM events WHERE project = ?`;
    const queryParams: any[] = [projectSlug];

    if (sessionId) {
      query += ` AND session_id = ?`;
      queryParams.push(sessionId);
    }
    query += ` ORDER BY timestamp ASC LIMIT ?`;
    queryParams.push(limit);

    const events = db.prepare(query).all(...queryParams) as any[];

    // Attempt to inspect vision memory LanceDB table if present
    const projectRoot = resolveProjectRoot(params.project);
    const visionDbDir = process.env.LANCEDB_PATH
      ? path.isAbsolute(process.env.LANCEDB_PATH)
        ? process.env.LANCEDB_PATH
        : path.resolve(projectRoot, process.env.LANCEDB_PATH)
      : path.join(projectRoot, '.vision-memory-mcp');
    let visualStates: any[] = [];
    let visionMemoryStatus: 'connected' | 'offline' | 'schema_mismatch' = 'offline';

    if (fs.existsSync(visionDbDir)) {
      try {
        // @ts-expect-error - optional module
        const lancedb = await import('@lancedb/lancedb');
        const vdb = await lancedb.connect(visionDbDir);
        const tables = await vdb.tableNames();
        if (tables.includes('visual_states')) {
          const table = await vdb.openTable('visual_states');
          visualStates = await table.query().limit(limit).toArray();
          if (sessionId) {
            visualStates = visualStates.filter((s: any) => s.trace_id === sessionId);
          }
          visionMemoryStatus = 'connected';
        } else {
          visionMemoryStatus = 'schema_mismatch';
        }
      } catch {
        visionMemoryStatus = 'offline';
      }
    }

    const steps: any[] = [];
    events.forEach((ev: any) => {
      let afterState = {};
      try {
        afterState = redactData(JSON.parse(ev.after_state || '{}'));
      } catch {
        // Ignore JSON parse errors on after_state
      }

      steps.push({
        step_index: 0,
        timestamp: new Date(ev.timestamp).getTime() || Date.now(),
        iso_timestamp: ev.timestamp,
        source: 'state_memory',
        session_id: ev.session_id || sessionId || '',
        event_type: ev.event_type,
        entity_type: ev.entity_type,
        entity_id: ev.entity_id,
        after_state: afterState,
      });
    });

    visualStates.forEach((vs: any) => {
      let groundedElements: any[] = [];
      try {
        groundedElements =
          typeof vs.grounded_elements === 'string'
            ? JSON.parse(vs.grounded_elements || '[]')
            : vs.grounded_elements || [];
      } catch {}

      let tags: string[] = [];
      try {
        tags = typeof vs.tags === 'string' ? JSON.parse(vs.tags || '[]') : vs.tags || [];
      } catch {}

      steps.push({
        step_index: 0,
        timestamp: vs.created_at || Date.now(),
        iso_timestamp: new Date(vs.created_at || Date.now()).toISOString(),
        source: 'vision_memory',
        session_id: vs.trace_id || sessionId || '',
        visual_state_id: vs.id,
        description: redactData(vs.description || ''),
        source_url: vs.source_url || '',
        importance_score: vs.importance_score || 0.5,
        grounded_elements: groundedElements,
        tags: tags,
      });
    });

    steps.sort((a, b) => a.timestamp - b.timestamp);
    steps.forEach((step, idx) => {
      step.step_index = idx + 1;
    });

    return {
      session_id: sessionId || 'all',
      project: projectSlug,
      vision_memory_status: visionMemoryStatus,
      total_steps: steps.length,
      steps,
    };
  }

  static async getSynergyMetrics(params: { project?: string }) {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const totalTasks =
      (
        db
          .prepare(`SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'task'`)
          .get(projectSlug) as any
      )?.count || 0;
    const completedTasks =
      (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'task' AND status = 'done'`
          )
          .get(projectSlug) as any
      )?.count || 0;

    const uiVerifiedTasks =
      (
        db
          .prepare(
            `
      SELECT COUNT(DISTINCT n.id) as count FROM nodes n
      JOIN edges e ON (n.id = e.source_id OR n.id = e.target_id)
      WHERE n.project = ? AND n.type = 'task' AND n.status = 'done'
        AND e.type IN ('renders_state', 'verifies_visual_state')
    `
          )
          .get(projectSlug) as any
      )?.count || 0;

    const activeVisualBlockers =
      (
        db
          .prepare(
            `
      SELECT COUNT(*) as count FROM edges WHERE project = ? AND type = 'blocked_by_visual_state'
    `
          )
          .get(projectSlug) as any
      )?.count || 0;

    // Check vision memory metrics if accessible
    const projectRoot = resolveProjectRoot(params.project);
    const visionDbDir = process.env.LANCEDB_PATH
      ? path.isAbsolute(process.env.LANCEDB_PATH)
        ? process.env.LANCEDB_PATH
        : path.resolve(projectRoot, process.env.LANCEDB_PATH)
      : path.join(projectRoot, '.vision-memory-mcp');
    let totalVisualStates = 0;
    let visionMemoryStatus: 'connected' | 'offline' | 'schema_mismatch' = 'offline';

    if (fs.existsSync(visionDbDir)) {
      try {
        // @ts-expect-error - optional module
        const lancedb = await import('@lancedb/lancedb');
        const vdb = await lancedb.connect(visionDbDir);
        const tables = await vdb.tableNames();
        if (tables.includes('visual_states')) {
          const table = await vdb.openTable('visual_states');
          totalVisualStates = await table.countRows();
          visionMemoryStatus = 'connected';
        } else {
          visionMemoryStatus = 'schema_mismatch';
        }
      } catch {
        visionMemoryStatus = 'offline';
      }
    }

    const uiVerificationRatio = completedTasks > 0 ? (uiVerifiedTasks / completedTasks) * 100 : 100;

    return {
      project: projectSlug,
      state_memory: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        ui_verified_tasks: uiVerifiedTasks,
        ui_verification_ratio_pct: Math.round(uiVerificationRatio * 10) / 10,
        active_visual_blockers: activeVisualBlockers,
      },
      vision_memory: {
        status: visionMemoryStatus,
        total_visual_states: totalVisualStates,
      },
      synergy_health:
        activeVisualBlockers === 0 &&
        uiVerificationRatio >= 80 &&
        visionMemoryStatus === 'connected'
          ? 'EXCELLENT'
          : visionMemoryStatus === 'offline'
            ? 'DEGRADED_OFFLINE'
            : 'NEEDS_ATTENTION',
    };
  }
}
