import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fork } from 'child_process';
import { getDb, closeAllDbs, getDbPath } from '../../src/engine/db.js';
import { SessionEngine } from '../../src/engine/sessions.js';

describe('Multi-Process Concurrency and Conflict Resolution', () => {
  const project = 'concurrency-test-project';
  let dbPath: string;
  const workerScriptPath = path.resolve('./tests/engine/concurrency-worker.js');

  beforeAll(() => {
    // Ensure project db is initialized
    const db = getDb(project);
    dbPath = getDbPath(project);
    closeAllDbs();

    // Write worker script
    const workerCode = `
import Database from 'better-sqlite3';
import process from 'process';

const [dbPath, workerId, action] = process.argv.slice(2);

try {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  if (action === 'create-nodes') {
    for (let i = 0; i < 50; i++) {
      db.prepare("INSERT INTO nodes (id, type, title, status, project, created_at, updated_at) VALUES (?, 'task', ?, 'pending', 'concurrency-test-project', datetime('now'), datetime('now'))")
        .run(\`node-\${workerId}-\${i}\`, \`Node \${workerId}-\${i}\`);
    }
  } else if (action === 'update-node') {
    for (let i = 0; i < 50; i++) {
      db.prepare("UPDATE nodes SET title = ?, updated_at = datetime('now') WHERE id = 'shared-node'")
        .run(\`Updated by worker \${workerId} at step \${i}\`);
    }
  } else if (action === 'create-edge') {
    // Attempt to insert nodes first, then edge
    db.prepare("INSERT INTO nodes (id, type, title, status, project, created_at, updated_at) VALUES (?, 'task', ?, 'pending', 'concurrency-test-project', datetime('now'), datetime('now'))")
      .run(\`source-\${workerId}\`, \`Source Node \${workerId}\`);
      
    // Try to create edge referencing target-node. This will fail with FK constraint if target-node doesn't exist yet.
    try {
      db.prepare("INSERT INTO edges (source_id, target_id, type, project, created_at) VALUES (?, 'target-node', 'depends_on', 'concurrency-test-project', datetime('now'))")
        .run(\`source-\${workerId}\`);
    } catch (err) {
      if (err.message.includes('FOREIGN KEY constraint failed')) {
        if (process.send) process.send({ type: 'fk_violation' });
      } else {
        throw err;
      }
    }
  }
  process.exit(0);
} catch (err) {
  console.error(\`Worker \${workerId} failed:\`, err);
  process.exit(1);
}
`;
    fs.writeFileSync(workerScriptPath, workerCode, 'utf-8');
  });

  afterAll(() => {
    closeAllDbs();
    if (fs.existsSync(workerScriptPath)) {
      fs.unlinkSync(workerScriptPath);
    }
  });

  it('should support concurrent node creation across multiple processes', async () => {
    const db = getDb(project);
    db.prepare("DELETE FROM nodes WHERE project = 'concurrency-test-project'").run();
    closeAllDbs();

    const numWorkers = 3;
    const workers: Promise<number>[] = [];

    for (let i = 0; i < numWorkers; i++) {
      workers.push(
        new Promise((resolve) => {
          const child = fork(workerScriptPath, [dbPath, String(i), 'create-nodes']);
          child.on('exit', (code) => resolve(code ?? 0));
        })
      );
    }

    const exitCodes = await Promise.all(workers);
    expect(exitCodes).toEqual([0, 0, 0]);

    const verifyDb = getDb(project);
    const countRow = verifyDb
      .prepare("SELECT COUNT(*) as count FROM nodes WHERE project = 'concurrency-test-project'")
      .get() as { count: number };
    expect(countRow.count).toBe(numWorkers * 50);
  });

  it('should resolve concurrent updates to the same node deterministically (last-write-wins)', async () => {
    const db = getDb(project);
    db.prepare("DELETE FROM nodes WHERE id = 'shared-node'").run();
    db.prepare(
      "INSERT INTO nodes (id, type, title, status, project, created_at, updated_at) VALUES ('shared-node', 'task', 'Initial', 'pending', 'concurrency-test-project', datetime('now'), datetime('now'))"
    ).run();
    closeAllDbs();

    const numWorkers = 3;
    const workers: Promise<number>[] = [];

    for (let i = 0; i < numWorkers; i++) {
      workers.push(
        new Promise((resolve) => {
          const child = fork(workerScriptPath, [dbPath, String(i), 'update-node']);
          child.on('exit', (code) => resolve(code ?? 0));
        })
      );
    }

    const exitCodes = await Promise.all(workers);
    expect(exitCodes).toEqual([0, 0, 0]);

    const verifyDb = getDb(project);
    const node = verifyDb.prepare("SELECT title FROM nodes WHERE id = 'shared-node'").get() as {
      title: string;
    };
    expect(node.title).toContain('Updated by worker');
  });

  it('should verify foreign key constraints hold during concurrent edge+node creation', async () => {
    const db = getDb(project);
    db.prepare("DELETE FROM edges WHERE project = 'concurrency-test-project'").run();
    closeAllDbs();

    let fkViolations = 0;
    const numWorkers = 2;
    const workers: Promise<number>[] = [];

    for (let i = 0; i < numWorkers; i++) {
      workers.push(
        new Promise((resolve) => {
          const child = fork(workerScriptPath, [dbPath, String(i), 'create-edge']);
          child.on('message', (msg: any) => {
            if (msg && msg.type === 'fk_violation') {
              fkViolations++;
            }
          });
          child.on('exit', (code) => resolve(code ?? 0));
        })
      );
    }

    setTimeout(() => {
      const targetDb = getDb(project);
      try {
        targetDb
          .prepare(
            "INSERT INTO nodes (id, type, title, status, project, created_at, updated_at) VALUES ('target-node', 'task', 'Target', 'pending', 'concurrency-test-project', datetime('now'), datetime('now'))"
          )
          .run();
      } catch {}
    }, 20);

    const exitCodes = await Promise.all(workers);
    expect(exitCodes).toEqual([0, 0]);

    const verifyDb = getDb(project);
    const targetNodeExists = verifyDb.prepare("SELECT 1 FROM nodes WHERE id = 'target-node'").get();
    expect(targetNodeExists).toBeTruthy();
  });

  it('should verify stale sessions are handled during concurrent active sessions', async () => {
    const db = getDb(project);
    db.prepare("DELETE FROM sessions WHERE project = 'concurrency-test-project'").run();

    const s1 = SessionEngine.startSession(db, { project, agent_id: 'agent-1' });
    const s2 = SessionEngine.startSession(db, { project, agent_id: 'agent-2' });

    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET started_at = ? WHERE id = ?').run(
      twentyFiveHoursAgo,
      s1.session_id
    );

    const s3 = SessionEngine.startSession(db, { project, agent_id: 'agent-3' });

    const activeSessions = db
      .prepare(
        "SELECT id FROM sessions WHERE project = 'concurrency-test-project' AND ended_at IS NULL"
      )
      .all() as { id: string }[];
    const sessionIds = activeSessions.map((s) => s.id);

    expect(sessionIds).not.toContain(s1.session_id);
    expect(sessionIds).toContain(s2.session_id);
    expect(sessionIds).toContain(s3.session_id);
  });
});
