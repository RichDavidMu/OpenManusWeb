import { ToolCallAgent } from '@/app/toolcall';
import { MULTIMEDIA_RESPONSE_PROMPT, NEXT_STEP_PROMPT, SYSTEM_PROMPT } from '@/app/prompt/mcp';
import { AgentState, Message } from '@/app/schema';
import { MCPClients } from '@/app/tool/mcp';
import type { PropertiesOnly } from '@/types/utils';

type ConnectionType = 'stdio' | 'sse';

/**
 * Agent for interacting with MCP (Model Context Protocol) servers.
 *
 * This agent connects to an MCP server using either SSE or stdio transport
 * and makes the server's tools available through the agent's tool interface.
 */
export class MCPAgent extends ToolCallAgent {
  name = 'mcp_agent';
  description = 'An agent that connects to an MCP server and uses its tools.';

  system_prompt = SYSTEM_PROMPT;
  next_step_prompt = NEXT_STEP_PROMPT;

  // MCP client collection
  mcp_clients: MCPClients;

  max_steps = 20;
  connection_type: ConnectionType = 'stdio';

  // Track tool schemas to detect changes
  tool_schemas: Map<string, Record<string, any>> = new Map();
  private _refresh_tools_interval = 5;

  // Special tool names that should trigger termination
  special_tool_names: string[] = ['terminate'];

  constructor(params: Partial<PropertiesOnly<MCPAgent>> = {}) {
    const mcp_clients = params.mcp_clients || new MCPClients();
    super({
      ...params,
      available_tools: mcp_clients,
    });
    this.mcp_clients = mcp_clients;
    if (params.connection_type) {
      this.connection_type = params.connection_type;
    }
    if (params.max_steps) {
      this.max_steps = params.max_steps;
    }
    if (params.special_tool_names) {
      this.special_tool_names = params.special_tool_names;
    }
  }

  /**
   * Initialize the MCP connection.
   */
  async initialize({
    connection_type,
    server_url,
    command,
    args,
  }: {
    connection_type?: ConnectionType;
    server_url?: string;
    command?: string;
    args?: string[];
  } = {}): Promise<void> {
    if (connection_type) {
      this.connection_type = connection_type;
    }

    // Connect to the MCP server based on connection type
    if (this.connection_type === 'sse') {
      if (!server_url) {
        throw new Error('Server URL is required for SSE connection');
      }
      await this.mcp_clients.connect_sse(server_url);
    } else if (this.connection_type === 'stdio') {
      if (!command) {
        throw new Error('Command is required for stdio connection');
      }
      await this.mcp_clients.connect_stdio(command, args || []);
    } else {
      throw new Error(`Unsupported connection type: ${this.connection_type}`);
    }

    // Set available_tools to our MCP instance
    this.available_tools = this.mcp_clients;

    // Store initial tool schemas
    await this._refresh_tools();

    // Add system message about available tools
    const tool_names = Array.from(this.mcp_clients.tool_map.keys());
    const tools_info = tool_names.join(', ');

    // Add system prompt and available tools information
    this.memory.add_message(
      Message.system_message(`${this.system_prompt}\n\nAvailable MCP tools: ${tools_info}`),
    );
  }

  /**
   * Refresh the list of available tools from the MCP server.
   * @returns A tuple of [added_tools, removed_tools]
   */
  private async _refresh_tools(): Promise<[string[], string[]]> {
    if (this.mcp_clients.clients.size === 0) {
      return [[], []];
    }

    // Get current tool schemas directly from the server
    const response = await this.mcp_clients.list_tools();
    const current_tools = new Map<string, Record<string, any>>();
    for (const tool of response.tools) {
      current_tools.set(tool.name, tool.inputSchema as Record<string, any>);
    }

    // Determine added, removed, and changed tools
    const current_names = new Set(current_tools.keys());
    const previous_names = new Set(this.tool_schemas.keys());

    const added_tools: string[] = [];
    const removed_tools: string[] = [];
    const changed_tools: string[] = [];

    for (const name of current_names) {
      if (!previous_names.has(name)) {
        added_tools.push(name);
      }
    }

    for (const name of previous_names) {
      if (!current_names.has(name)) {
        removed_tools.push(name);
      }
    }

    // Check for schema changes in existing tools
    for (const name of current_names) {
      if (previous_names.has(name)) {
        const currentSchema = current_tools.get(name);
        const previousSchema = this.tool_schemas.get(name);
        if (JSON.stringify(currentSchema) !== JSON.stringify(previousSchema)) {
          changed_tools.push(name);
        }
      }
    }

    // Update stored schemas
    this.tool_schemas = current_tools;

    // Log and notify about changes
    if (added_tools.length > 0) {
      console.info(`Added MCP tools: ${added_tools}`);
      this.memory.add_message(
        Message.system_message(`New tools available: ${added_tools.join(', ')}`),
      );
    }
    if (removed_tools.length > 0) {
      console.info(`Removed MCP tools: ${removed_tools}`);
      this.memory.add_message(
        Message.system_message(`Tools no longer available: ${removed_tools.join(', ')}`),
      );
    }
    if (changed_tools.length > 0) {
      console.info(`Changed MCP tools: ${changed_tools}`);
    }

    return [added_tools, removed_tools];
  }

  /**
   * Process current state and decide next action.
   */
  async think(): Promise<boolean> {
    // Check MCP session and tools availability
    if (this.mcp_clients.clients.size === 0 || this.mcp_clients.tool_map.size === 0) {
      console.info('MCP service is no longer available, ending interaction');
      this.state = AgentState.FINISHED;
      return false;
    }

    // Refresh tools periodically
    if (this.current_step % this._refresh_tools_interval === 0) {
      await this._refresh_tools();
      // All tools removed indicates shutdown
      if (this.mcp_clients.tool_map.size === 0) {
        console.info('MCP service has shut down, ending interaction');
        this.state = AgentState.FINISHED;
        return false;
      }
    }

    // Use the parent class's think method
    return await super.think();
  }

  /**
   * Handle special tool execution and state changes.
   */
  async _handle_special_tool(name: string, result: any): Promise<void> {
    // First process with parent handler
    await super._handle_special_tool(name, result);

    // Handle multimedia responses
    if (result && typeof result === 'object' && 'base64_image' in result && result.base64_image) {
      this.memory.add_message(
        Message.system_message(MULTIMEDIA_RESPONSE_PROMPT.replace('{tool_name}', name)),
      );
    }
  }

  /**
   * Determine if tool execution should finish the agent.
   */
  _should_finish_execution(name: string, _result?: any): boolean {
    return name.toLowerCase() === 'terminate';
  }

  /**
   * Clean up MCP connection when done.
   */
  async cleanup(): Promise<void> {
    if (this.mcp_clients.clients.size > 0) {
      await this.mcp_clients.disconnect();
      console.info('MCP connection closed');
    }
  }

  /**
   * Run the agent with cleanup when done.
   */
  async run(request?: string): Promise<string> {
    try {
      const result = await super.run(request);
      return result;
    } finally {
      await this.cleanup();
    }
  }
}
