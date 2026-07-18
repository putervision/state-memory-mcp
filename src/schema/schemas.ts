import { NodeType, NodeStatus } from './types.js';

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: {
    errors: { message: string }[];
    format: () => string;
  };
}

export abstract class Schema<T> {
  isOptional: boolean = false;
  defaultValue?: T;

  protected clone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }

  abstract parse(val: unknown, path?: string): T;

  optional(): this {
    const copy = this.clone();
    copy.isOptional = true;
    return copy;
  }

  default(val: T): this {
    const copy = this.clone();
    copy.defaultValue = val;
    return copy;
  }

  safeParse(val: unknown): ParseResult<T> {
    try {
      const data = this.parse(val);
      return { success: true, data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          errors: [{ message: err.message || 'Validation error' }],
          format: () => err.message || 'Validation error',
        },
      };
    }
  }
}

export class StringSchema extends Schema<string> {
  private minLength?: number;
  private minMessage?: string;
  private maxLength?: number;
  private maxMessage?: string;

  min(length: number, message?: string): this {
    const copy = this.clone();
    copy.minLength = length;
    copy.minMessage = message;
    return copy;
  }

  max(length: number, message?: string): this {
    const copy = this.clone();
    copy.maxLength = length;
    copy.maxMessage = message;
    return copy;
  }

  parse(val: unknown, path = 'value'): string {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'string') {
      throw new Error(`${path} must be a string`);
    }
    if (this.minLength !== undefined && val.length < this.minLength) {
      throw new Error(this.minMessage || `${path} must be at least ${this.minLength} characters`);
    }
    if (this.maxLength !== undefined && val.length > this.maxLength) {
      throw new Error(this.maxMessage || `${path} must be at most ${this.maxLength} characters`);
    }
    return val;
  }
}

export class NumberSchema extends Schema<number> {
  private minVal?: number;
  private maxVal?: number;

  min(val: number): this {
    const copy = this.clone();
    copy.minVal = val;
    return copy;
  }

  max(val: number): this {
    const copy = this.clone();
    copy.maxVal = val;
    return copy;
  }

  parse(val: unknown, path = 'value'): number {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'number' || Number.isNaN(val)) {
      throw new Error(`${path} must be a number`);
    }
    if (this.minVal !== undefined && val < this.minVal) {
      throw new Error(`${path} must be at least ${this.minVal}`);
    }
    if (this.maxVal !== undefined && val > this.maxVal) {
      throw new Error(`${path} must be at most ${this.maxVal}`);
    }
    return val;
  }
}

export class BooleanSchema extends Schema<boolean> {
  parse(val: unknown, path = 'value'): boolean {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'boolean') {
      throw new Error(`${path} must be a boolean`);
    }
    return val;
  }
}

export class EnumSchema<U extends string> extends Schema<U> {
  private options: U[];

  constructor(options: U[]) {
    super();
    this.options = options;
  }

  parse(val: unknown, path = 'value'): U {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue as U;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'string' || !this.options.includes(val as U)) {
      throw new Error(`${path} must be one of: ${this.options.join(', ')}`);
    }
    return val as U;
  }
}

export class ArraySchema<I> extends Schema<I[]> {
  private itemSchema: Schema<I>;

  constructor(itemSchema: Schema<I>) {
    super();
    this.itemSchema = itemSchema;
  }

  parse(val: unknown, path = 'value'): I[] {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (!Array.isArray(val)) {
      throw new Error(`${path} must be an array`);
    }
    return val.map((item, idx) => this.itemSchema.parse(item, `${path}[${idx}]`));
  }
}

export class RecordSchema<V> extends Schema<Record<string, V>> {
  private valSchema: Schema<V>;
  private refinement?: (val: Record<string, V>) => boolean;
  private refineMessage?: string;

  constructor(valSchema: Schema<V>) {
    super();
    this.valSchema = valSchema;
  }

  refine(fn: (val: Record<string, V>) => boolean, options: { message: string }): this {
    const copy = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    copy.refinement = fn;
    copy.refineMessage = options.message;
    return copy;
  }

