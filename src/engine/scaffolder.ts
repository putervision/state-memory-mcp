import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { NodeType, EdgeType } from '../schema/types.js';
import { GraphEngine } from './graph.js';
import { EdgeEngine } from './edges.js';
import { getDb, getProjectSlug } from './db.js';
import { logger } from '../utils/logger.js';

interface ScaffoldNodeTemplate {
  scaffold_key: string;
  type: NodeType;
  title: string;
  status: string;
  tags: string[];
  metadata: Record<string, any>;
}

interface ScaffoldEdgeTemplate {
  source_key: string;
  target_key: string;
  type: EdgeType;
}

export const STATIC_NODE_TEMPLATES: ScaffoldNodeTemplate[] = [
  {
    scaffold_key: 'plan:main:v1',
    type: 'plan',
    title: 'Main Development Plan',
    status: 'active',
    tags: ['scaffold', 'plan'],
    metadata: { description: 'Primary roadmap for the project development.' }
  },
  // Milestones
  {
    scaffold_key: 'milestone:setup:v1',
    type: 'milestone',
    title: 'Project Setup & Scaffolding',
    status: 'in_progress',
    tags: ['scaffold', 'milestone'],
    metadata: { description: 'Initial environment configuration and codebase baseline.' }
  },
  {
    scaffold_key: 'milestone:core:v1',
    type: 'milestone',
    title: 'Core Feature Development',
    status: 'upcoming',
    tags: ['scaffold', 'milestone'],
    metadata: { description: 'Implementation of essential system functionality.' }
  },
  {
    scaffold_key: 'milestone:quality:v1',
    type: 'milestone',
    title: 'Quality Assurance & Testing',
    status: 'upcoming',
    tags: ['scaffold', 'milestone'],
    metadata: { description: 'Linting, testing, CI pipelines, and overall code quality.' }
  },
  // Default Tasks
  {
    scaffold_key: 'task:ci-cd:v1',
    type: 'task',
    title: 'Set up CI/CD pipeline',
    status: 'pending',
    tags: ['scaffold', 'task'],
    metadata: { description: 'Automate build, test, and release checks.' }
  },
  {
    scaffold_key: 'task:testing:v1',
    type: 'task',
    title: 'Add automated testing framework',
    status: 'pending',
    tags: ['scaffold', 'task'],
    metadata: { description: 'Configure unit and integration tests.' }
  },
  {
    scaffold_key: 'task:linting:v1',
    type: 'task',
    title: 'Configure linting and formatting rules',
    status: 'pending',
    tags: ['scaffold', 'task'],
    metadata: { description: 'Enforce code standards and styling configurations.' }
  },
  {
    scaffold_key: 'task:documentation:v1',
    type: 'task',
    title: 'Improve project documentation',
    status: 'pending',
    tags: ['scaffold', 'task'],
    metadata: { description: 'Keep README, APIs, and plans up to date.' }
  },
  // Decision Templates
  {
    scaffold_key: 'decision:architecture:v1',
    type: 'decision',
    title: 'Architecture & Tech Stack Choice',
    status: 'accepted',
    tags: ['scaffold', 'decision'],
    metadata: {
      rationale: 'Base technology selection for robustness and developer speed.',
      alternatives: 'Listed in design documentation.'
    }
  }
];

export const STATIC_EDGE_TEMPLATES: ScaffoldEdgeTemplate[] = [
  // Link Milestones to Main Plan
  { source_key: 'milestone:setup:v1', target_key: 'plan:main:v1', type: 'part_of' },
  { source_key: 'milestone:core:v1', target_key: 'plan:main:v1', type: 'part_of' },
  { source_key: 'milestone:quality:v1', target_key: 'plan:main:v1', type: 'part_of' },
  
  // Link Tasks to Milestones
  { source_key: 'task:linting:v1', target_key: 'milestone:setup:v1', type: 'part_of' },
  { source_key: 'task:testing:v1', target_key: 'milestone:quality:v1', type: 'part_of' },
  { source_key: 'task:ci-cd:v1', target_key: 'milestone:quality:v1', type: 'part_of' },
  { source_key: 'task:documentation:v1', target_key: 'milestone:setup:v1', type: 'part_of' },

  // Link Decisions to setup
  { source_key: 'decision:architecture:v1', target_key: 'milestone:setup:v1', type: 'decided_in' }
];

/**
 * Runs static scaffolding to idempotently add baseline nodes and edges.
 */
