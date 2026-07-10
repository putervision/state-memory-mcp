import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { QueryEngine } from '../../src/engine/queries.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { tokenize, searchTfidf } from '../../src/engine/tfidf.js';

describe('TF-IDF Vector Search Engine', () => {
  const project = 'tfidf-test-project';

  beforeAll(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();

    // Setup some nodes with distinctive keywords
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Database connection configuration',
      status: 'done',
      metadata: { priority: 'high', description: 'Configure SQLite storage path and parameters.' },
      tags: ['database', 'sqlite'],
    });

    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'User Authentication system with OAuth',
      status: 'in_progress',
      metadata: { description: 'Implement passport and google login integration.' },
      tags: ['auth', 'security'],
    });

    GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Rely on local TF-IDF instead of vector model',
      status: 'accepted',
      metadata: { rationale: 'Avoids heavy dependency footprints like ONNX or Python servers.' },
      tags: ['search', 'architecture'],
    });
  });

  afterAll(() => {
    closeAllDbs();
  });

  describe('tokenizer', () => {
    it('should split camelCase and ignore stop words', () => {
      const tokens = tokenize('AuthenticationWithOAuth and SQLite parameters');
      // "AuthenticationWithOAuth" -> "Authentication With OAuth" -> "authentication", "oauth" (since "with" is a stop word)
      // "and" -> ignored (stop word)
      // "SQLite" -> "sqlite"
      // "parameters" -> "parameters"
      expect(tokens).toContain('authentication');
      expect(tokens).toContain('oauth');
      expect(tokens).toContain('sqlite');
      expect(tokens).toContain('parameters');
      expect(tokens).not.toContain('with');
      expect(tokens).not.toContain('and');
    });

    it('should normalize casing and strip special chars', () => {
      const tokens = tokenize('hello-world!!! this_is_testing');
      expect(tokens).toEqual(['hello', 'world', 'testing']); // "this", "is" are stop words
    });
  });

  describe('searchTfidf core logic', () => {
    it('should correctly rank nodes by term similarity', () => {
      const list = QueryEngine.listNodes({ project });
      const nodes = list.nodes;

      const results = searchTfidf(nodes, 'SQLite connection', 10);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Database connection configuration');
    });

    it('should return empty array if no matches', () => {
      const list = QueryEngine.listNodes({ project });
      const results = searchTfidf(list.nodes, 'unrelated gibberish terms', 10);
      expect(results).toEqual([]);
    });
  });

  describe('QueryEngine integration (searchNodes)', () => {
    it('should return matching nodes using tfidf algorithm option', () => {
      const result = QueryEngine.searchNodes({
        project,
        query: 'OAuth authentication login',
        algorithm: 'tfidf',
      });

      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].title).toBe('User Authentication system with OAuth');
    });

    it('should respect status filter with tfidf algorithm', () => {
      const result = QueryEngine.searchNodes({
        project,
        query: 'SQLite configuration',
        algorithm: 'tfidf',
        status: 'done',
      });
      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].title).toBe('Database connection configuration');

      const resultBlocked = QueryEngine.searchNodes({
        project,
        query: 'SQLite configuration',
        algorithm: 'tfidf',
        status: 'blocked',
      });
      expect(resultBlocked.nodes.length).toBe(0);
    });

    it('should respect type filter with tfidf algorithm', () => {
      const result = QueryEngine.searchNodes({
        project,
        query: 'dependency vector footprint',
        algorithm: 'tfidf',
        type: 'decision',
      });
      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].type).toBe('decision');
      expect(result.nodes[0].title).toBe('Rely on local TF-IDF instead of vector model');

      const resultTask = QueryEngine.searchNodes({
        project,
        query: 'dependency vector footprint',
        algorithm: 'tfidf',
        type: 'task',
      });
      expect(resultTask.nodes.length).toBe(0);
    });
  });
});
