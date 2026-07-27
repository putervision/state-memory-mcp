import { getDb, getProjectSlug } from '../engine/db.js';
import {
  IngestSpecSchema,
  ExportSpecSchema,
  GetSpecComplianceSchema,
  ScaffoldSpecSchema,
  VerifyRequirementSchema,
} from '../schema/schemas.js';
import { ingestSpecFile, exportSpecToFile } from '../engine/spec-parser.js';
import { calculateSpecCompliance, scaffoldSpecTemplate } from '../engine/spec-compliance.js';
import { GraphEngine } from '../engine/graph.js';
import { EdgeEngine } from '../engine/edges.js';

export const specHandlers = {
  ingest_spec: (args: unknown) => {
    const params = IngestSpecSchema.parse(args);
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);
    return ingestSpecFile(db, {
      filePath: params.file_path,
      format: params.format,
      project: projectSlug,
    });
  },

  export_spec: (args: unknown) => {
    const params = ExportSpecSchema.parse(args);
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);
    const content = exportSpecToFile(db, {
      specId: params.spec_id,
      format: params.format,
      project: projectSlug,
    });
    return { spec_id: params.spec_id, format: params.format || 'markdown', content };
  },

  get_spec_compliance: (args: unknown) => {
    const params = GetSpecComplianceSchema.parse(args);
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);
    return calculateSpecCompliance(db, projectSlug);
  },

  scaffold_spec: (args: unknown) => {
    const params = ScaffoldSpecSchema.parse(args);
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);
    return scaffoldSpecTemplate(db, {
      project: projectSlug,
      title: params.title,
    });
  },

  verify_requirement: (args: unknown) => {
    const params = VerifyRequirementSchema.parse(args);
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
  },
};
