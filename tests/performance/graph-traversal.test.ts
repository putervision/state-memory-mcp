import { describe, it, expect, afterAll } from 'vitest';
import { QueryEngine } from '../../src/engine/queries.js';
import { batchCreateNodes } from '../../src/engine/batch.js';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { getProjectSummary } from '../../src/engine/analytics/dependencies.js';

describe('Performance Benchmarking Test Suite (1,000+ Node Scalability)', () => {
  const project = 'perf-benchmark-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should benchmark batch node creation throughput for 1,000 nodes', () => {
    const db = getDb(project);
    let totalCreated = 0;

    const startTime = performance.now();
    for (let batch = 0; batch < 10; batch++) {
      const nodesInput = Array.from({ length: 100 }, (_, i) => {
        const index = batch * 100 + i;
        return {
          type: 'task' as const,
          title: `Benchmark Task ${index}`,
          status: index % 2 === 0 ? 'done' : 'pending',
          tags: ['perf', `batch-${batch}`],
          metadata: { index, load: 'benchmark' },
        };
      });

      const result = batchCreateNodes(db, {
        project,
        nodes: nodesInput,
      });
      totalCreated += result.created_nodes.length;
    }
    const durationMs = performance.now() - startTime;

    expect(totalCreated).toBe(1000);
    // Ensure creation of 1,000 nodes finishes in under 3.5 seconds
    expect(durationMs).toBeLessThan(3500);
  });

  it('should benchmark listNodes querying under 1,000 nodes', async () => {
    const startTime = performance.now();
    const result = await QueryEngine.listNodes({
      project,
      limit: 500,
    });
    const durationMs = performance.now() - startTime;

    expect(result.nodes.length).toBeGreaterThanOrEqual(500);
    // Ensure listNodes query finishes within reasonable SLA under test concurrency
    const isCoverage =
      !!process.env.V8_COVERAGE || !!process.env.NODE_V8_COVERAGE || !!process.env.VITEST_COVERAGE;
    expect(durationMs).toBeLessThan(isCoverage ? 2500 : 2000);
  });

  it('should benchmark get_project_summary calculation under 1,000 nodes', () => {
    const startTime = performance.now();
    const summary = getProjectSummary({ project });
    const durationMs = performance.now() - startTime;

    expect(summary.progress.total_tasks).toBeGreaterThanOrEqual(1000);
    // Ensure project summary calculation finishes within reasonable SLA under test concurrency
    const isCoverage =
      !!process.env.V8_COVERAGE || !!process.env.NODE_V8_COVERAGE || !!process.env.VITEST_COVERAGE;
    expect(durationMs).toBeLessThan(isCoverage ? 1000 : 800);
  });
});
