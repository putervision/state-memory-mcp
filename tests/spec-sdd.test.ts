import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdownSpec, parseGherkinSpec, ingestSpecFile, exportSpecToFile } from '../src/engine/spec-parser.js';
import { calculateSpecCompliance } from '../src/engine/spec-compliance.js';
import { validateGraph } from '../src/engine/validate.js';
import { getDb } from '../src/engine/db.js';
import { GraphEngine } from '../src/engine/graph.js';
import { EdgeEngine } from '../src/engine/edges.js';

describe('Spec-Driven Development (SDD) Engine', () => {
  let db: Database.Database;
  const project = 'test-sdd-project';

  beforeEach(() => {
    db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  it('should parse Markdown PRDs cleanly', () => {
    const md = `# User Authentication Spec

## Requirement: Password Reset
Users must be able to reset their password via email.

- [ ] Send reset email link
- [x] Validate reset token
`;
    const parsed = parseMarkdownSpec(md);
    expect(parsed.title).toBe('User Authentication Spec');
    expect(parsed.requirements.length).toBe(1);
    expect(parsed.requirements[0].title).toBe('Requirement: Password Reset');
    expect(parsed.requirements[0].criteria.length).toBe(2);
    expect(parsed.requirements[0].criteria[0].status).toBe('unverified');
    expect(parsed.requirements[0].criteria[1].status).toBe('verified');
  });

  it('should parse Gherkin .feature BDD specs cleanly', () => {
    const gherkin = `Feature: User Login

  Scenario: Successful Login with Valid Credentials
    Given the user is on the login page
    When the user enters valid credentials
    Then the user should be redirected to dashboard
`;
    const parsed = parseGherkinSpec(gherkin);
    expect(parsed.title).toBe('User Login');
    expect(parsed.requirements.length).toBe(1);
    expect(parsed.requirements[0].title).toBe('Successful Login with Valid Credentials');
    expect(parsed.requirements[0].criteria.length).toBe(3);
    expect(parsed.requirements[0].criteria[0].title).toBe('Given the user is on the login page');
  });

  it('should ingest and export spec files to/from graph memory', () => {
    const tmpFile = path.join(process.cwd(), '.tmp_test_spec.md');
    fs.writeFileSync(
      tmpFile,
      `# Payment Gateway Spec

## Process Payment
Handle credit card charges cleanly.

- [ ] Validate card number
- [ ] Charge card via Stripe
`,
      'utf-8'
    );

    try {
      const res = ingestSpecFile(db, { filePath: tmpFile, project, format: 'markdown' });
      expect(res.requirements_count).toBe(1);
      expect(res.criteria_count).toBe(2);

      const exported = exportSpecToFile(db, { specId: res.spec_node_id, project, format: 'markdown' });
      expect(exported).toContain('# Payment Gateway Spec');
      expect(exported).toContain('## Process Payment');
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  it('should calculate Spec Compliance metrics and validate graph SDD rules', () => {
    const spec = GraphEngine.addNode({ type: 'spec', title: 'Core API Spec', project, status: 'approved' });
    const req = GraphEngine.addNode({ type: 'requirement', title: 'API Authentication', project, status: 'accepted' });
    const crit = GraphEngine.addNode({ type: 'acceptance_criterion', title: 'Validate JWT Token', project, status: 'unverified' });

    EdgeEngine.addEdge({ source_id: spec.id, target_id: req.id, type: 'specifies', project, properties: {} });
    EdgeEngine.addEdge({ source_id: crit.id, target_id: req.id, type: 'child_of', project, properties: {} });

    // Initial compliance report should show unfulfilled requirement and unverified criterion
    let report = calculateSpecCompliance(db, project);
    expect(report.coverage_percentage).toBe(0);
    expect(report.unfulfilled_requirements.length).toBe(1);

    // Create completed task satisfying requirement
    const task = GraphEngine.addNode({ type: 'task', title: 'Implement JWT Auth', project, status: 'done' });
    EdgeEngine.addEdge({ source_id: task.id, target_id: req.id, type: 'satisfies', project, properties: {} });

    // Mark criterion as verified
    GraphEngine.updateNode({ id: crit.id, project, status: 'verified' });

    report = calculateSpecCompliance(db, project);
    expect(report.coverage_percentage).toBe(100);
    expect(report.verification_percentage).toBe(100);
    expect(report.is_compliant).toBe(true);

    const val = validateGraph(db, { project, checks: ['unfulfilled_specs', 'unverified_requirements', 'spec_drift'] });
    expect(val.passed).toBe(true);
    expect(val.issues.length).toBe(0);
  });
});
