import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { GraphEngine } from './graph.js';
import { EdgeEngine } from './edges.js';
import { BaseNode, NodeType, EdgeType } from '../schema/types.js';
import { validatePath, loadPathConfig } from '../utils/path-validator.js';
import { resolveProjectRoot } from './db.js';
import { logger } from '../utils/logger.js';

export interface ParsedCriterion {
  title: string;
  status: 'unverified' | 'verified';
}

export interface ParsedRequirement {
  title: string;
  description: string;
  criteria: ParsedCriterion[];
}

export interface ParsedSpec {
  title: string;
  description: string;
  format: 'markdown' | 'gherkin';
  requirements: ParsedRequirement[];
}

/**
 * Parses Markdown PRDs and OpenSpec documents into a structured spec tree.
 */
export function parseMarkdownSpec(content: string): ParsedSpec {
  const lines = content.split('\n');
  let specTitle = 'Untitled Specification';
  let specDescLines: string[] = [];
  let currentReq: ParsedRequirement | null = null;
  const requirements: ParsedRequirement[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Spec Title (# Title)
    if (trimmed.startsWith('# ') && specTitle === 'Untitled Specification') {
      specTitle = trimmed.substring(2).trim();
      continue;
    }

    // Requirement Header (## Header or ### Header)
    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      if (currentReq) {
        requirements.push(currentReq);
      }
      const reqTitle = trimmed.replace(/^#+\s*/, '').trim();
      currentReq = {
        title: reqTitle,
        description: '',
        criteria: [],
      };
      continue;
    }

    // Acceptance Criterion (- [ ] or - [x] or * [ ])
    const checkMatch = trimmed.match(/^[-*]\s*\[([ xX])\]\s*(.+)$/);
    if (checkMatch && currentReq) {
      const isChecked = checkMatch[1].toLowerCase() === 'x';
      const critText = checkMatch[2].trim();
      currentReq.criteria.push({
        title: critText,
        status: isChecked ? 'verified' : 'unverified',
      });
      continue;
    }

    // Body content
    if (currentReq) {
      if (trimmed.length > 0) {
        currentReq.description += (currentReq.description ? '\n' : '') + trimmed;
      }
    } else {
      if (trimmed.length > 0 && !trimmed.startsWith('#')) {
        specDescLines.push(trimmed);
      }
    }
  }

  if (currentReq) {
    requirements.push(currentReq);
  }

  return {
    title: specTitle,
    description: specDescLines.join('\n'),
    format: 'markdown',
    requirements,
  };
}

/**
 * Parses Gherkin .feature BDD files into a structured spec tree.
 */
export function parseGherkinSpec(content: string): ParsedSpec {
  const lines = content.split('\n');
  let specTitle = 'Untitled Feature';
  let specDescLines: string[] = [];
  let currentReq: ParsedRequirement | null = null;
  const requirements: ParsedRequirement[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('Feature:')) {
      specTitle = trimmed.substring(8).trim();
      continue;
    }

    if (trimmed.startsWith('Scenario:') || trimmed.startsWith('Scenario Outline:')) {
      if (currentReq) {
        requirements.push(currentReq);
      }
      const scenarioTitle = trimmed.replace(/^Scenario( Outline)?:\s*/, '').trim();
      currentReq = {
        title: scenarioTitle,
        description: '',
        criteria: [],
      };
      continue;
    }

    // Given / When / Then / And / But steps
    const stepMatch = trimmed.match(/^(Given|When|Then|And|But)\s+(.+)$/i);
    if (stepMatch && currentReq) {
      currentReq.criteria.push({
        title: `${stepMatch[1]} ${stepMatch[2]}`,
        status: 'unverified',
      });
      continue;
    }

    if (!currentReq && trimmed.length > 0 && !trimmed.startsWith('#')) {
      specDescLines.push(trimmed);
    }
  }

  if (currentReq) {
    requirements.push(currentReq);
  }

  return {
    title: specTitle,
    description: specDescLines.join('\n'),
    format: 'gherkin',
    requirements,
  };
}

/**
 * Ingests a specification file directly into the memory graph.
 */
