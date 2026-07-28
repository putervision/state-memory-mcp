import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { GraphEngine } from '../engine/graph.js';
import { EdgeEngine } from '../engine/edges.js';
import { getDb, getProjectSlug, resolveProjectRoot } from '../engine/db.js';
import { redactData } from '../utils/redact.js';
import path from 'path';
import fs from 'fs';

export const synergyHandlers = {
  link_visual_state: (args: any) => {
    const projectSlug = getProjectSlug(args?.project);
    const targetId = args?.target_id;
    const visualStateId = args?.visual_state_id;
    const relationship = args?.relationship || 'renders_state';
    const visualDescription = args?.visual_description || `Visual State ${visualStateId}`;
    const sourceUrl = args?.source_url || '';
    const metadata = args?.metadata || {};

    if (!targetId || !visualStateId) {
      throw new McpError(ErrorCode.InvalidRequest, 'target_id and visual_state_id are required.');
    }

    const db = getDb(projectSlug);

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

    // 3. Add edge connecting target to visual_state (or vice versa for blocked_by_visual_state)
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
  },

  export_joint_trajectories: async (args: any) => {
    const projectSlug = getProjectSlug(args?.project);
    const sessionId = args?.session_id;
    const limit = args?.limit || 100;
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
    const projectRoot = resolveProjectRoot(args?.project);
    const visionDbDir = path.join(projectRoot, '.vision-memory-mcp');
    let visualStates: any[] = [];

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
        }
      } catch (err) {
        // Gracefully ignore if LanceDB isn't accessible directly
      }
    }

    const steps: any[] = [];
    events.forEach((ev: any, idx: number) => {
      let afterState = {};
      try {
        afterState = redactData(JSON.parse(ev.after_state || '{}'));
      } catch {}

      steps.push({
        step_index: idx + 1,
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

    visualStates.forEach((vs: any, idx: number) => {
      steps.push({
        step_index: steps.length + idx + 1,
        timestamp: vs.created_at || Date.now(),
        iso_timestamp: new Date(vs.created_at || Date.now()).toISOString(),
        source: 'vision_memory',
        session_id: vs.trace_id || sessionId || '',
        visual_state_id: vs.id,
        description: redactData(vs.description || ''),
        source_url: vs.source_url || '',
        importance_score: vs.importance_score || 0.5,
      });
    });

    steps.sort((a, b) => a.timestamp - b.timestamp);

    return {
      session_id: sessionId || 'all',
      project: projectSlug,
      total_steps: steps.length,
      steps,
    };
  },

  get_synergy_metrics: async (args: any) => {
    const projectSlug = getProjectSlug(args?.project);
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
    const projectRoot = resolveProjectRoot(args?.project);
    const visionDbDir = path.join(projectRoot, '.vision-memory-mcp');
    let totalVisualStates = 0;

    if (fs.existsSync(visionDbDir)) {
      try {
        // @ts-expect-error - optional module
        const lancedb = await import('@lancedb/lancedb');
        const vdb = await lancedb.connect(visionDbDir);
        if ((await vdb.tableNames()).includes('visual_states')) {
          const table = await vdb.openTable('visual_states');
          totalVisualStates = await table.countRows();
        }
      } catch {}
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
        total_visual_states: totalVisualStates,
      },
      synergy_health:
        activeVisualBlockers === 0 && uiVerificationRatio >= 80 ? 'EXCELLENT' : 'NEEDS_ATTENTION',
    };
  },
};
