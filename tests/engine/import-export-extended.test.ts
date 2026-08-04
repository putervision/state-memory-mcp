import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { importGraph } from '../../src/engine/import.js';
import { closeAllDbs } from '../../src/engine/db.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Import & Export Extended Coverage', () => {
  const project = 'import-ext-cov-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should throw ValidationError when importing node with invalid schema', () => {
    expect(() =>
      importGraph({
        project,
        nodes: [{ invalid_field: 123 }],
      })
    ).toThrow(ValidationError);
  });

  it('should throw ValidationError when importing file that exceeds size limit', () => {
    const tmpFile = path.join(os.tmpdir(), `import-large-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ nodes: [], edges: [] }));

    expect(() =>
      importGraph({
        project,
        filePath: tmpFile,
        fileSizeLimitBytes: 5,
      })
    ).toThrow(ValidationError);

    fs.unlinkSync(tmpFile);
  });

  it('should import valid nodes and edges cleanly', () => {
    const proj = `import-ext-fresh-${Date.now()}`;
    const result = importGraph({
      project: proj,
      force: true,
      nodes: [
        {
          type: 'task',
          title: 'Imported Task 1',
        },
        {
          type: 'decision',
          title: 'Imported Decision 1',
        },
      ],
    });

    expect(result.imported_nodes_count).toBe(2);
  });
});