  parse(val: unknown, path = 'value'): Record<string, V> {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error(`${path} must be an object`);
    }
    const result: Record<string, V> = {};
    for (const key of Object.keys(val)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      result[key] = this.valSchema.parse((val as any)[key], `${path}.${key}`);
    }
    if (this.refinement && !this.refinement(result)) {
      throw new Error(this.refineMessage || `${path} failed refinement validation`);
    }
    return result;
  }
}

export class ObjectSchema<T extends Record<string, Schema<any>>> extends Schema<{
  [K in keyof T]: T[K] extends Schema<infer U> ? U : never;
}> {
  private shape: T;

  constructor(shape: T) {
    super();
    this.shape = shape;
  }

  parse(
    val: unknown,
    path = 'value'
  ): { [K in keyof T]: T[K] extends Schema<infer U> ? U : never } {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error(`${path} must be an object`);
    }
    const result: any = {};
    for (const key of Object.keys(this.shape)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      const fieldSchema = this.shape[key];
      const fieldValue = (val as any)[key];
      if (
        fieldValue === undefined &&
        fieldSchema.defaultValue === undefined &&
        fieldSchema.isOptional
      ) {
        // Skip optional fields that aren't set
        continue;
      }
      result[key] = fieldSchema.parse(fieldValue, `${path}.${key}`);
    }
    return result;
  }
}

export class UnknownSchema extends Schema<any> {
  parse(val: unknown): any {
    return val;
  }
}

export type Infer<T extends Schema<any>> = T extends Schema<infer U> ? U : never;

export const z = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  enum: <U extends string>(options: U[]) => new EnumSchema<U>(options),
  array: <I>(itemSchema: Schema<I>) => new ArraySchema<I>(itemSchema),
  record: <V>(valSchema: Schema<V>) => new RecordSchema<V>(valSchema),
  object: <T extends Record<string, Schema<any>>>(shape: T) => new ObjectSchema<T>(shape),
  unknown: () => new UnknownSchema(),
};

// ==========================================
// Existing Schemas Definitions
// ==========================================

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
      const str = JSON.stringify(val);
      return str.length <= 50000;
    } catch {
      return false;
    }
  },
  { message: 'Metadata must be a JSON-serializable object of max 50,000 characters stringified' }
);

export const PropertiesSchema = z.record(z.unknown()).refine(
  (val) => {
    try {
      const str = JSON.stringify(val);
      return str.length <= 50000;
    } catch {
      return false;
    }
  },
  { message: 'Properties must be a JSON-serializable object of max 50,000 characters stringified' }
);

export const AddNodeSchema = z.object({
  project: z.string().optional(),
  type: NodeTypeSchema,
  title: z.string().min(1, 'Title cannot be empty').max(500, 'Title cannot exceed 500 characters'),
  status: z.string().optional(),
  metadata: MetadataSchema.optional(),
  tags: z.array(z.string().max(100, 'Tag cannot exceed 100 characters')).optional(),
});

export const GetNodeSchema = z.object({
  project: z.string().optional(),
  id: z.string().min(1, 'ID is required'),
  include_edges: z.boolean().optional().default(true),
});

export const UpdateNodeSchema = z.object({
  project: z.string().optional(),
  id: z.string().min(1, 'ID is required'),
  title: z.string().max(500, 'Title cannot exceed 500 characters').optional(),
  status: z.string().optional(),
  metadata: MetadataSchema.optional(),
  tags: z.array(z.string().max(100, 'Tag cannot exceed 100 characters')).optional(),
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
  'extends',
  'modifies',
  'renders_state',
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
  type: EdgeTypeSchema,
});

export const ListNodesSchema = z.object({
  project: z.string().optional(),
  type: NodeTypeSchema.optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().optional().default(50),
  offset: z.number().optional().default(0),
  compact: z.boolean().optional().default(false),
  git_branch: z.string().optional(),
});

