import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ListToolsResult, TextContent, Tool } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool, ToolResult } from '@/app/tool/base';
import { ToolCollection } from '@/app/tool/tool_collection';

type HttpTransport = StreamableHTTPClientTransport | SSEClientTransport;

/**
 * Represents a tool proxy that can be called on the MCP server from the client side.
 */
export class MCPClientTool extends BaseTool {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  client?: Client;
  server_id: string = '';
  original_name: string = '';

  constructor({
    name,
    description,
    parameters,
    client,
    server_id,
    original_name,
  }: {
    name: string;
    description: string;
    parameters?: Record<string, any>;
    client?: Client;
    server_id?: string;
    original_name?: string;
  }) {
    super();
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.client = client;
    this.server_id = server_id || '';
    this.original_name = original_name || name;
  }

  async execute(params?: Record<string, any>): Promise<ToolResult> {
    if (!this.client) {
      return new ToolResult({ error: 'Not connected to MCP server' });
    }

    try {
      console.info(`Executing tool: ${this.original_name}`);
      const result = await this.client.callTool({
        name: this.original_name,
        arguments: params || {},
      });

      const content = result.content as Array<{ type: string; text?: string }>;
      const contentStr = content
        .filter(
          (item): item is TextContent => item.type === 'text' && typeof item.text === 'string',
        )
        .map((item) => item.text)
        .join(', ');

      return new ToolResult({ output: contentStr || 'No output returned.' });
    } catch (e) {
      return new ToolResult({ error: `Error executing tool: ${String(e)}` });
    }
  }

  async cleanup(): Promise<void> {
    // Individual tool cleanup if needed
  }
}

/**
 * A collection of tools that connects to multiple MCP servers
 * and manages available tools through the Model Context Protocol.
 */
export class MCPClients extends ToolCollection {
  clients: Map<string, Client> = new Map();
  transports: Map<string, HttpTransport | StdioClientTransport> = new Map();
  description: string = 'MCP client tools for server interaction';

  constructor() {
    super({ tools: [] });
  }

  /**
   * Connect to an MCP server using HTTP transport.
   * Tries Streamable HTTP first, falls back to SSE for backwards compatibility.
   */
  async connect_sse(server_url: string, server_id?: string): Promise<void> {
    if (!server_url) {
      throw new Error('Server URL is required.');
    }

    const id = server_id || server_url;

    // Ensure clean disconnection before new connection
    if (this.clients.has(id)) {
      await this.disconnect(id);
    }

    const baseUrl = new URL(server_url);
    let client: Client;
    let transport: HttpTransport;

    try {
      // First try Streamable HTTP (recommended)
      client = new Client(
        { name: 'open-manus-mcp-client', version: '1.0.0' },
        { capabilities: {} },
      );
      transport = new StreamableHTTPClientTransport(baseUrl);
      await client.connect(transport);
      console.info(`Connected to MCP server ${id} using Streamable HTTP`);
    } catch {
      // Fall back to SSE for backwards compatibility
      client = new Client(
        { name: 'open-manus-mcp-client', version: '1.0.0' },
        { capabilities: {} },
      );
      transport = new SSEClientTransport(baseUrl);
      await client.connect(transport);
      console.info(`Connected to MCP server ${id} using SSE (fallback)`);
    }

    this.clients.set(id, client);
    this.transports.set(id, transport);

    await this._initialize_and_list_tools(id);
  }

  /**
   * Connect to an MCP server using stdio transport.
   */
  async connect_stdio(command: string, args: string[] = [], server_id?: string): Promise<void> {
    if (!command) {
      throw new Error('Server command is required.');
    }

    const id = server_id || command;

    // Ensure clean disconnection before new connection
    if (this.clients.has(id)) {
      await this.disconnect(id);
    }

    const transport = new StdioClientTransport({
      command,
      args,
    });

    const client = new Client(
      {
        name: 'open-manus-mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);
    this.clients.set(id, client);
    this.transports.set(id, transport);

    await this._initialize_and_list_tools(id);
  }

  /**
   * Initialize session and populate tool map.
   */
  private async _initialize_and_list_tools(server_id: string): Promise<void> {
    const client = this.clients.get(server_id);
    if (!client) {
      throw new Error(`Client not initialized for server ${server_id}`);
    }

    const response = await client.listTools();

    // Create proper tool objects for each server tool
    for (const tool of response.tools) {
      const original_name = tool.name;
      let tool_name = `mcp_${server_id}_${original_name}`;
      tool_name = this._sanitize_tool_name(tool_name);

      const serverTool = new MCPClientTool({
        name: tool_name,
        description: tool.description || '',
        parameters: tool.inputSchema as Record<string, any>,
        client,
        server_id,
        original_name,
      });

      this.tool_map.set(tool_name, serverTool);
    }

    // Update tools array
    this.tools = Array.from(this.tool_map.values());
    console.info(
      `Connected to server ${server_id} with tools: ${response.tools.map((t: Tool) => t.name)}`,
    );
  }

  /**
   * Sanitize tool name to match MCPClientTool requirements.
   */
  private _sanitize_tool_name(name: string): string {
    // Replace invalid characters with underscores
    let sanitized = name.replace(/[^\w-]/g, '_');

    // Remove consecutive underscores
    sanitized = sanitized.replace(/_+/g, '_');

    // Remove leading/trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');

    // Truncate to 64 characters if needed
    if (sanitized.length > 64) {
      sanitized = sanitized.slice(0, 64);
    }

    return sanitized;
  }

  /**
   * List all available tools from all connected servers.
   */
  async list_tools(): Promise<ListToolsResult> {
    const allTools: Tool[] = [];
    for (const client of this.clients.values()) {
      const response = await client.listTools();
      allTools.push(...response.tools);
    }
    return { tools: allTools };
  }

  /**
   * Disconnect from a specific MCP server or all servers if no server_id provided.
   */
  async disconnect(server_id?: string): Promise<void> {
    if (server_id) {
      if (this.clients.has(server_id)) {
        try {
          const client = this.clients.get(server_id);
          const transport = this.transports.get(server_id);

          // Close the client and transport
          if (client) {
            await client.close();
          }
          if (transport) {
            await transport.close();
          }

          // Clean up references
          this.clients.delete(server_id);
          this.transports.delete(server_id);

          // Remove tools associated with this server
          for (const [key, tool] of this.tool_map.entries()) {
            if ((tool as MCPClientTool).server_id === server_id) {
              this.tool_map.delete(key);
            }
          }
          this.tools = Array.from(this.tool_map.values());
          console.info(`Disconnected from MCP server ${server_id}`);
        } catch (e) {
          console.error(`Error disconnecting from server ${server_id}: ${e}`);
        }
      }
    } else {
      // Disconnect from all servers
      const serverIds = Array.from(this.clients.keys()).sort();
      for (const sid of serverIds) {
        await this.disconnect(sid);
      }
      this.tool_map.clear();
      this.tools = [];
      console.info('Disconnected from all MCP servers');
    }
  }
}
