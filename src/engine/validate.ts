import Database from 'better-sqlite3';

export type ValidateCheck =
  | 'blocked_done'
  | 'orphan_nodes'
  | 'empty_milestones'
  | 'stale_in_progress'
  | 'missing_decisions'
  | 'dangling_edges'
  | 'cycle_check'
  | 'unverified_ui'
  | 'unfulfilled_specs'
  | 'unverified_requirements'
  | 'spec_drift';

export interface ValidateIssue {
  check: string;
  severity: 'error' | 'warning';
  message: string;
  node_ids: string[];
  remediation?: string;
}

export function validateGraph(
  db: Database.Database,
  params: {
    project: string;
    checks?: ValidateCheck[];
    auto_fix?: boolean;
  }
): { passed: boolean; issues: ValidateIssue[]; fixed_count: number } {
  const checksToRun =
    params.checks && params.checks.length > 0
      ? params.checks
      : ([
          'blocked_done',
          'orphan_nodes',
          'empty_milestones',
          'stale_in_progress',
          'missing_decisions',
          'dangling_edges',
          'cycle_check',
          'unverified_ui',
          'unfulfilled_specs',
          'unverified_requirements',
          'spec_drift',
        ] as ValidateCheck[]);

  const issues: ValidateIssue[] = [];
  let fixedCount = 0;

  // Helper to add issue
  const addIssue = (
    check: string,
    severity: 'error' | 'warning',
    message: string,
    nodeIds: string[],
    remediation?: string
  ) => {
    issues.push({ check, severity, message, node_ids: nodeIds, remediation });
  };

  // 1. blocked_done
  if (checksToRun.includes('blocked_done')) {
    const rows = db
      .prepare(
        `
      SELECT DISTINCT t.id, t.title
      FROM nodes t
      JOIN edges e ON (e.source_id = t.id AND e.type = 'depends_on') OR (e.target_id = t.id AND e.type = 'blocks')
      JOIN nodes b ON (e.type = 'depends_on' AND e.target_id = b.id) OR (e.type = 'blocks' AND e.source_id = b.id)
      WHERE t.project = ? AND t.type = 'task' AND t.status = 'done'
        AND b.status != 'done' AND b.status != 'cancelled'
    `
      )
      .all(params.project) as { id: string; title: string }[];

    for (const row of rows) {
      addIssue(
        'blocked_done',
        'error',
        `Task "${row.title}" is marked done but has incomplete dependencies/blockers`,
        [row.id],
        `Consider running update_node(id: "${row.id}", status: "in_progress") or marking blocking dependencies as done.`
      );
    }
  }

  // 2. orphan_nodes
  if (checksToRun.includes('orphan_nodes')) {
    const rows = db
      .prepare(
        `
      SELECT n.id, n.title
      FROM nodes n
      WHERE n.project = ? AND n.type != 'observation' AND NOT EXISTS (
        SELECT 1 FROM edges e WHERE e.project = ? AND (e.source_id = n.id OR e.target_id = n.id)
      )
    `
      )
      .all(params.project, params.project) as { id: string; title: string }[];

    for (const row of rows) {
      addIssue(
        'orphan_nodes',
        'warning',
        `Node "${row.title}" (${row.id}) is an orphan with no connecting relationships`,
        [row.id],
        `Use add_edge to link "${row.id}" to a parent plan/milestone or task, or remove_node if obsolete.`
      );
    }
  }

  // 3. empty_milestones
  if (checksToRun.includes('empty_milestones')) {
    const rows = db
      .prepare(
        `
      SELECT m.id, m.title
      FROM nodes m
      WHERE m.project = ? AND m.type = 'milestone' AND NOT EXISTS (
        SELECT 1 FROM edges e
        WHERE e.project = ? AND e.target_id = m.id AND e.type = 'child_of'
      )
    `
      )
      .all(params.project, params.project) as { id: string; title: string }[];

    for (const row of rows) {
      addIssue(
        'empty_milestones',
        'warning',
        `Milestone "${row.title}" has no associated child tasks`,
        [row.id],
        `Use add_edge(source_id: "<task_id>", target_id: "${row.id}", type: "child_of") to assign tasks.`
      );
    }
  }

  // 4. stale_in_progress
  if (checksToRun.includes('stale_in_progress')) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = db
      .prepare(
        `
      SELECT id, title, updated_at
      FROM nodes
      WHERE project = ? AND type = 'task' AND status = 'in_progress' AND updated_at < ?
    `
      )
      .all(params.project, sevenDaysAgo) as { id: string; title: string; updated_at: string }[];

    for (const row of rows) {
      addIssue(
        'stale_in_progress',
        'warning',
        `Task "${row.title}" has been "in_progress" with no updates for over 7 days`,
        [row.id],
        `Update task progress with update_node or add_note.`
      );
    }
  }

  // 5. missing_decisions
  if (checksToRun.includes('missing_decisions')) {
    const rows = db
      .prepare(
        `
      SELECT t.id, t.title
      FROM nodes t
      WHERE t.project = ? AND t.type = 'task' AND t.status = 'done' AND NOT EXISTS (
        SELECT 1 FROM edges e
        JOIN nodes d ON (e.source_id = d.id OR e.target_id = d.id)
        WHERE e.project = ? AND (e.source_id = t.id OR e.target_id = t.id)
          AND d.type = 'decision'
      )
    `
      )
      .all(params.project, params.project) as { id: string; title: string }[];

    for (const row of rows) {
      addIssue(
        'missing_decisions',
        'warning',
        `Completed task "${row.title}" does not reference any design decisions`,
        [row.id],
        `Link relevant decision nodes using add_edge(type: "decided_in" or "references").`
      );
    }
  }

  // 6. dangling_edges
  if (checksToRun.includes('dangling_edges')) {
    const rows = db
      .prepare(
        `
      SELECT e.id, e.source_id, e.target_id, e.type
      FROM edges e
      WHERE e.project = ? AND (
        NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = e.source_id) OR
        NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = e.target_id)
      )
    `
      )
      .all(params.project) as { id: string; source_id: string; target_id: string; type: string }[];

    if (params.auto_fix && rows.length > 0) {
      db.transaction(() => {
        for (const row of rows) {
          db.prepare('DELETE FROM edges WHERE id = ?').run(row.id);
          fixedCount++;
        }
      })();
    } else {
      for (const row of rows) {
        addIssue(
          'dangling_edges',
          'error',
          `Edge ${row.id} (${row.type}) references non-existent node(s): source ${row.source_id}, target ${row.target_id}`,
          [],
          `Run validate_graph(auto_fix: true) to automatically remove dangling edges.`
        );
      }
    }
  }

  // 7. cycle_check
  if (checksToRun.includes('cycle_check')) {
    const edgeRows = db
      .prepare('SELECT source_id, target_id, type FROM edges WHERE project = ?')
      .all(params.project) as { source_id: string; target_id: string; type: string }[];
    const adj = new Map<string, string[]>();
    const nodeIds = new Set<string>();

    for (const edge of edgeRows) {
      if (['depends_on', 'blocks', 'child_of'].includes(edge.type)) {
        let u = '';
        let v = '';
        if (edge.type === 'depends_on') {
          u = edge.target_id;
          v = edge.source_id;
        } else if (edge.type === 'blocks') {
          u = edge.source_id;
          v = edge.target_id;
        } else if (edge.type === 'child_of') {
          u = edge.source_id;
          v = edge.target_id;
        }
        if (u && v) {
          nodeIds.add(u);
          nodeIds.add(v);
          if (!adj.has(u)) adj.set(u, []);
          adj.get(u)!.push(v);
        }
      }
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycleNodes = new Set<string>();
    let hasCycle = false;

    const dfs = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            cycleNodes.add(node);
            cycleNodes.add(neighbor);
            return true;
          }
        } else if (recStack.has(neighbor)) {
          cycleNodes.add(node);
          cycleNodes.add(neighbor);
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const node of nodeIds) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          hasCycle = true;
        }
      }
    }

    if (hasCycle) {
      addIssue(
        'cycle_check',
        'error',
        `Circular dependencies detected in project graph`,
        Array.from(cycleNodes),
        `Remove cyclic edges using remove_edge.`
      );
    }
  }

  // 8. unverified_ui
  if (checksToRun.includes('unverified_ui')) {
    const rows = db
      .prepare(
        `
      SELECT id, title, metadata, tags
      FROM nodes
      WHERE project = ? AND type = 'task' AND status = 'done'
    `
      )
      .all(params.project) as { id: string; title: string; metadata: string; tags: string }[];

    for (const row of rows) {
      try {
        const tags: string[] = JSON.parse(row.tags || '[]');
        const metadata = JSON.parse(row.metadata || '{}');
        const isUiTask =
          tags.some((tag) =>
            ['ui', 'layout', 'frontend', 'visual', 'css', 'design'].includes(tag.toLowerCase())
          ) || /\b(ui|layout|css|frontend|visual|styles|design)\b/i.test(row.title);

        if (isUiTask) {
          const hasRendersEdge = db
            .prepare(
              `
            SELECT 1 FROM edges
            WHERE project = ? AND type = 'renders_state' AND (source_id = ? OR target_id = ?)
            LIMIT 1
          `
            )
            .get(params.project, row.id, row.id);

          const hasVisualMeta =
            metadata.vision_state_id ||
            metadata.visual_state_ids ||
            metadata.screenshot ||
            metadata.visual_snapshot_name;

          if (!hasRendersEdge && !hasVisualMeta) {
            addIssue(
              'unverified_ui',
              'warning',
              `UI task "${row.title}" is completed but has no renders_state edge or visual state metadata associated.`,
              [row.id],
              `Attach visual snapshot metadata or link renders_state edge using vision-memory-mcp.`
            );
          }
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  // 9. unfulfilled_specs
  if (checksToRun.includes('unfulfilled_specs')) {
    const reqRows = db
      .prepare(
        "SELECT id, title FROM nodes WHERE project = ? AND type = 'requirement' AND status = 'accepted'"
      )
      .all(params.project) as { id: string; title: string }[];

    for (const req of reqRows) {
      const hasSatisfyingTask = db
        .prepare(
          `
        SELECT 1 FROM edges e
        JOIN nodes n ON (e.source_id = n.id OR e.target_id = n.id)
        WHERE e.project = ? AND (
          (e.target_id = ? AND e.type = 'satisfies' AND n.status = 'done') OR
          (e.target_id = ? AND e.type = 'implements') OR
          (e.source_id = ? AND e.type = 'satisfies' AND n.status = 'done')
        )
        LIMIT 1
      `
        )
        .get(params.project, req.id, req.id, req.id);

      if (!hasSatisfyingTask) {
        addIssue(
          'unfulfilled_specs',
          'warning',
          `Requirement "${req.title}" is accepted but has no completed task or code artifact linked.`,
          [req.id],
          `Create a task that satisfies this requirement or link an implementing artifact.`
        );
      }
    }
  }

  // 10. unverified_requirements
  if (checksToRun.includes('unverified_requirements')) {
    const critRows = db
      .prepare(
        "SELECT id, title FROM nodes WHERE project = ? AND type = 'acceptance_criterion' AND status = 'unverified'"
      )
      .all(params.project) as { id: string; title: string }[];

    for (const crit of critRows) {
      const isVerifiedByEdge = db
        .prepare(
          "SELECT 1 FROM edges WHERE project = ? AND target_id = ? AND type = 'verifies' LIMIT 1"
        )
        .get(params.project, crit.id);

      if (!isVerifiedByEdge) {
        addIssue(
          'unverified_requirements',
          'warning',
          `Acceptance criterion "${crit.title}" is unverified.`,
          [crit.id],
          `Run automated tests or visual checks and call verify_requirement.`
        );
      }
    }
  }

  // 11. spec_drift
  if (checksToRun.includes('spec_drift')) {
    const staleSpecs = db
      .prepare(
        "SELECT id, title FROM nodes WHERE project = ? AND type = 'spec' AND status = 'stale'"
      )
      .all(params.project) as { id: string; title: string }[];

    for (const spec of staleSpecs) {
      addIssue(
        'spec_drift',
        'warning',
        `Spec "${spec.title}" source file was modified in Git; graph spec state is stale.`,
        [spec.id],
        `Re-ingest specification using ingest_spec to sync latest requirements.`
      );
    }
  }

  const passed = !issues.some((issue) => issue.severity === 'error');

  return {
    passed,
    issues,
    fixed_count: fixedCount,
  };
}