export function ingestSpecFile(
  db: Database.Database,
  params: {
    filePath: string;
    format?: 'markdown' | 'gherkin' | 'auto';
    project: string;
    session_id?: string;
  }
): { spec_node_id: string; requirements_count: number; criteria_count: number } {
  const projectRoot = resolveProjectRoot(params.project);
  const pathConfig = loadPathConfig(projectRoot);
  const validatedPath = validatePath(params.filePath, { ...pathConfig, mustExist: true });

  const content = fs.readFileSync(validatedPath, 'utf-8');
  let format = params.format || 'auto';
  if (format === 'auto') {
    format = validatedPath.endsWith('.feature') ? 'gherkin' : 'markdown';
  }

  const parsed = format === 'gherkin' ? parseGherkinSpec(content) : parseMarkdownSpec(content);

  // 1. Create main spec node
  const specNode = GraphEngine.addNode({
    type: 'spec',
    title: parsed.title,
    status: 'approved',
    project: params.project,
    tags: ['spec', parsed.format],
    metadata: {
      description: parsed.description,
      source_path: params.filePath,
      format: parsed.format,
    },
  });

  let totalReqs = 0;
  let totalCriteria = 0;

  // 2. Create requirement nodes and acceptance criterion nodes
  for (const req of parsed.requirements) {
    totalReqs++;
    const reqNode = GraphEngine.addNode({
      type: 'requirement',
      title: req.title,
      status: 'accepted',
      project: params.project,
      tags: ['requirement', parsed.format],
      metadata: {
        description: req.description,
        spec_id: specNode.id,
      },
    });

    // Link Spec -> Requirement (specifies)
    EdgeEngine.addEdge({
      source_id: specNode.id,
      target_id: reqNode.id,
      type: 'specifies',
      project: params.project,
      properties: {},
    });

    for (const crit of req.criteria) {
      totalCriteria++;
      const critNode = GraphEngine.addNode({
        type: 'acceptance_criterion',
        title: crit.title,
        status: crit.status,
        project: params.project,
        tags: ['acceptance_criterion'],
        metadata: {
          requirement_id: reqNode.id,
          spec_id: specNode.id,
        },
      });

      // Link Requirement -> Acceptance Criterion (child_of)
      EdgeEngine.addEdge({
        source_id: critNode.id,
        target_id: reqNode.id,
        type: 'child_of',
        project: params.project,
        properties: {},
      });
    }
  }

  logger.info(
    `Ingested spec "${parsed.title}" (${totalReqs} requirements, ${totalCriteria} criteria) from ${params.filePath}`
  );

  return {
    spec_node_id: specNode.id,
    requirements_count: totalReqs,
    criteria_count: totalCriteria,
  };
}

/**
 * Exports a graph-managed spec node back to clean Markdown or Gherkin text.
 */
export function exportSpecToFile(
  db: Database.Database,
  params: {
    specId: string;
    format?: 'markdown' | 'gherkin';
    project: string;
  }
): string {
  const specNodeResult = GraphEngine.getNode({ id: params.specId, project: params.project });
  const specNode = specNodeResult?.node;
  if (!specNode || specNode.type !== 'spec') {
    throw new Error(`Spec node not found with ID: ${params.specId}`);
  }

  // Find linked requirement nodes via 'specifies' edge
  const reqRows = db
    .prepare(
      `
    SELECT n.* FROM nodes n
    JOIN edges e ON e.target_id = n.id
    WHERE e.source_id = ? AND e.type = 'specifies' AND n.project = ?
  `
    )
    .all(params.specId, params.project) as any[];

  const format = params.format || (specNode.metadata?.format as any) || 'markdown';

  if (format === 'gherkin') {
    let out = `Feature: ${specNode.title}\n`;
    if (specNode.metadata?.description) {
      out += `  ${specNode.metadata.description}\n\n`;
    }
    for (const reqRow of reqRows) {
      out += `  Scenario: ${reqRow.title}\n`;
      const critRows = db
        .prepare(
          `
        SELECT n.* FROM nodes n
        JOIN edges e ON e.source_id = n.id
        WHERE e.target_id = ? AND e.type = 'child_of' AND n.project = ?
      `
        )
        .all(reqRow.id, params.project) as any[];

      for (const critRow of critRows) {
        out += `    ${critRow.title}\n`;
      }
      out += '\n';
    }
    return out;
  }

  // Markdown format
  let out = `# ${specNode.title}\n\n`;
  if (specNode.metadata?.description) {
    out += `${specNode.metadata.description}\n\n`;
  }

  for (const reqRow of reqRows) {
    out += `## ${reqRow.title}\n\n`;
    try {
      const meta = JSON.parse(reqRow.metadata || '{}');
      if (meta.description) {
        out += `${meta.description}\n\n`;
      }
    } catch {}

    const critRows = db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON e.source_id = n.id
      WHERE e.target_id = ? AND e.type = 'child_of' AND n.project = ?
    `
      )
      .all(reqRow.id, params.project) as any[];

    if (critRows.length > 0) {
      out += `### Acceptance Criteria\n`;
      for (const critRow of critRows) {
        const isVerified = critRow.status === 'verified';
        out += `- [${isVerified ? 'x' : ' '}] ${critRow.title}\n`;
      }
      out += '\n';
    }
  }

  return out;
}
