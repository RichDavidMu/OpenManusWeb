import { ReActAgent } from '@/app/agent/react';
import { NEXT_STEP_PROMPT, SYSTEM_PROMPT } from '@/app/prompt/toolcall';
import { ToolCollection } from '@/app/tool/tool_collection';
import { Terminate } from '@/app/tool/terminate';
import { type TOOL_CHOICE_TYPE, ToolChoice } from '@/app/schema';

export class ToolCallAgent extends ReActAgent {
  name = 'toolcall';
  description = 'an agent that can execute tool calls.';

  system_prompt = SYSTEM_PROMPT;
  next_step_prompt = NEXT_STEP_PROMPT;

  available_tools: ToolCollection = new ToolCollection({ tools: [new Terminate()] });

  tool_choices: TOOL_CHOICE_TYPE = ToolChoice.AUTO;
  special_tool_names: string[] = [];

  think(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  act(): Promise<string> {
    throw new Error('Method not implemented.');
  }
}
