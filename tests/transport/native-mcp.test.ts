import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NativeMcpServer,
  NativeStdioTransport,
  NativeResourceTemplate,
  ErrorCode,
  McpError,
  validateParams,
} from '../../src/transport/native-mcp.js';
import { createNativeServer } from '../../src/server.js';

describe('NativeMcpServer Conformance Suite', () => {
  let server: NativeMcpServer;

  beforeEach(() => {
    server = new NativeMcpServer({
      name: 'io.github.putervision/state-memory-mcp',
      version: '1.2.0',
    });

    // Register a test tool
    server.registerTool(
      'test_tool',
      {
        title: 'Test Tool',
        description: 'A test tool for parameter validation',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'read', 'delete'] },
            count: { type: 'number' },
            tags: { type: 'array' },
            metadata: { type: 'object' },
            flag: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
      async (args: any, extra?: { signal?: AbortSignal }) => {
        if (args.action === 'slow') {
          // Allow testing cancellation
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 500);
            extra?.signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Aborted'));
            });
          });
        }
        return { success: true, receivedAction: args.action };
      }
    );

    // Register a static resource
    server.registerResource(
      'health-check',
      'state:///health',
      { title: 'Health', mimeType: 'application/json' },
      async () => ({
        contents: [
          { uri: 'state:///health', mimeType: 'application/json', text: '{"status":"healthy"}' },
        ],
      })
    );

    // Register a templated resource
    server.registerResource(
      'project-summary',
      new NativeResourceTemplate('state-memory:///{project}/summary'),
      { title: 'Project Summary', mimeType: 'application/json' },
      async (uri, vars) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ project: vars.project }),
          },
        ],
      })
    );

    // Register a prompt
    server.registerPrompt(
      'test-prompt',
      {
        title: 'Test Prompt',
        description: 'A test prompt template',
        argsSchema: {
          properties: {
            topic: { type: 'string', description: 'The prompt topic' },
          },
          required: ['topic'],
        },
      },
      async (args) => ({
        description: 'Test prompt output',
        messages: [{ role: 'user', content: { type: 'text', text: `Topic is ${args.topic}` } }],
      })
    );
  });

  describe('1. Handshake & Protocol Version Negotiation', () => {
    it('handles initialize with requested protocolVersion 2024-11-05', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', clientInfo: { name: 'cursor', version: '1.0' } },
      });

      expect(resp).not.toBeNull();
      expect(resp?.error).toBeUndefined();
      expect(resp?.result).toMatchObject({
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: expect.any(Object),
          resources: expect.any(Object),
          prompts: expect.any(Object),
        },
        serverInfo: {
          name: 'io.github.putervision/state-memory-mcp',
          version: '1.2.0',
        },
      });
    });

    it('handles initialize with backward-compatible 2024-10-07 version', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: { protocolVersion: '2024-10-07' },
      });

      expect(resp?.result).toMatchObject({
        protocolVersion: '2024-10-07',
      });
    });

    it('falls back to default 2024-11-05 when unsupported version requested', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: { protocolVersion: '2023-01-01' },
      });

      expect(resp?.result).toMatchObject({
        protocolVersion: '2024-11-05',
      });
    });

    it('returns null on notifications/initialized', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      });

      expect(resp).toBeNull();
    });

    it('handles ping request', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 'ping-1',
        method: 'ping',
      });

      expect(resp?.result).toEqual({});
    });
  });

  describe('2. Tools Conformance & -32602 Validation', () => {
    it('lists registered tools with valid inputSchema', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/list',
      });

      expect(resp?.result).toHaveProperty('tools');
      const tools = (resp?.result as any).tools;
      expect(tools.length).toBeGreaterThanOrEqual(1);
      const testTool = tools.find((t: any) => t.name === 'test_tool');
      expect(testTool).toBeDefined();
      expect(testTool.inputSchema.required).toContain('action');
    });

    it('executes tool with valid arguments', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { action: 'create', count: 42, flag: true },
        },
      });

      expect(resp?.error).toBeUndefined();
      expect(resp?.result).toHaveProperty('content');
      const content = (resp?.result as any).content;
      expect(content[0].type).toBe('text');
      expect(JSON.parse(content[0].text)).toMatchObject({
        success: true,
        receivedAction: 'create',
      });
    });

    it('returns -32602 when missing required parameter', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { count: 10 }, // missing 'action'
        },
      });

      expect(resp?.result).toBeUndefined();
      expect(resp?.error?.code).toBe(ErrorCode.InvalidParams); // -32602
      expect(resp?.error?.message).toContain('Missing required argument: "action"');
    });

    it('returns -32602 when property type is wrong', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { action: 'create', count: 'not-a-number' },
        },
      });

      expect(resp?.error?.code).toBe(ErrorCode.InvalidParams);
      expect(resp?.error?.message).toContain('expected number, got string');
    });

    it('returns -32602 when enum value is not allowed', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { action: 'unsupported_action' },
        },
      });

      expect(resp?.error?.code).toBe(ErrorCode.InvalidParams);
      expect(resp?.error?.message).toContain('expected one of [create, read, delete]');
    });

    it('returns -32601 on unknown tool name', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 15,
        method: 'tools/call',
        params: {
          name: 'non_existent_tool',
          arguments: {},
        },
      });

      expect(resp?.error?.code).toBe(ErrorCode.MethodNotFound);
      expect(resp?.error?.message).toContain('Unknown tool');
    });
  });

  describe('3. Resources Conformance', () => {
    it('lists static and templated resources', async () => {
      const listResp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 20,
        method: 'resources/list',
      });
      expect(listResp?.result).toHaveProperty('resources');
      const resources = (listResp?.result as any).resources;
      expect(resources.some((r: any) => r.uri === 'state:///health')).toBe(true);

      const tplResp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 21,
        method: 'resources/templates/list',
      });
      expect(tplResp?.result).toHaveProperty('resourceTemplates');
      const templates = (tplResp?.result as any).resourceTemplates;
      expect(
        templates.some((t: any) => t.uriTemplate === 'state-memory:///{project}/summary')
      ).toBe(true);
    });

    it('reads static resource', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 22,
        method: 'resources/read',
        params: { uri: 'state:///health' },
      });

      expect(resp?.result).toHaveProperty('contents');
      const contents = (resp?.result as any).contents;
      expect(contents[0].text).toContain('healthy');
    });

    it('reads templated resource with URI variable extraction', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 23,
        method: 'resources/read',
        params: { uri: 'state-memory:///my-awesome-project/summary' },
      });

      expect(resp?.result).toHaveProperty('contents');
      const contents = (resp?.result as any).contents;
      const parsed = JSON.parse(contents[0].text);
      expect(parsed.project).toBe('my-awesome-project');
    });

    it('returns error when resource not found', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 24,
        method: 'resources/read',
        params: { uri: 'state-memory:///unknown/not-found' },
      });

      expect(resp?.error?.code).toBe(ErrorCode.InvalidRequest);
      expect(resp?.error?.message).toContain('Resource not found');
    });

    it('reads pv://docs/ documentation resource (E13)', async () => {
      const fullServer = createNativeServer();
      const resp = await fullServer.handleMessage({
        jsonrpc: '2.0',
        id: 25,
        method: 'resources/read',
        params: { uri: 'pv://docs/manage_nodes' },
      });

      expect(resp?.result).toHaveProperty('contents');
      const contents = (resp?.result as any).contents;
      const parsed = JSON.parse(contents[0].text);
      expect(parsed.tool).toBe('manage_nodes');
      expect(parsed.inputSchema).toBeDefined();
    });
  });

  describe('4. Prompts Conformance', () => {
    it('lists registered prompts', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 30,
        method: 'prompts/list',
      });

      expect(resp?.result).toHaveProperty('prompts');
      const prompts = (resp?.result as any).prompts;
      expect(prompts.some((p: any) => p.name === 'test-prompt')).toBe(true);
    });

    it('retrieves prompt with arguments', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 31,
        method: 'prompts/get',
        params: { name: 'test-prompt', arguments: { topic: 'Microservices' } },
      });

      expect(resp?.result).toHaveProperty('messages');
      const messages = (resp?.result as any).messages;
      expect(messages[0].content.text).toBe('Topic is Microservices');
    });
  });

  describe('5. Request Cancellation', () => {
    it('aborts active request when notifications/cancelled received', async () => {
      // Launch a slow tool call
      const callPromise = server.handleMessage({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { action: 'slow' },
        },
      });

      // Send cancellation immediately
      await server.handleMessage({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 99 },
      });

      const resp = await callPromise;
      expect(resp?.error?.code).toBe(-32000);
      expect(resp?.error?.message).toBe('Request cancelled');
    });
  });

  describe('6. Error Envelope Handling', () => {
    it('returns -32600 on invalid envelope without method', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 101,
      } as any);

      expect(resp?.error?.code).toBe(ErrorCode.InvalidRequest);
    });

    it('returns -32601 on unsupported method', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 102,
        method: 'unknown/method',
      });

      expect(resp?.error?.code).toBe(ErrorCode.MethodNotFound);
    });
  });

  describe('7. Latency Benchmark', () => {
    it('handles initialize and tools/list in sub-15ms', async () => {
      const start = performance.now();

      await server.handleMessage({
        jsonrpc: '2.0',
        id: 'bench-init',
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      });

      await server.handleMessage({
        jsonrpc: '2.0',
        id: 'bench-tools',
        method: 'tools/list',
      });

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(15); // Target: <=15ms
    });
  });

  describe('8. Transport Lifecycle, Prompts, Resources & Edge Cases', () => {
    it('handles resources/read error cases (missing URI, not found)', async () => {
      const missingUri = await server.handleMessage({
        jsonrpc: '2.0',
        id: 801,
        method: 'resources/read',
        params: {},
      });
      expect(missingUri?.error?.code).toBe(ErrorCode.InvalidParams);
      expect(missingUri?.error?.message).toContain('Missing uri');

      const notFound = await server.handleMessage({
        jsonrpc: '2.0',
        id: 802,
        method: 'resources/read',
        params: { uri: 'state:///nonexistent' },
      });
      expect(notFound?.error?.code).toBe(ErrorCode.InvalidRequest);
      expect(notFound?.error?.message).toContain('Resource not found');
    });

    it('handles prompts/get success and error cases', async () => {
      const missingName = await server.handleMessage({
        jsonrpc: '2.0',
        id: 803,
        method: 'prompts/get',
        params: {},
      });
      expect(missingName?.error?.code).toBe(ErrorCode.InvalidParams);
      expect(missingName?.error?.message).toContain('Missing prompt name');

      const notFound = await server.handleMessage({
        jsonrpc: '2.0',
        id: 804,
        method: 'prompts/get',
        params: { name: 'nonexistent-prompt' },
      });
      expect(notFound?.error?.code).toBe(ErrorCode.MethodNotFound);
      expect(notFound?.error?.message).toContain('Unknown prompt');

      const success = await server.handleMessage({
        jsonrpc: '2.0',
        id: 805,
        method: 'prompts/get',
        params: { name: 'test-prompt', arguments: { topic: 'governance' } },
      });
      expect(success?.error).toBeUndefined();
      expect(success?.result).toMatchObject({
        description: 'Test prompt output',
        messages: [{ role: 'user', content: { type: 'text', text: 'Topic is governance' } }],
      });
    });

    it('connects to transport, handles message passing, and closes cleanly', async () => {
      const sent: any[] = [];
      let messageHandler: ((msg: any) => void) | undefined;
      let startCalled = false;
      let closeCalled = false;

      const mockTransport: any = {
        onMessage: (cb: (msg: any) => void) => {
          messageHandler = cb;
        },
        start: () => {
          startCalled = true;
        },
        send: (res: any) => {
          sent.push(res);
        },
        close: () => {
          closeCalled = true;
        },
      };

      await server.connect(mockTransport);
      expect(startCalled).toBe(true);
      expect(messageHandler).toBeDefined();

      // Send a request through the transport callback
      await messageHandler?.({
        jsonrpc: '2.0',
        id: 807,
        method: 'tools/list',
      });

      expect(sent.length).toBe(1);
      expect(sent[0].id).toBe(807);
      expect(sent[0].result.tools).toBeDefined();

      // Test close
      await server.close();
      expect(closeCalled).toBe(true);
    });

    it('handles aborting active requests on server.close()', async () => {
      const slowPromise = server.handleMessage({
        jsonrpc: '2.0',
        id: 808,
        method: 'tools/call',
        params: { name: 'test_tool', arguments: { action: 'slow' } },
      });

      await new Promise((r) => setTimeout(r, 10));
      await server.close();

      const resp = await slowPromise;
      expect(resp?.error).toBeDefined();
    });

    it('tests NativeStdioTransport send and close directly', () => {
      const transport = new NativeStdioTransport();
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

      transport.send({ jsonrpc: '2.0', id: 1, result: { ok: true } });
      expect(stdoutSpy).toHaveBeenCalledWith(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }) + '\n'
      );

      transport.close();
      stdoutSpy.mockRestore();
    });

    it('verifies production createNativeServer tools and resources', async () => {
      const prod = createNativeServer();
      const toolsResp = await prod.handleMessage({
        jsonrpc: '2.0',
        id: 809,
        method: 'tools/list',
      });
      const tools = (toolsResp?.result as any).tools;
      expect(tools.length).toBe(13);

      const resResp = await prod.handleMessage({
        jsonrpc: '2.0',
        id: 810,
        method: 'resources/list',
      });
      expect((resResp?.result as any).resources).toBeDefined();
    });
  });
});
