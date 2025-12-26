import { ReActAgent } from '@/app/agent/react';
import { NEXT_STEP_PROMPT, SYSTEM_PROMPT } from '@/app/prompt/toolcall';
import { ToolCollection } from '@/app/tool/tool_collection';
import { Terminate } from '@/app/tool/terminate';
import {
  AgentState,
  Function,
  Message,
  type TOOL_CHOICE_TYPE,
  ToolCall,
  ToolChoice,
} from '@/app/schema';
import type { ToolResult } from '@/app/tool/base';
import type { PropertiesOnly } from '@/types/utils';
import { TokenLimitExceeded } from '@/app/utils/error';

const TOOL_CALL_REQUIRED = 'Tool calls required but none provided';

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
    special_tool_names = ['terminate'],
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

  async think(): Promise<boolean> {
    if (this.next_step_prompt) {
      const user_msg = Message.user_message(this.next_step_prompt);
      this.messages = [...this.messages, user_msg];
    }

    try {
      const response = await this.llm.ask_tool({
        messages: this.messages,
        system_msgs: this.system_prompt ? [Message.system_message(this.system_prompt)] : undefined,
        tools: this.available_tools.to_params(),
        tool_choice: this.tool_choices,
      });

      // Convert OpenAI tool_calls to our ToolCall type
      this.tool_calls = (response?.tool_calls ?? [])
        .filter((tc) => tc.type === 'function' && 'function' in tc)
        .map(
          (tc) =>
            new ToolCall({
              id: tc.id,
              type: tc.type,
              fn: new Function({
                name: tc.function.name,
                args: tc.function.arguments,
              }),
            }),
        );
      const content = response?.content ?? '';

      console.info(`✨ ${this.name}'s thoughts: ${content}`);
      console.info(`🛠️ ${this.name} selected ${this.tool_calls.length} tools to use`);
      if (this.tool_calls.length > 0) {
        console.info(`🧰 Tools being prepared: ${this.tool_calls.map((call) => call.fn.name)}`);
        console.info(`🔧 Tool arguments: ${this.tool_calls[0].fn.args}`);
      }

      if (!response) {
        throw new Error('No response received from the LLM');
      }

      // Handle different tool_choices modes
      if (this.tool_choices === ToolChoice.NONE) {
        if (this.tool_calls.length > 0) {
          console.warn(`🤔 Hmm, ${this.name} tried to use tools when they weren't available!`);
        }
        if (content) {
          this.memory.add_message(Message.assistant_message({ content }));
          return true;
        }
        return false;
      }

      // Create and add assistant message
      const assistant_msg =
        this.tool_calls.length > 0
          ? Message.from_tool_calls({ content, tool_calls: this.tool_calls })
          : Message.assistant_message({ content });
      this.memory.add_message(assistant_msg);

      if (this.tool_choices === ToolChoice.REQUIRED && this.tool_calls.length === 0) {
        return true; // Will be handled in act()
      }

      // For 'auto' mode, continue with content if no commands but content exists
      if (this.tool_choices === ToolChoice.AUTO && this.tool_calls.length === 0) {
        return Boolean(content);
      }

      return this.tool_calls.length > 0;
    } catch (e) {
      // Check if this is a RetryError containing TokenLimitExceeded
      if (e instanceof TokenLimitExceeded || (e as any)?.__cause__ instanceof TokenLimitExceeded) {
        const tokenError = e instanceof TokenLimitExceeded ? e : (e as any).__cause__;
        console.error(`🚨 Token limit error: ${tokenError}`);
        this.memory.add_message(
          Message.assistant_message({
            content: `Maximum token limit reached, cannot continue execution: ${String(tokenError)}`,
          }),
        );
        this.state = AgentState.FINISHED;
        return false;
      }
      console.error(`🚨 Oops! The ${this.name}'s thinking process hit a snag: ${e}`);
      this.memory.add_message(
        Message.assistant_message({
          content: `Error encountered while processing: ${String(e)}`,
        }),
      );
      return false;
    }
  }

  async act(): Promise<string> {
    if (this.tool_calls.length === 0) {
      if (this.tool_choices === ToolChoice.REQUIRED) {
        throw new Error(TOOL_CALL_REQUIRED);
      }
      // Return last message content if no tool calls
      const lastMsg = this.messages[this.messages.length - 1];
      return lastMsg?.content || 'No content or commands to execute';
    }

    const results: string[] = [];
    for (const command of this.tool_calls) {
      // Reset base64_image for each tool call
      this._current_base64_image = undefined;

      let result = await this.execute_tool(command);

      if (typeof this.max_observe === 'number' && this.max_observe > 0) {
        result = result.slice(0, this.max_observe);
      }

      console.info(`🎯 Tool '${command.fn.name}' completed its mission! Result: ${result}`);

      // Add tool response to memory
      const tool_msg = Message.tool_message({
        content: result,
        tool_call_id: command.id,
        name: command.fn.name,
        base64_image: this._current_base64_image,
      });
      this.memory.add_message(tool_msg);
      results.push(result);
    }

    return results.join('\n\n');
  }

  async execute_tool(command: ToolCall): Promise<string> {
    if (!command?.fn?.name) {
      return 'Error: Invalid command format';
    }

    const name = command.fn.name;
    if (!this.available_tools.tool_map.has(name)) {
      return `Error: Unknown tool '${name}'`;
    }

    try {
      // Parse arguments
      const args = JSON.parse(command.fn.args || '{}');

      // Execute the tool
      console.info(`🔧 Activating tool: '${name}'...`);
      const result: ToolResult = await this.available_tools.excute({ name, tool_input: args });

      // Handle special tools
      await this._handle_special_tool(name, result);

      // Check if result has base64_image
      if (result?.base64_image) {
        this._current_base64_image = result.base64_image;
      }

      // Format result for display
      const observation = result?.isTruthy()
        ? `Observed output of cmd \`${name}\` executed:\n${String(result)}`
        : `Cmd \`${name}\` completed with no output`;

      return observation;
    } catch (e) {
      if (e instanceof SyntaxError) {
        const error_msg = `Error parsing arguments for ${name}: Invalid JSON format`;
        console.error(
          `📝 Oops! The arguments for '${name}' don't make sense - invalid JSON, arguments:${command.fn.args}`,
        );
        return `Error: ${error_msg}`;
      }
      const error_msg = `⚠️ Tool '${name}' encountered a problem: ${String(e)}`;
      console.error(error_msg);
      return `Error: ${error_msg}`;
    }
  }

  async _handle_special_tool(name: string, result: any): Promise<void> {
    if (!this._is_special_tool(name)) {
      return;
    }

    if (this._should_finish_execution(name, result)) {
      console.info(`🏁 Special tool '${name}' has completed the task!`);
      this.state = AgentState.FINISHED;
    }
  }

  _should_finish_execution(_name: string, _result?: any): boolean {
    return true;
  }

  _is_special_tool(name: string): boolean {
    return this.special_tool_names.map((n) => n.toLowerCase()).includes(name.toLowerCase());
  }

  async cleanup(): Promise<void> {
    console.info(`🧹 Cleaning up resources for agent '${this.name}'...`);
    for (const [tool_name, tool_instance] of this.available_tools.tool_map) {
      if ('cleanup' in tool_instance && typeof tool_instance.cleanup === 'function') {
        try {
          console.debug(`🧼 Cleaning up tool: ${tool_name}`);
          await tool_instance.cleanup();
        } catch (e) {
          console.error(`🚨 Error cleaning up tool '${tool_name}': ${e}`);
        }
      }
    }
    console.info(`✨ Cleanup complete for agent '${this.name}'.`);
  }

  async run(request?: string): Promise<string> {
    try {
      return await super.run(request);
    } finally {
      await this.cleanup();
    }
  }
}
