import { ReActAgent } from '@/app/agent/react';
import { NEXT_STEP_PROMPT, SYSTEM_PROMPT } from '@/app/prompt/toolcall';
import { ToolCollection } from '@/app/tool/tool_collection';
import { Terminate } from '@/app/tool/terminate';
import { type TOOL_CHOICE_TYPE, type ToolCall, ToolChoice } from '@/app/schema';
import type { PropertiesOnly } from '@/types/utils';

export class ToolCallAgent extends ReActAgent {
  name = 'toolcall';
  description = 'an agent that can execute tool calls.';
  system_prompt = SYSTEM_PROMPT;
  next_step_prompt = NEXT_STEP_PROMPT;

  available_tools: ToolCollection;
  tool_choices: TOOL_CHOICE_TYPE;
  special_tool_names: string[];
  tool_calls: ToolCall[];
  private _current_base64_image?: string;
  max_observe?: number | boolean;
  max_steps = 30;

  constructor({
    available_tools = new ToolCollection({ tools: [new Terminate()] }),
    tool_choices = ToolChoice.AUTO,
    special_tool_names = [Terminate.name],
    tool_calls = [],
    max_observe,
    ...params
  }: Partial<PropertiesOnly<ToolCallAgent>>) {
    super(params);
    this.available_tools = available_tools;
    this.tool_choices = tool_choices;
    this.special_tool_names = special_tool_names;
    this.tool_calls = tool_calls;
    this.max_observe = max_observe;
  }

  think(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  act(): Promise<string> {
    throw new Error('Method not implemented.');
  }
}
