import * as readline from 'readline';

/**
 * Standard JSON-RPC 2.0 Error Codes
 */
export enum ErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
}

/**
 * Typed McpError hierarchy
 */
export class McpError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface ToolDefinitionMetadata {
  title?: string;
  description?: string;
  inputSchema?: Record<string, any>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface ToolRegistration {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, any>;
  annotations?: Record<string, any>;
  handler: (args: any, extra?: { signal?: AbortSignal }) => Promise<any> | any;
}

export interface ResourceRegistration {
  name: string;
  uri?: string;
  template?: NativeResourceTemplate;
  title?: string;
  description?: string;
  mimeType?: string;
  handler: (uri: URL, variables?: any, extra?: { signal?: AbortSignal }) => Promise<any> | any;
}

export interface PromptRegistration {
  name: string;
  title?: string;
  description?: string;
  argsSchema?: Record<string, any>;
  handler: (args: any, extra?: { signal?: AbortSignal }) => Promise<any> | any;
}

/**
 * RFC 6570-compatible simple URI template matcher
 */
export class NativeResourceTemplate {
  private paramNames: string[] = [];
  private regex: RegExp;

  constructor(
    public uriTemplate: string,
    public options?: { list?: undefined }
  ) {
    const tpl = typeof uriTemplate === 'string' ? uriTemplate : String(uriTemplate || '');
    this.uriTemplate = tpl;
    const pattern = tpl.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
      this.paramNames.push(name);
      return '([^/]+)';
    });
    this.regex = new RegExp(`^${pattern}$`);
  }

  match(uri: string): Record<string, string> | null {
    const m = this.regex.exec(uri);
    if (!m) return null;
    const vars: Record<string, string> = {};
    this.paramNames.forEach((name, idx) => {
      vars[name] = decodeURIComponent(m[idx + 1]);
    });
    return vars;
  }
}

/**
 * Recursively ensures all array-type fields in a JSON Schema have an `items` property.
 * Gemini API rejects schemas where `type: 'array'` lacks `items`.
 */
function ensureArrayItems(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(ensureArrayItems);
  const out: any = {};
  for (const key of Object.keys(schema)) {
    out[key] = ensureArrayItems(schema[key]);
  }
  if (out.type === 'array' && !out.items) {
    out.items = {};
  }
  return out;
}

/**
 * Validates tool parameters against JSON Schema inputSchema
 * Throws McpError with code -32602 (InvalidParams) on violation.
 */
