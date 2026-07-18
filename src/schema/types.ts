export type NodeType =
  'task' | 'decision' | 'artifact' | 'plan' | 'observation' | 'blocker' | 'milestone';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
export type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded';
export type ArtifactStatus = 'draft' | 'current' | 'outdated' | 'archived';
export type PlanStatus = 'draft' | 'active' | 'completed' | 'abandoned';
export type ObservationStatus = 'active' | 'resolved' | 'invalidated';
export type BlockerStatus = 'active' | 'mitigated' | 'resolved';
export type MilestoneStatus = 'upcoming' | 'in_progress' | 'reached' | 'missed';

export type NodeStatus =
  | TaskStatus
  | DecisionStatus
  | ArtifactStatus
  | PlanStatus
  | ObservationStatus
  | BlockerStatus
  | MilestoneStatus;

export interface BaseNode {
  id: string; // ULID (sortable, unique)
  type: NodeType; // Discriminator
  title: string; // Human-readable label
  status: string; // Type-specific status
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  metadata: Record<string, unknown>; // Extensible JSON blob
  tags: string[]; // Freeform tags for filtering
  project: string; // Project scope
  git_branch?: string; // Optional branch name for context isolation
  commit_hash?: string; // Optional commit hash for Git observations/tasks
}

export type EdgeType =
  | 'depends_on'
  | 'blocks'
  | 'produces'
  | 'references'
  | 'decided_in'
  | 'updates'
  | 'contradicts'
  | 'part_of'
  | 'implements'
  | 'child_of'
  | 'extends'
  | 'modifies'
  | 'renders_state';

export interface Edge {
  id: string; // ULID
  source_id: string; // Source node ID
  target_id: string; // Target node ID
  type: EdgeType; // Relationship type
  properties: Record<string, unknown>; // JSON metadata properties
  project: string; // Project scope
  git_branch?: string; // Optional branch name
  created_at: string; // ISO 8601
}

/** A parsed git commit for scanner consumption */
export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  committedAt: string; // ISO 8601
  subject: string; // First line of commit message
  message: string; // Full commit message body
  conventionalType?: string; // feat, fix, chore, etc.
  conventionalScope?: string;
  filesChanged?: string[];
}

/** Options for the git scanner */
export interface GitScanOptions {
  commits: number; // default 30
  createTasks: boolean; // default false
  createArtifacts: boolean; // default false
  taskCommitLimit?: number;
  taskAvoidWords?: string[];
}

/** Result summary from a git scan run */
export interface GitScanResult {
  commits_scanned: number;
  new_observations: number;
  new_tasks: number;
  new_artifacts: number;
  last_processed_commit: string | null;
}

export interface NodeRow {
  id: string;
  type: string;
  title: string;
  status: string;
  project: string;
  git_branch?: string;
  commit_hash?: string;
  metadata: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface EdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  properties: string;
  project: string;
  git_branch?: string;
  created_at: string;
}