export async function runStaticScaffolder(projectSlug: string, db: Database.Database): Promise<void> {
  logger.info(`Running static scaffolding for project: ${projectSlug}`);

  const keyToIdMap = new Map<string, string>();

  // 1. Process Nodes
  for (const template of STATIC_NODE_TEMPLATES) {
    const existingNode = db.prepare(`
      SELECT id FROM nodes 
      WHERE project = ? AND type = ? AND json_extract(metadata, '$.scaffold_key') = ?
    `).get(projectSlug, template.type, template.scaffold_key) as { id: string } | undefined;

    if (existingNode) {
      keyToIdMap.set(template.scaffold_key, existingNode.id);
    } else {
      const newNode = GraphEngine.addNode({
        project: projectSlug,
        type: template.type,
        title: template.title,
        status: template.status,
        tags: template.tags,
        metadata: {
          ...template.metadata,
          scaffold_key: template.scaffold_key
        }
      });
      keyToIdMap.set(template.scaffold_key, newNode.id);
      logger.info(`Scaffolded node: ${template.title} (${newNode.id})`);
    }
  }

  // 2. Process Edges
  for (const edge of STATIC_EDGE_TEMPLATES) {
    const sourceId = keyToIdMap.get(edge.source_key);
    const targetId = keyToIdMap.get(edge.target_key);

    if (!sourceId || !targetId) {
      logger.warn(`Could not resolve keys for edge: ${edge.source_key} -> ${edge.target_key}`);
      continue;
    }

    const edgeExists = db.prepare(`
      SELECT 1 FROM edges
      WHERE project = ? AND source_id = ? AND target_id = ? AND type = ?
    `).get(projectSlug, sourceId, targetId, edge.type);

    if (!edgeExists) {
      try {
        EdgeEngine.addEdge({
          project: projectSlug,
          source_id: sourceId,
          target_id: targetId,
          type: edge.type
        });
        logger.info(`Scaffolded edge: ${edge.source_key} --${edge.type}--> ${edge.target_key}`);
      } catch (err: any) {
        logger.error(`Failed to add scaffold edge: ${err.message}`);
      }
    }
  }
}

interface TechStackMatch {
  file: string;
  tag: string;
}

const TECH_STACK_CONFIGS: TechStackMatch[] = [
  { file: 'package.json', tag: 'typescript' },
  { file: 'go.mod', tag: 'go' },
  { file: 'Cargo.toml', tag: 'rust' },
  { file: 'pyproject.toml', tag: 'python' },
  { file: 'requirements.txt', tag: 'python' },
  { file: 'setup.py', tag: 'python' },
  { file: 'pom.xml', tag: 'java' },
  { file: 'build.gradle', tag: 'java' }
];

/**
 * Discovers technology stack configuration files and creates config Artifact nodes.
 */
export async function runTechStackScaffolder(projectSlug: string, db: Database.Database, root: string): Promise<void> {
  logger.info(`Running tech stack discovery in root: ${root}`);

  // Resolve Milestone Setup ID
  const setupMilestone = db.prepare(`
    SELECT id FROM nodes 
    WHERE project = ? AND type = 'milestone' AND json_extract(metadata, '$.scaffold_key') = 'milestone:setup:v1'
  `).get(projectSlug) as { id: string } | undefined;

  for (const match of TECH_STACK_CONFIGS) {
    const fullPath = path.join(root, match.file);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    // Check if artifact node already exists for this file
    let artNode = db.prepare(`
      SELECT id FROM nodes
      WHERE project = ? AND type = 'artifact' AND title = ?
    `).get(projectSlug, match.file) as { id: string } | undefined;

    let artNodeId = artNode?.id;

    if (!artNode) {
      const newNode = GraphEngine.addNode({
        project: projectSlug,
        type: 'artifact',
        title: match.file,
        status: 'current',
        metadata: {
          file_path: match.file,
          source: 'scaffold'
        },
        tags: ['scaffold', 'config-file', match.tag]
      });
      artNodeId = newNode.id;
      logger.info(`Scaffolded tech stack artifact: ${match.file} (${artNodeId})`);
    }

    // Link artifact to setup milestone
    if (setupMilestone && artNodeId) {
      const edgeExists = db.prepare(`
        SELECT 1 FROM edges
        WHERE project = ? AND source_id = ? AND target_id = ? AND type = 'produces'
      `).get(projectSlug, setupMilestone.id, artNodeId);

      if (!edgeExists) {
        try {
          EdgeEngine.addEdge({
            project: projectSlug,
            source_id: setupMilestone.id,
            target_id: artNodeId,
            type: 'produces'
          });
          logger.info(`Linked setup milestone to artifact produces: ${match.file}`);
        } catch (err: any) {
          logger.error(`Failed to link setup milestone to artifact: ${err.message}`);
        }
      }
    }
  }
}