export function validateParams(
  toolName: string,
  schema: Record<string, any> | undefined,
  args: any
): void {
  if (!schema) return;
  const actualArgs = args && typeof args === 'object' ? args : {};

  // 1. Check required fields
  if (Array.isArray(schema.required)) {
    for (const req of schema.required) {
      if (actualArgs[req] === undefined || actualArgs[req] === null) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Missing required argument: "${req}" for tool "${toolName}"`
        );
      }
    }
  }

  // 2. Check declared property types & enum restrictions
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
      const val = actualArgs[key];
      if (val === undefined || val === null) continue;

      const expectedType = prop.type;
      if (expectedType === 'string' && typeof val !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid type for "${key}" on tool "${toolName}": expected string, got ${typeof val}`
        );
      }
      if (expectedType === 'number' && typeof val !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid type for "${key}" on tool "${toolName}": expected number, got ${typeof val}`
        );
      }
      if (expectedType === 'boolean' && typeof val !== 'boolean') {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid type for "${key}" on tool "${toolName}": expected boolean, got ${typeof val}`
        );
      }
      if (expectedType === 'array' && !Array.isArray(val)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid type for "${key}" on tool "${toolName}": expected array, got ${typeof val}`
        );
      }
      if (expectedType === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid type for "${key}" on tool "${toolName}": expected object, got ${typeof val}`
        );
      }
      if (Array.isArray(prop.enum) && prop.enum.length > 0 && !prop.enum.includes(val)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid value for "${key}" on tool "${toolName}": expected one of [${prop.enum.join(', ')}], got "${val}"`
        );
      }
    }
  }
}

/**
 * Pure Node.js Stdio Server Transport for MCP JSON-RPC 2.0
 */
export class NativeStdioTransport {
  private rl?: readline.Interface;
  private messageCallback?: (msg: JsonRpcRequest) => void;

  onMessage(callback: (msg: JsonRpcRequest) => void): void {
    this.messageCallback = callback;
  }

  start(): void {
    // CRITICAL: omit `output: process.stdout` to prevent echoing client requests back into stdout
    this.rl = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const parsed = JSON.parse(trimmed);
        this.messageCallback?.(parsed);
      } catch {
        this.send({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: ErrorCode.ParseError,
            message: 'Invalid JSON payload received on stdin',
          },
        });
      }
    });
  }

  send(response: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  close(): void {
    this.rl?.close();
  }
}

/**
 * Native MCP Server Engine
 */
export class NativeMcpServer {
  private tools = new Map<string, ToolRegistration>();
  private resources = new Map<string, ResourceRegistration>();
  private resourceTemplates: ResourceRegistration[] = [];
  private prompts = new Map<string, PromptRegistration>();
  private activeRequests = new Map<string | number, AbortController>();
  private transport?: NativeStdioTransport;

  constructor(public serverInfo: { name: string; version: string }) {}

  registerTool(
    name: string,
    metadata: ToolDefinitionMetadata & { rawJsonSchema?: Record<string, any> },
    handler: (args: any, extra?: { signal?: AbortSignal }) => Promise<any> | any
  ): void {
    let schema = (metadata as any).rawJsonSchema || metadata.inputSchema;
    if (schema && typeof (schema as any)._def === 'object') {
      schema = { type: 'object' };
    }
    this.tools.set(name, {
      name,
      title: metadata.title,
      description: metadata.description || '',
      inputSchema: schema || { type: 'object' },
      annotations: metadata.annotations,
      handler,
    });
  }

  registerResource(
    name: string,
    uriOrTemplate: string | NativeResourceTemplate | any,
    metadata: { title?: string; description?: string; mimeType?: string },
    handler: (uri: URL, variables?: any, extra?: { signal?: AbortSignal }) => Promise<any> | any
  ): void {
    if (typeof uriOrTemplate === 'string' && !uriOrTemplate.includes('{')) {
      this.resources.set(uriOrTemplate, {
        name,
        uri: uriOrTemplate,
        title: metadata.title,
        description: metadata.description,
        mimeType: metadata.mimeType,
        handler,
      });
    } else {
      let templateStr = '';
      if (typeof uriOrTemplate === 'string') {
        templateStr = uriOrTemplate;
      } else if (uriOrTemplate instanceof NativeResourceTemplate) {
        templateStr = uriOrTemplate.uriTemplate;
      } else if (uriOrTemplate?._uriTemplate?.template) {
        templateStr = uriOrTemplate._uriTemplate.template;
      } else if (typeof uriOrTemplate?.uriTemplate === 'string') {
        templateStr = uriOrTemplate.uriTemplate;
      } else if (typeof uriOrTemplate?.template === 'string') {
        templateStr = uriOrTemplate.template;
      } else {
        templateStr = String(uriOrTemplate || '');
      }

      const template = new NativeResourceTemplate(templateStr);
      this.resourceTemplates.push({
        name,
        template,
        title: metadata.title,
        description: metadata.description,
        mimeType: metadata.mimeType,
        handler,
      });
    }
  }

  registerPrompt(
    name: string,
    metadata: { title?: string; description?: string; argsSchema?: Record<string, any> },
    handler: (args: any, extra?: { signal?: AbortSignal }) => Promise<any> | any
  ): void {
    this.prompts.set(name, {
      name,
      title: metadata.title,
      description: metadata.description,
      argsSchema: metadata.argsSchema,
      handler,
    });
  }

  async handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (
      !msg ||
      typeof msg !== 'object' ||
      msg.jsonrpc !== '2.0' ||
      typeof msg.method !== 'string'
    ) {
      if (msg && typeof msg === 'object' && msg.id !== undefined) {
        return {
          jsonrpc: '2.0',
          id: msg.id,
          error: {
            code: ErrorCode.InvalidRequest,
            message: 'Invalid JSON-RPC 2.0 request envelope',
          },
        };
      }
      return null;
    }

    const isNotification = msg.id === undefined;
    const id = msg.id!;

    if (isNotification) {
      if (msg.method === 'notifications/cancelled') {
        const cancelId = msg.params?.requestId;
        if (cancelId !== undefined && this.activeRequests.has(cancelId)) {
          this.activeRequests.get(cancelId)?.abort(new Error('Request cancelled by client'));
          this.activeRequests.delete(cancelId);
        }
      }
      return null;
    }

    const controller = new AbortController();
    this.activeRequests.set(id, controller);

    try {
      const result = await this.dispatchMethod(msg.method, msg.params || {}, controller.signal);
      return { jsonrpc: '2.0', id, result };
    } catch (err: any) {
      if (controller.signal.aborted) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: 'Request cancelled' },
        };
      }
      if (err instanceof McpError || (err && typeof err.code === 'number')) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: err.code, message: err.message, data: err.data },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: ErrorCode.InternalError, message: err?.message || 'Internal server error' },
      };
    } finally {
      this.activeRequests.delete(id);
    }
  }

  private async dispatchMethod(
    method: string,
    params: Record<string, any>,
    signal: AbortSignal
  ): Promise<any> {
    switch (method) {
      case 'initialize': {
        const requestedVersion = params?.protocolVersion;
        const supported = ['2024-11-05', '2024-10-07'];
        const protocolVersion = supported.includes(requestedVersion)
          ? requestedVersion
          : '2024-11-05';
        return {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            prompts: { listChanged: false },
          },
          serverInfo: {
            name: this.serverInfo.name,
            version: this.serverInfo.version,
          },
        };
      }

      case 'ping':
        return {};

      case 'tools/list': {
        return {
          tools: Array.from(this.tools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: ensureArrayItems(t.inputSchema),
            annotations: t.annotations,
          })),
        };
      }

      case 'tools/call': {
        const name = params?.name;
        if (!name || typeof name !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Missing tool name in tools/call');
        }
        const tool = this.tools.get(name);
        if (!tool) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        const args = params.arguments || {};
        validateParams(name, tool.inputSchema, args);

        const out = await tool.handler(args, { signal });
        if (out && typeof out === 'object' && Array.isArray((out as any).content)) {
          return out;
        }
        return {
          content: [
            {
              type: 'text',
              text: typeof out === 'string' ? out : JSON.stringify(out, null, 2),
            },
          ],
        };
      }

      case 'resources/list': {
        return {
          resources: Array.from(this.resources.values()).map((r) => ({
            uri: r.uri,
            name: r.name,
            title: r.title,
            description: r.description,
            mimeType: r.mimeType,
          })),
        };
      }

      case 'resources/templates/list': {
        return {
          resourceTemplates: this.resourceTemplates.map((rt) => ({
            name: rt.name,
            uriTemplate: rt.template?.uriTemplate,
            title: rt.title,
            description: rt.description,
            mimeType: rt.mimeType,
          })),
        };
      }

      case 'resources/read': {
        const uri = params?.uri;
        if (!uri || typeof uri !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Missing uri in resources/read');
        }
        const direct = this.resources.get(uri);
        if (direct) {
          return await direct.handler(new URL(uri), {}, { signal });
        }
        for (const rt of this.resourceTemplates) {
          if (!rt.template) continue;
          const vars = rt.template.match(uri);
          if (vars) {
            return await rt.handler(new URL(uri), vars, { signal });
          }
        }
        throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
      }

      case 'prompts/list': {
        return {
          prompts: Array.from(this.prompts.values()).map((p) => {
            const args = p.argsSchema?.properties
              ? Object.entries(p.argsSchema.properties).map(([k, v]: [string, any]) => ({
                  name: k,
                  description: v?.description,
                  required: p.argsSchema?.required?.includes(k) ?? false,
                }))
              : [];
            return {
              name: p.name,
              title: p.title,
              description: p.description,
              arguments: args,
            };
          }),
        };
      }

      case 'prompts/get': {
        const name = params?.name;
        if (!name || typeof name !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Missing prompt name in prompts/get');
        }
        const prompt = this.prompts.get(name);
        if (!prompt) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
        }
        return await prompt.handler(params.arguments || {}, { signal });
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Method not supported: ${method}`);
    }
  }

  get _registeredPrompts(): Record<string, any> {
    const res: Record<string, any> = {};
    for (const [name, p] of this.prompts.entries()) {
      res[name] = {
        name: p.name,
        description: p.description,
        callback: p.handler,
        handler: p.handler,
      };
    }
    return res;
  }

  async connect(transport: any): Promise<void> {
    this.transport = transport;
    const msgHandler = async (msg: any) => {
      const resp = await this.handleMessage(msg);
      if (resp && typeof transport.send === 'function') {
        await transport.send(resp);
      }
    };

    if (typeof transport.onMessage === 'function') {
      transport.onMessage(msgHandler);
    } else {
      transport.onmessage = msgHandler;
    }

    if (typeof transport.start === 'function') {
      await transport.start();
    }
  }

  async close(): Promise<void> {
    for (const controller of this.activeRequests.values()) {
      controller.abort(new Error('Server closed'));
    }
    this.activeRequests.clear();
    if (this.transport) {
      if (typeof (this.transport as any).close === 'function') {
        await (this.transport as any).close();
      }
    }
  }
}

