import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { server } from '../../src/server.js';
import { closeAllDbs } from '../../src/engine/db.js';
import { TOOL_ACTION_REGISTRY } from '../../src/engine/advisor.js';

describe('VS Code & Copilot Client Tool Dispatch Simulation', () => {
  let client: Client;
  const simulatedToolRegistry = new Map<string, any>();

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      {
        name: 'vscode-copilot-simulator',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    // Simulate VS Code extension host discovering tools via tools/list
    const toolsResult = await client.listTools();
    for (const tool of toolsResult.tools) {
      simulatedToolRegistry.set(tool.name, {
        name: tool.name,
        invoke: async (args: any) => {
          return await client.callTool({
            name: tool.name,
            arguments: args,
          });
        },
      });
    }
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    closeAllDbs();
  });

  it('should have all 13 consolidated tools in the simulated VS Code registry', () => {
    expect(simulatedToolRegistry.size).toBe(13);
    for (const toolName of Object.keys(TOOL_ACTION_REGISTRY)) {
      expect(simulatedToolRegistry.has(toolName)).toBe(true);
    }
  });

  it('should safely invoke every registered tool without throwing unhandled exceptions', async () => {
    for (const [toolName, toolProvider] of simulatedToolRegistry.entries()) {
      // Simulate Copilot invoking tool with missing action (should auto-heal or return guidance)
      const res = await toolProvider.invoke({});
      expect(res).toBeDefined();
      expect(Array.isArray(res.content)).toBe(true);
      expect(res.content[0].type).toBe('text');
    }
  });

  it('should handle simulated invalid actions and return structured self-healing guidance', async () => {
    const nodeTool = simulatedToolRegistry.get('manage_nodes');
    expect(nodeTool).toBeDefined();

    const res = await nodeTool.invoke({ action: 'non_existent_action_123' });
    expect(res).toBeDefined();
    expect(res.isError).toBe(true);

    const guidance = JSON.parse(res.content[0].text);
    expect(guidance.isError).toBe(true);
    expect(guidance.tool).toBe('manage_nodes');
    expect(guidance.supported_actions).toBeDefined();
    expect(guidance.supported_actions.create).toBeDefined();
  });
});
