import { type BaseTool, ToolFailure, type ToolResult } from '@/app/tool/base';
import type { PropertiesOnly } from '@/types/utils';
import { isInstance } from '@/app/utils/proto';
import { ToolError } from '@/app/utils/error';

export class ToolCollection {
  tools: BaseTool[];
  tool_map: Map<string, BaseTool>;
  constructor({ tools }: Omit<PropertiesOnly<ToolCollection>, 'tool_map'>) {
    this.tools = tools;
    this.tool_map = new Map(this.tools.map((tool) => [tool.name, tool]));
  }
  [Symbol.iterator]() {
    return this.tools[Symbol.iterator]();
  }
  to_params() {
    return this.tools.map((tool) => tool.to_param());
  }
  async excute({
    name,
    tool_input,
  }: {
    name: string;
    tool_input: Record<string, any>;
  }): Promise<ToolResult> {
    const tool = this.tool_map.get(name);
    if (!tool) {
      return new ToolFailure({ error: `Tool ${name} not found` });
    }
    try {
      return await tool.execute(tool_input);
    } catch (e) {
      if (isInstance(e, ToolError)) {
        return new ToolFailure({ error: (e as ToolError).message });
      }
      throw e;
    }
  }
  async excute_all(): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const tool of this.tools) {
      try {
        const result = await tool.execute();
        results.push(result);
      } catch (e) {
        if (isInstance(e, ToolError)) {
          results.push(new ToolFailure({ error: (e as ToolError).message }));
        }
      }
    }
    return results;
  }
  get_tool(name: string) {
    return this.tool_map.get(name);
  }
  add_tool(tool: BaseTool) {
    if (this.tool_map.has(tool.name)) {
      console.warn(`Tool ${tool.name} already exists`);
      return this;
    }
    this.tools.push(tool);
    this.tool_map.set(tool.name, tool);
    return this;
  }

  add_tools(tools: BaseTool[]) {
    for (const tool of tools) {
      this.add_tool(tool);
    }
    return this;
  }
}