export class NativeInMemoryTransport {
  other?: NativeInMemoryTransport;
  onmessage?: (msg: any) => void;
  onclose?: () => void;

  static createLinkedPair(): [NativeInMemoryTransport, NativeInMemoryTransport] {
    const a = new NativeInMemoryTransport();
    const b = new NativeInMemoryTransport();
    a.other = b;
    b.other = a;
    return [a, b];
  }

  async send(msg: any): Promise<void> {
    queueMicrotask(() => {
      this.other?.onmessage?.(msg);
    });
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  async start(): Promise<void> {}
}

export class NativeClient {
  private id = 0;
  private pending = new Map<
    string | number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();
  private transport?: any;

  constructor(
    public clientInfo: { name: string; version: string },
    public options: any = {}
  ) {}

  async connect(transport: any): Promise<void> {
    this.transport = transport;
    transport.onmessage = (msg: any) => {
      if (msg && msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    };
    if (typeof transport.start === 'function') {
      await transport.start();
    }
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: this.clientInfo,
      capabilities: this.options.capabilities || {},
    });
  }

  async request(method: string, params?: any): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.transport.send({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
    });
  }

  async listTools(): Promise<{ tools: any[] }> {
    return this.request('tools/list');
  }

  async callTool(params: { name: string; arguments?: any }): Promise<any> {
    try {
      return await this.request('tools/call', params);
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: err.message || String(err) }],
      };
    }
  }

  async listResources(): Promise<{ resources: any[] }> {
    return this.request('resources/list');
  }

  async readResource(params: { uri: string }): Promise<any> {
    return this.request('resources/read', params);
  }

  async listPrompts(): Promise<{ prompts: any[] }> {
    return this.request('prompts/list');
  }

  async getPrompt(params: { name: string; arguments?: any }): Promise<any> {
    return this.request('prompts/get', params);
  }

  async close(): Promise<void> {
    if (this.transport && typeof this.transport.close === 'function') {
      await this.transport.close();
    }
  }
}
