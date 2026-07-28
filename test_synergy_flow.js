import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database paths
const stateDbDir = path.resolve(process.cwd(), '.state-memory-mcp/test-synergy-project');
const stateDbPath = path.join(stateDbDir, 'graph.db');
const visionDbPath = path.resolve(process.cwd(), '../vision-memory-mcp/.vision-memory-mcp');

async function testSynergy() {
  console.log("=== STARTING SYNERGY INTEGRATION TEST ===");

  // 1. Ensure state-memory db directory exists
  fs.mkdirSync(stateDbDir, { recursive: true });
  const db = new Database(stateDbPath);

  // Ensure tables exist by running a simple migration if needed (we know they exist since the project is initialized)
  console.log("Connected to state-memory-mcp database.");

  // 2. Start session
  const sessionId = "session-" + Math.random().toString(36).substring(2, 8);
  console.log(`Created simulated session: ${sessionId}`);

  // Create UI Task in state-memory
  const taskId = "task-ui-101";
  db.prepare(`INSERT OR REPLACE INTO nodes (id, type, title, status, project, git_branch, created_at, updated_at, metadata, tags) 
              VALUES (?, 'task', 'Align faction logos on homepage', 'done', 'test-synergy-project', 'main', datetime('now'), datetime('now'), '{}', '["ui"]')`).run(taskId);
  console.log(`Created UI task: ${taskId} ("Align faction logos on homepage") marked as done.`);

  // 3. Run validation (Should fail/warn because it's a UI task marked done without visual verification)
  const { validateGraph } = await import('./dist/lib.js');
  let validation = validateGraph(db, { project: 'test-synergy-project' });
  console.log("Run validation (expected warning for unverified UI):");
  console.log(JSON.stringify(validation.issues.filter(i => i.check === 'unverified_ui'), null, 2));

  // 4. Ingest screenshot in vision-memory with the session_id as trace_id
  const lancedb = await import('../vision-memory-mcp/node_modules/@lancedb/lancedb/dist/index.js');
  const vdb = await lancedb.connect(visionDbPath);
  const table = await vdb.openTable('visual_states');

  const stateId = "vs-" + Math.random().toString(36).substring(2, 8);
  const dummyState = {
    id: stateId,
    dhash: '0'.repeat(64),
    ahash: '0'.repeat(64),
    vector: new Array(512).fill(0.1),
    description: 'Aligned faction logos mockup',
    structured_data: '{}',
    accessibility_tree: '{}',
    thumbnail: '',
    original_dimensions: '{"width":100,"height":100}',
    source_url: '',
    source_agent: 'agent',
    trace_id: sessionId, // synced trace_id!
    git_branch: 'main',
    tags: '[]',
    importance_score: 0.5,
    created_at: Date.now(),
    last_accessed: Date.now(),
    access_count: 1,
    ttl: 0,
  };
  await table.add([dummyState]);
  console.log(`Ingested VisualState into LanceDB: ${stateId} with trace_id: ${sessionId}`);

  // 5. Connect UI Task to VisualState using the new renders_state edge
  db.prepare(`INSERT OR REPLACE INTO nodes (id, type, title, status, project, git_branch, created_at, updated_at, metadata, tags)
              VALUES (?, 'visual_state', 'Aligned faction logos mockup', 'active', 'test-synergy-project', 'main', datetime('now'), datetime('now'), '{}', '[]')`).run(stateId);
  db.prepare(`INSERT OR REPLACE INTO edges (id, source_id, target_id, type, project, git_branch, created_at)
              VALUES ('edge-renders-1', ?, ?, 'renders_state', 'test-synergy-project', 'main', datetime('now'))`).run(taskId, stateId);
  console.log(`Connected task ${taskId} to visual state ${stateId} via 'renders_state' edge.`);

  // 6. Run validation again (should pass!)
  validation = validateGraph(db, { project: 'test-synergy-project' });
  console.log("Run validation again (should clear the unverified UI warning):");
  console.log(JSON.stringify(validation.issues.filter(i => i.check === 'unverified_ui'), null, 2));

  // Cleanup test data
  db.prepare(`DELETE FROM nodes WHERE id IN (?, ?)`).run(taskId, stateId);
  db.prepare(`DELETE FROM edges WHERE id = 'edge-renders-1'`).run();
  await table.delete(`id = '${stateId}'`);
  console.log("Cleaned up test data.");

  console.log("=== INTEGRATION TEST COMPLETED SUCCESSFULLY ===");
}

testSynergy().catch(console.error);