export function scaffoldTemplate(params: {
  project?: string;
  template: 'fdd' | 'rfc';
  name: string;
}): { nodes_created: number; edges_created: number } {
  const projectSlug = getProjectSlug(params.project);

  const cleanName = params.name.trim();
  if (!cleanName) {
    throw new Error('Template name is required.');
  }

  let nodes_created = 0;
  let edges_created = 0;

  if (params.template === 'fdd') {
    const milestoneDesign = GraphEngine.addNode({
      project: projectSlug,
      type: 'milestone',
      title: `Design: ${cleanName}`,
      status: 'pending',
      tags: ['fdd', 'design', cleanName.toLowerCase().replace(/\s+/g, '-')],
      metadata: { description: `FDD Design phase for ${cleanName}` }
    });
    nodes_created++;

    const milestoneBuild = GraphEngine.addNode({
      project: projectSlug,
      type: 'milestone',
      title: `Build: ${cleanName}`,
      status: 'pending',
      tags: ['fdd', 'build', cleanName.toLowerCase().replace(/\s+/g, '-')],
      metadata: { description: `FDD Build phase for ${cleanName}` }
    });
    nodes_created++;

    const tasksDesign = [
      `Feature Walkthrough: ${cleanName}`,
      `Design Session: ${cleanName}`,
      `Design Inspection: ${cleanName}`
    ];
    for (const title of tasksDesign) {
      const task = GraphEngine.addNode({
        project: projectSlug,
        type: 'task',
        title,
        status: 'pending',
        tags: ['fdd', 'design', 'task'],
        metadata: {}
      });
      nodes_created++;

      EdgeEngine.addEdge({
        project: projectSlug,
        source_id: task.id,
        target_id: milestoneDesign.id,
        type: 'part_of'
      });
      edges_created++;
    }

    const tasksBuild = [
      `Coding & Implementation: ${cleanName}`,
      `Code Inspection & Review: ${cleanName}`,
      `Promote to Main: ${cleanName}`
    ];
    for (const title of tasksBuild) {
      const task = GraphEngine.addNode({
        project: projectSlug,
        type: 'task',
        title,
        status: 'pending',
        tags: ['fdd', 'build', 'task'],
        metadata: {}
      });
      nodes_created++;

      EdgeEngine.addEdge({
        project: projectSlug,
        source_id: task.id,
        target_id: milestoneBuild.id,
        type: 'part_of'
      });
      edges_created++;
    }

    EdgeEngine.addEdge({
      project: projectSlug,
      source_id: milestoneDesign.id,
      target_id: milestoneBuild.id,
      type: 'blocks'
    });
    edges_created++;

  } else if (params.template === 'rfc') {
    const decisionNode = GraphEngine.addNode({
      project: projectSlug,
      type: 'decision',
      title: `RFC: ${cleanName}`,
      status: 'proposed',
      tags: ['rfc', cleanName.toLowerCase().replace(/\s+/g, '-')],
      metadata: { rationale: 'RFC proposal for technical comment.' }
    });
    nodes_created++;

    const taskDraft = GraphEngine.addNode({
      project: projectSlug,
      type: 'task',
      title: `Draft RFC document for ${cleanName}`,
      status: 'pending',
      tags: ['rfc', 'task'],
      metadata: {}
    });
    nodes_created++;

    const taskReview = GraphEngine.addNode({
      project: projectSlug,
      type: 'task',
      title: `Review RFC feedback for ${cleanName}`,
      status: 'pending',
      tags: ['rfc', 'task'],
      metadata: {}
    });
    nodes_created++;

    const taskFinalize = GraphEngine.addNode({
      project: projectSlug,
      type: 'task',
      title: `Finalize RFC decision for ${cleanName}`,
      status: 'pending',
      tags: ['rfc', 'task'],
      metadata: {}
    });
    nodes_created++;

    EdgeEngine.addEdge({
      project: projectSlug,
      source_id: taskDraft.id,
      target_id: taskReview.id,
      type: 'blocks'
    });
    edges_created++;

    EdgeEngine.addEdge({
      project: projectSlug,
      source_id: taskReview.id,
      target_id: taskFinalize.id,
      type: 'blocks'
    });
    edges_created++;

    EdgeEngine.addEdge({
      project: projectSlug,
      source_id: decisionNode.id,
      target_id: taskDraft.id,
      type: 'blocks'
    });
    edges_created++;
  }

  return { nodes_created, edges_created };
}
