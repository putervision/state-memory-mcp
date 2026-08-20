import { describe, it, expect } from 'vitest';
import * as s from '../../src/schema/schemas.js';

describe('Exhaustive Schema Branch Coverage Test Suite', () => {
  it('should test MetadataSchema and PropertiesSchema branches (valid, oversized, and circular)', () => {
    // Valid
    expect(s.MetadataSchema.safeParse({ key: 'val' }).success).toBe(true);
    expect(s.PropertiesSchema.safeParse({ weight: 10 }).success).toBe(true);

    // Oversized > 512000 chars
    const oversized: any = { data: 'x'.repeat(512001) };
    expect(s.MetadataSchema.safeParse(oversized).success).toBe(false);
    expect(s.PropertiesSchema.safeParse(oversized).success).toBe(false);

    // Circular reference triggering catch block
    const circular: any = {};
    circular.self = circular;
    expect(s.MetadataSchema.safeParse(circular).success).toBe(false);
    expect(s.PropertiesSchema.safeParse(circular).success).toBe(false);
  });

  it('should test all schema objects with valid, missing, and invalid parameter branches', () => {
    // AddNodeSchema
    expect(s.AddNodeSchema.safeParse({ type: 'task', title: 'Task 1' }).success).toBe(true);
    expect(s.AddNodeSchema.safeParse({ type: 'task', title: '' }).success).toBe(false);
    expect(s.AddNodeSchema.safeParse({ type: 'invalid', title: 'Task 1' }).success).toBe(false);
    expect(
      s.AddNodeSchema.safeParse({
        type: 'decision',
        title: 'Dec 1',
        metadata: { opt: true },
        tags: ['tag1'],
      }).success
    ).toBe(true);

    // GetNodeSchema
    expect(s.GetNodeSchema.safeParse({ id: '01M0BW90SSZHT94MB7DBW4R9RT' }).success).toBe(true);
    expect(s.GetNodeSchema.safeParse({ id: '' }).success).toBe(false);
    expect(s.GetNodeSchema.safeParse({ id: 'node-1', include_edges: true }).success).toBe(true);

    // UpdateNodeSchema
    expect(s.UpdateNodeSchema.safeParse({ id: 'node-1', status: 'done' }).success).toBe(true);
    expect(s.UpdateNodeSchema.safeParse({ id: '', status: 'done' }).success).toBe(false);
    expect(s.UpdateNodeSchema.safeParse({ id: 'node-1', title: 'New', tags: ['t2'] }).success).toBe(
      true
    );

    // RemoveNodeSchema
    expect(s.RemoveNodeSchema.safeParse({ id: 'node-1' }).success).toBe(true);
    expect(s.RemoveNodeSchema.safeParse({ id: '' }).success).toBe(false);

    // AddEdgeSchema & RemoveEdgeSchema
    expect(
      s.AddEdgeSchema.safeParse({ source_id: 's', target_id: 't', type: 'depends_on' }).success
    ).toBe(true);
    expect(
      s.AddEdgeSchema.safeParse({ source_id: '', target_id: 't', type: 'depends_on' }).success
    ).toBe(false);
    expect(
      s.AddEdgeSchema.safeParse({ source_id: 's', target_id: '', type: 'depends_on' }).success
    ).toBe(false);
    expect(
      s.AddEdgeSchema.safeParse({ source_id: 's', target_id: 't', type: 'invalid_edge' }).success
    ).toBe(false);
    expect(
      s.RemoveEdgeSchema.safeParse({ source_id: 's', target_id: 't', type: 'depends_on' }).success
    ).toBe(true);

    // ListNodesSchema & SearchNodesSchema
    expect(s.ListNodesSchema.safeParse({}).success).toBe(true);
    expect(
      s.ListNodesSchema.safeParse({
        type: 'task',
        status: 'pending',
        limit: 10,
        offset: 0,
        compact: true,
        tags: ['a'],
      }).success
    ).toBe(true);
    expect(s.SearchNodesSchema.safeParse({ query: 'search' }).success).toBe(true);
    expect(s.SearchNodesSchema.safeParse({ query: '', limit: 5, algorithm: 'tfidf' }).success).toBe(
      false
    );

    // GetSubgraphSchema & TraceDependenciesSchema
    expect(
      s.GetSubgraphSchema.safeParse({
        root_id: 'n1',
        depth: 2,
        edge_types: ['depends_on'],
        node_types: ['task'],
      }).success
    ).toBe(true);
    expect(s.GetSubgraphSchema.safeParse({ root_id: '' }).success).toBe(false);
    expect(
      s.TraceDependenciesSchema.safeParse({ node_id: 'n1', direction: 'downstream' }).success
    ).toBe(true);
    expect(
      s.TraceDependenciesSchema.safeParse({ node_id: 'n1', direction: 'invalid' }).success
    ).toBe(false);

    // Sessions & Events
    expect(s.StartSessionSchema.safeParse({ agent_id: 'agent' }).success).toBe(true);
    expect(s.EndSessionSchema.safeParse({ session_id: 'sess' }).success).toBe(true);
    expect(s.ListSessionsSchema.safeParse({ limit: 10, active: true }).success).toBe(true);
    expect(
      s.GetEventLogSchema.safeParse({ limit: 5, entity_id: 'e1', event_type: 'node_created' })
        .success
    ).toBe(true);

    // Snapshots
    expect(s.SaveSnapshotSchema.safeParse({ force: true }).success).toBe(true);
    expect(
      s.DiffSnapshotsSchema.safeParse({ snapshot_id_a: 'a', snapshot_id_b: 'b' }).success
    ).toBe(true);
    expect(s.DiffSnapshotsSchema.safeParse({ snapshot_id_a: '', snapshot_id_b: 'b' }).success).toBe(
      false
    );

    // VCS & Database
    expect(s.VCSBranchSyncSchema.safeParse({ target_branch: 'main' }).success).toBe(true);
    expect(
      s.VCSMergeResolutionSchema.safeParse({
        source_branch: 'feat',
        target_branch: 'main',
        strategy: 'auto_accept',
      }).success
    ).toBe(true);
    expect(
      s.VCSMergeResolutionSchema.safeParse({ source_branch: '', target_branch: 'main' }).success
    ).toBe(false);
    expect(s.BackupProjectDbSchema.safeParse({ out: 'bk.db' }).success).toBe(true);
    expect(s.RestoreProjectDbSchema.safeParse({ backupPath: 'bk.db' }).success).toBe(true);
    expect(s.MergeProjectDbSchema.safeParse({ sourcePath: 'other.db', force: true }).success).toBe(
      true
    );
  });
});
