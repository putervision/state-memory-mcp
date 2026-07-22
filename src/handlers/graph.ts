import {
  GetSubgraphSchema,
  ExportGraphSchema,
  ImportGraphSchema,
  QueryGraphSchema,
  BackupProjectDbSchema,
  RestoreProjectDbSchema,
  AuditProjectDbSchema,
  MergeProjectDbSchema,
  ScaffoldTemplateSchema,
  ValidateGraphSchema,
} from '../schema/schemas.js';
import { QueryEngine } from '../engine/queries.js';
import { exportGraph } from '../engine/export.js';
import { importGraph } from '../engine/import.js';
import { queryGraph } from '../engine/query-raw.js';
import { backupProjectDb, restoreProjectDb } from '../engine/backup.js';
import { auditProjectDb } from '../engine/audit.js';
import { mergeProjectDb } from '../engine/merge.js';
import { scaffoldTemplate } from '../engine/scaffolder.js';
import { validateGraph, ValidateCheck } from '../engine/validate.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const graphHandlers = {
  get_subgraph: (args: any) => {
    const data = parseArgs(GetSubgraphSchema, args);
    return QueryEngine.getSubgraph(data);
  },
  export_graph: (args: any) => {
    const data = parseArgs(ExportGraphSchema, args);
    return exportGraph(data);
  },
  import_graph: (args: any) => {
    const data = parseArgs(ImportGraphSchema, args);
    return importGraph(data);
  },
  query_graph: (args: any) => {
    const data = parseArgs(QueryGraphSchema, args);
    return queryGraph(data);
  },
  backup_project_db: (args: any) => {
    const data = parseArgs(BackupProjectDbSchema, args);
    return backupProjectDb(data);
  },
  restore_project_db: (args: any) => {
    const data = parseArgs(RestoreProjectDbSchema, args);
    return restoreProjectDb(data);
  },
  audit_project_db: (args: any) => {
    const data = parseArgs(AuditProjectDbSchema, args);
    return auditProjectDb(data);
  },
  merge_project_db: (args: any) => {
    const data = parseArgs(MergeProjectDbSchema, args);
    return mergeProjectDb(data);
  },
  scaffold_template: (args: any) => {
    const data = parseArgs(ScaffoldTemplateSchema, args);
    return scaffoldTemplate({
      ...data,
      template: data.template as 'fdd' | 'rfc',
    });
  },
  validate_graph: (args: any) => {
    const data = parseArgs(ValidateGraphSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return validateGraph(db, {
      project: projectSlug,
      checks: data.checks as ValidateCheck[] | undefined,
    });
  },
};
