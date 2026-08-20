import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';
import {
  IngestSpecSchema,
  ExportSpecSchema,
  GetSpecComplianceSchema,
  ScaffoldSpecSchema,
  VerifyRequirementSchema,
  PlanAndDecomposeFeatureSchema,
  ScaffoldTemplateSchema,
} from '../schema/schemas.js';
import { ingestSpecFile, exportSpecToFile } from '../engine/spec-parser.js';
import { calculateSpecCompliance, scaffoldSpecTemplate } from '../engine/spec-compliance.js';
import { planAndDecomposeFeature } from '../engine/compound-workflows.js';
import { scaffoldTemplate } from '../engine/scaffolder.js';
import { GraphEngine } from '../engine/graph.js';
import { EdgeEngine } from '../engine/edges.js';

export const specHandlers = {
  manage_specs: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for manage_specs.'
      );
    }

    switch (action) {
      case 'scaffold': {
        const params = parseArgs(ScaffoldSpecSchema, args);
        const projectSlug = getProjectSlug(params.project);
        const db = getDb(projectSlug);
        return scaffoldSpecTemplate(db, {
          project: projectSlug,
          title: params.title,
        });
      }
      case 'ingest': {
        const params = parseArgs(IngestSpecSchema, args);
        const projectSlug = getProjectSlug(params.project);
        const db = getDb(projectSlug);
        return ingestSpecFile(db, {
          filePath: params.file_path,
          format: params.format,
          project: projectSlug,
        });
      }
      case 'export': {
        const params = parseArgs(ExportSpecSchema, args);
        const projectSlug = getProjectSlug(params.project);
        const db = getDb(projectSlug);
        const content = exportSpecToFile(db, {
          specId: params.spec_id,
          format: params.format,
          project: projectSlug,
        });
        return { spec_id: params.spec_id, format: params.format || 'markdown', content };
      }
      case 'compliance': {
        const params = parseArgs(GetSpecComplianceSchema, args);
        const projectSlug = getProjectSlug(params.project);
        const db = getDb(projectSlug);
        return calculateSpecCompliance(db, projectSlug);
      }
      case 'verify': {
        const params = parseArgs(VerifyRequirementSchema, args);
        const projectSlug = getProjectSlug(params.project);
        const status = params.status || 'verified';
        const updatedNode = GraphEngine.updateNode({
          id: params.criterion_id,
          project: projectSlug,
          status,
        });

        if (params.observation_id) {
          EdgeEngine.addEdge({
            source_id: params.observation_id,
            target_id: params.criterion_id,
            type: 'verifies',
            project: projectSlug,
            properties: {},
          });
        }

        return {
          criterion_id: params.criterion_id,
          status: updatedNode ? updatedNode.status : status,
          observation_id: params.observation_id || null,
        };
      }
      case 'decompose_feature': {
        const params = parseArgs(PlanAndDecomposeFeatureSchema, args);
        return planAndDecomposeFeature(params);
      }
      case 'template': {
        const params = parseArgs(ScaffoldTemplateSchema, args);
        return scaffoldTemplate({
          ...params,
          template: params.template as 'fdd' | 'rfc',
        });
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for manage_specs. Supported actions: scaffold, ingest, export, compliance, verify, decompose_feature, template.`
        );
    }
  },
};
