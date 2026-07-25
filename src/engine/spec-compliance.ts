import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { ingestSpecFile } from './spec-parser.js';
import { logger } from '../utils/logger.js';

export interface SpecComplianceReport {
  project: string;
  total_specs: number;
  total_requirements: number;
  satisfied_requirements_count: number;
  unfulfilled_requirements: Array<{ id: string; title: string; spec_id?: string }>;
  total_criteria: number;
  verified_criteria_count: number;
  unverified_criteria: Array<{ id: string; title: string; requirement_id?: string }>;
  coverage_percentage: number;
  verification_percentage: number;
  is_compliant: boolean;
}

/**
 * Calculates real-time Spec Compliance metrics across graph requirements and acceptance criteria.
 */
export function calculateSpecCompliance(
  db: Database.Database,
  project: string
): SpecComplianceReport {
  const specRows = db
    .prepare("SELECT id, title FROM nodes WHERE project = ? AND type = 'spec'")
    .all(project) as { id: string; title: string }[];

  const reqRows = db
    .prepare("SELECT id, title, metadata FROM nodes WHERE project = ? AND type = 'requirement'")
    .all(project) as { id: string; title: string; metadata: string }[];

  const critRows = db
    .prepare(
      "SELECT id, title, status, metadata FROM nodes WHERE project = ? AND type = 'acceptance_criterion'"
    )
    .all(project) as { id: string; title: string; status: string; metadata: string }[];

  let satisfiedCount = 0;
  const unfulfilledReqs: Array<{ id: string; title: string; spec_id?: string }> = [];

  for (const req of reqRows) {
    let specId: string | undefined;
    try {
      const meta = JSON.parse(req.metadata || '{}');
      specId = meta.spec_id;
    } catch {}

    // Check if requirement is satisfied by a done task or artifact via 'satisfies' or 'implements'
    const isSatisfied = db
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
      .get(project, req.id, req.id, req.id);

    if (isSatisfied) {
      satisfiedCount++;
    } else {
      unfulfilledReqs.push({ id: req.id, title: req.title, spec_id: specId });
    }
  }

  let verifiedCount = 0;
  const unverifiedCrits: Array<{ id: string; title: string; requirement_id?: string }> = [];

  for (const crit of critRows) {
    let reqId: string | undefined;
    try {
      const meta = JSON.parse(crit.metadata || '{}');
      reqId = meta.requirement_id;
    } catch {}

    const isVerifiedInStatus = crit.status === 'verified';
    const isVerifiedByEdge = db
      .prepare(
        `
      SELECT 1 FROM edges
      WHERE project = ? AND target_id = ? AND type = 'verifies'
      LIMIT 1
    `
      )
      .get(project, crit.id);

    if (isVerifiedInStatus || isVerifiedByEdge) {
      verifiedCount++;
    } else {
      unverifiedCrits.push({ id: crit.id, title: crit.title, requirement_id: reqId });
    }
  }

  const reqTotal = reqRows.length;
  const critTotal = critRows.length;

  const coveragePercentage = reqTotal > 0 ? Math.round((satisfiedCount / reqTotal) * 100) : 100;
  const verificationPercentage =
    critTotal > 0 ? Math.round((verifiedCount / critTotal) * 100) : 100;

  const isCompliant = unfulfilledReqs.length === 0 && unverifiedCrits.length === 0;

  return {
    project,
    total_specs: specRows.length,
    total_requirements: reqTotal,
    satisfied_requirements_count: satisfiedCount,
    unfulfilled_requirements: unfulfilledReqs,
    total_criteria: critTotal,
    verified_criteria_count: verifiedCount,
    unverified_criteria: unverifiedCrits,
    coverage_percentage: coveragePercentage,
    verification_percentage: verificationPercentage,
    is_compliant: isCompliant,
  };
}

/**
 * Scaffolds a baseline specification template in the project and ingests it into memory.
 */
export function scaffoldSpecTemplate(
  db: Database.Database,
  params: {
    project: string;
    cwd?: string;
    title?: string;
  }
): { spec_path: string; spec_node_id: string } {
  const targetDir = path.join(params.cwd || process.cwd(), '.specs');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const specTitle = params.title || 'Feature Specification';
  const fileName = `${specTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
  const fullPath = path.join(targetDir, fileName);

  if (!fs.existsSync(fullPath)) {
    const templateContent = `# ${specTitle}

## Overview
Brief description of the feature goals and rationale.

## Core Requirements

### Requirement 1: Primary Functionality
Implement the main feature logic according to design.

- [ ] Core API or UI handler is fully operational
- [ ] Error conditions are cleanly caught and handled

### Requirement 2: Quality & Verification
Ensure feature is thoroughly tested and verified.

- [ ] Automated unit test suite passes cleanly
- [ ] UI visual layout adheres to design mockups
`;
    fs.writeFileSync(fullPath, templateContent, 'utf-8');
  }

  const ingestRes = ingestSpecFile(db, {
    filePath: fullPath,
    project: params.project,
    format: 'markdown',
  });

  return {
    spec_path: fullPath,
    spec_node_id: ingestRes.spec_node_id,
  };
}
