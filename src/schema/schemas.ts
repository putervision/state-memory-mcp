import { z } from 'zod';
import { NodeType, NodeStatus } from './types.js';

export const NodeTypeSchema = z.enum([
  'task',
  'decision',
  'artifact',
  'plan',
  'observation',
  'blocker',
  'milestone',
]);

export const DEFAULT_STATUS_BY_TYPE: Record<NodeType, NodeStatus> = {
  task: 'pending',
  decision: 'proposed',
  artifact: 'draft',
  plan: 'draft',
  observation: 'active',
  blocker: 'active',
  milestone: 'upcoming',
};

export const MetadataSchema = z.record(z.unknown()).refine(
  (val) => {
    try {
      JSON.stringify(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Metadata must be a JSON-serializable object' }
);

export const PropertiesSchema = z.record(z.unknown()).refine(
  (val) => {
    try {
      JSON.stringify(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Properties must be a JSON-serializable object' }
);

export const AddNodeSchema = z.object({
  project: z.string().optional(),
  type: NodeTypeSchema,
  title: z.string().min(1, 'Title cannot be empty'),
  status: z.string().optional(),
  metadata: MetadataSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const GetNodeSchema = z.object({
  project: z.string().optional(),
  id: z.string().min(1, 'ID is required'),
  include_edges: z.boolean().optional().default(true),
});

export const UpdateNodeSchema = z.object({
  project: z.string().optional(),
  id: z.string().min(1, 'ID is required'),
  title: z.string().optional(),
  status: z.string().optional(),
  metadata: MetadataSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const RemoveNodeSchema = z.object({
  project: z.string().optional(),
  id: z.string().min(1, 'ID is required'),
});

export const EdgeTypeSchema = z.enum([
  'depends_on',
  'blocks',
  'produces',
  'references',
  'decided_in',
  'updates',
  'contradicts',
  'part_of',
  'implements',
  'child_of',
]);

export const AddEdgeSchema = z.object({
  project: z.string().optional(),
  source_id: z.string().min(1, 'Source ID is required'),
  target_id: z.string().min(1, 'Target ID is required'),
  type: EdgeTypeSchema,
  properties: PropertiesSchema.optional(),
});

export const RemoveEdgeSchema = z.object({
  project: z.string().optional(),
  source_id: z.string().min(1, 'Source ID is required'),
  target_id: z.string().min(1, 'Target ID is required'),
  type: z.string().min(1, 'Edge type is required'),
});

export const ListNodesSchema = z.object({
  project: z.string().optional(),
  type: NodeTypeSchema.optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().optional().default(50),
  offset: z.number().optional().default(0),
  compact: z.boolean().optional().default(false),
});

export const SearchNodesSchema = z.object({
  project: z.string().optional(),
  query: z.string().min(1, 'Search query cannot be empty'),
  type: NodeTypeSchema.optional(),
  status: z.string().optional(),
  limit: z.number().optional().default(20),
});

export const GetSubgraphSchema = z.object({
  project: z.string().optional(),
  root_id: z.string().min(1, 'Root ID is required'),
  depth: z.number().min(1).max(5).optional().default(2),
  edge_types: z.array(z.string()).optional(),
  node_types: z.array(z.string()).optional(),
});

export const TraceDependenciesSchema = z.object({
  project: z.string().optional(),
  node_id: z.string().min(1, 'Node ID is required'),
  direction: z.enum(['upstream', 'downstream']),
  edge_types: z.array(z.string()).optional().default(['depends_on', 'blocks', 'child_of']),
  max_depth: z.number().min(1).max(20).optional().default(10),
});

export const FindBlockersSchema = z.object({
  project: z.string().optional(),
  node_id: z.string().optional(),
  include_transitive: z.boolean().optional().default(true),
});

export const GetProjectSummarySchema = z.object({
  project: z.string().optional(),
});

export const DecisionTrailSchema = z.object({
  project: z.string().optional(),
  node_id: z.string().min(1, 'Node ID is required'),
});

export const CriticalPathSchema = z.object({
  project: z.string().optional(),
  milestone_id: z.string().min(1, 'Milestone ID is required'),
});

export const ImpactAnalysisSchema = z.object({
  project: z.string().optional(),
  node_id: z.string().min(1, 'Node ID is required'),
});

export const DetectContradictionsSchema = z.object({
  project: z.string().optional(),
});

export const ExportGraphSchema = z.object({
  project: z.string().optional(),
  format: z.enum(['json', 'dot', 'mermaid', 'html']).optional().default('json'),
});

export const ImportGraphSchema = z.object({
  project: z.string().optional(),
  nodes: z.array(z.record(z.unknown())),
  edges: z.array(z.record(z.unknown())),
});

export const QueryGraphSchema = z.object({
  project: z.string().optional(),
  sql: z.string().min(1, 'SQL query is required'),
  params: z.array(z.unknown()).optional().default([]),
});

export const BackupProjectDbSchema = z.object({
  project: z.string().optional(),
  outputPath: z.string().optional(),
});

export const RestoreProjectDbSchema = z.object({
  backupPath: z.string().min(1, 'Backup path is required'),
  project: z.string().optional(),
});

export const AuditProjectDbSchema = z.object({
  project: z.string().optional(),
});

export const MergeProjectDbSchema = z.object({
  sourcePath: z.string().min(1, 'Source path is required'),
  project: z.string().optional(),
  force: z.boolean().optional().default(false),
});

export const GetContextSnapshotSchema = z.object({
  project: z.string().optional(),
});

export const FindRelatedDecisionsSchema = z.object({
  project: z.string().optional(),
  artifact_id: z.string().min(1, 'Artifact ID is required'),
});

export const FindBlockedTasksSchema = z.object({
  project: z.string().optional(),
  decision_id: z.string().min(1, 'Decision ID is required'),
});

export const ScaffoldTemplateSchema = z.object({
  project: z.string().optional(),
  template: z.enum(['fdd', 'rfc']),
  name: z.string().min(1, 'Template name is required'),
});



