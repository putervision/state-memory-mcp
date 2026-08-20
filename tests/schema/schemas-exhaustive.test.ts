import { describe, it, expect } from 'vitest';
import * as schemas from '../../src/schema/schemas.js';

describe('All Schemas Exhaustive Test Suite', () => {
  it('should validate and parse schemas properly', () => {
    // AddNodeSchema
    expect(schemas.AddNodeSchema.safeParse({ type: 'task', title: 'Task Title' }).success).toBe(
      true
    );
    expect(
      schemas.AddNodeSchema.safeParse({ type: 'invalid_type', title: 'Invalid' }).success
    ).toBe(false);

    // AddEdgeSchema
    expect(
      schemas.AddEdgeSchema.safeParse({ source_id: 'a', target_id: 'b', type: 'depends_on' })
        .success
    ).toBe(true);

    // VCSBranchSyncSchema & VCSMergeResolutionSchema
    expect(schemas.VCSBranchSyncSchema.safeParse({ target_branch: 'main' }).success).toBe(true);
    expect(
      schemas.VCSMergeResolutionSchema.safeParse({
        source_branch: 'feature',
        target_branch: 'main',
        strategy: 'auto_accept',
      }).success
    ).toBe(true);

    // CompactGraphSchema & ArchiveCompletedNodesSchema
    expect(schemas.CompactGraphSchema.safeParse({}).success).toBe(true);
    expect(schemas.ArchiveCompletedNodesSchema.safeParse({ older_than_days: 10 }).success).toBe(
      true
    );

    // PruneEventsSchema
    expect(schemas.PruneEventsSchema.safeParse({ older_than: '30d' }).success).toBe(true);

    // ValueMetricsSchema
    expect(schemas.ValueMetricsSchema.safeParse({}).success).toBe(true);

    // GetContextSnapshotSchema
    expect(schemas.GetContextSnapshotSchema.safeParse({ focus_node_id: 'n1' }).success).toBe(true);

    // PlanAndDecomposeFeatureSchema
    expect(
      schemas.PlanAndDecomposeFeatureSchema.safeParse({
        title: 'Feature',
        subtasks: [{ title: 'Sub 1' }],
      }).success
    ).toBe(true);

    // ScaffoldTemplateSchema
    expect(
      schemas.ScaffoldTemplateSchema.safeParse({ template: 'rfc', name: 'AuthRFC' }).success
    ).toBe(true);
    expect(
      schemas.ScaffoldTemplateSchema.safeParse({ template: 'invalid', name: 'Bad' }).success
    ).toBe(false);
  });
});