export const SearchNodesSchema = z.object({
  project: z.string().optional(),
  query: z.string().min(1, 'Search query cannot be empty'),
  type: NodeTypeSchema.optional(),
  status: z.string().optional(),
  limit: z.number().optional().default(20),
  offset: z.number().optional().default(0),
  algorithm: z.enum(['fts', 'tfidf']).optional().default('fts'),
});

export const GetSubgraphSchema = z.object({
  project: z.string().optional(),
  root_id: z.string().min(1, 'Root ID is required'),
  depth: z.number().min(1).max(5).optional().default(2),
  edge_types: z.array(EdgeTypeSchema).optional(),
  node_types: z.array(NodeTypeSchema).optional(),
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
  nodes: z.array(z.record(z.unknown())).optional(),
  edges: z.array(z.record(z.unknown())).optional(),
  filePath: z.string().optional(),
  fileSizeLimitBytes: z.number().optional(),
  conflictStrategy: z.enum(['skip', 'overwrite', 'generate_new']).optional().default('skip'),
  force: z.boolean().optional().default(false),
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

export const ValueMetricsSchema = z.object({
  project: z.string().optional(),
});

export const StartSessionSchema = z.object({
  project: z.string().optional(),
  agent_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const EndSessionSchema = z.object({
  project: z.string().optional(),
  session_id: z.string().min(1, 'Session ID is required'),
});

export const GetEventLogSchema = z.object({
  project: z.string().optional(),
  entity_id: z.string().optional(),
  event_type: z.string().optional(),
  session_id: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const GetNodeHistorySchema = z.object({
  project: z.string().optional(),
  node_id: z.string().min(1, 'Node ID is required'),
});

export const UndoLastSchema = z.object({
  project: z.string().optional(),
  node_id: z.string().min(1, 'Node ID is required'),
});

export const SaveSnapshotSchema = z.object({
  project: z.string().optional(),
  session_id: z.string().optional(),
  force: z.boolean().optional(),
});

export const ListSnapshotsSchema = z.object({
  project: z.string().optional(),
  limit: z.number().optional(),
});

export const DiffSnapshotsSchema = z.object({
  project: z.string().optional(),
  snapshot_id_a: z.string().min(1, 'Snapshot ID A is required'),
  snapshot_id_b: z.string().min(1, 'Snapshot ID B is required'),
});

export const ExportTrajectoriesSchema = z.object({
  project: z.string().optional(),
  session_id: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.number().optional().default(10000),
  offset: z.number().optional().default(0),
});

export const BatchUpdateSchema = z.object({
  project: z.string().optional(),
  ids: z.array(z.string().min(1, 'ID cannot be empty')),
  status: z.string().optional(),
  metadata: MetadataSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const NextTasksSchema = z.object({
  project: z.string().optional(),
  git_branch: z.string().optional(),
  limit: z.number().optional().default(5),
  include_context: z.boolean().optional().default(false),
});

export const WhatChangedSchema = z.object({
  project: z.string().optional(),
  since: z.string().optional(),
  since_session: z.string().optional(),
  git_branch: z.string().optional(),
});

export const GetStaleNodesSchema = z.object({
  project: z.string().optional(),
  older_than: z.string().optional().default('7d'),
  status: z.string().optional().default('in_progress'),
  type: z.string().optional(),
  git_branch: z.string().optional(),
  limit: z.number().optional().default(20),
});

export const ValidateGraphSchema = z.object({
  project: z.string().optional(),
  checks: z.array(z.string()).optional(),
});

export const PruneEventsSchema = z.object({
  project: z.string().optional(),
  older_than: z.string().min(1, 'older_than is required'),
  dry_run: z.boolean().optional().default(true),
  preserve_types: z.array(z.string()).optional(),
});

export const AddNoteSchema = z.object({
  project: z.string().optional(),
  text: z
    .string()
    .min(1, 'Note text cannot be empty')
    .max(10000, 'Note text cannot exceed 10000 characters'),
  attach_to: z.string().optional(),
  tags: z.array(z.string().max(100, 'Tag cannot exceed 100 characters')).optional(),
});
