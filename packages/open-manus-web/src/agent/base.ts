import { LLM } from '@/llm';
import type { AGENT_STATE_TYPE, ROLE_TYPE } from '@/schema';
import { AGENT_STATE_VALUES, AgentState, Memory, Message, Role } from '@/schema';

export abstract class BaseAgent {
  // Unique name of the agent
  name: string;
  // Optional agent description
  description?: string;
  // System-level instruction prompt
  system_prompt?: string;
  // Prompt for determining next action
  next_step_prompt?: string;
  /*
    Dependencies
   */
  llm: LLM;
  memory: Memory;
  state: AGENT_STATE_TYPE = AgentState.IDLE;
  /*
    Execution control
   */
  max_steps: number;
  current_step: number;

  duplicate_threshold: number = 2;

  config = {
    arbitrary_types_allowed: true,
    extra: 'allow',
  };
  constructor({
    name,
    description,
    system_prompt,
    next_step_prompt,
    llm = new LLM({}),
    memory = new Memory(),
    state = AgentState.IDLE,
    max_steps = 10,
    current_step = 0,
  }: Partial<BaseAgent> & { name: string }) {
    this.name = name;
    this.description = description;
    this.system_prompt = system_prompt;
    this.next_step_prompt = next_step_prompt;

    this.llm = llm;
    this.memory = memory;
    this.state = state;

    this.max_steps = max_steps;
    this.current_step = current_step;

    this.initialize_agent();
  }

  initialize_agent(): BaseAgent {
    if (!(this.llm instanceof LLM)) {
      this.llm = new LLM({ config_name: this.name.toLowerCase() });
    }
    if (!(this.memory instanceof Memory)) {
      this.memory = new Memory();
    }
    return this;
  }

  async state_context<T>(new_state: AGENT_STATE_TYPE, fn: () => Promise<T>) {
    if (!AGENT_STATE_VALUES.includes(new_state)) {
      throw new Error(`Invalid state: ${new_state}`);
    }
    const prevState = this.state;
    this.state = new_state;

    try {
      return await fn();
    } catch (e) {
      this.state = AgentState.ERROR;
      throw e;
    } finally {
      this.state = prevState;
    }
  }

  update_memory({
    role,
    content,
    base64_image,
    ...extra
  }: Partial<Message> & { role: ROLE_TYPE; content: string }): void {
    const message_map = {
      user: Message.user_message,
      system: Message.system_message,
      assistant: (content: string) => Message.assistant_message({ content, base64_image }),
      tool: (content: string) => Message.tool_message({ content, ...extra }),
    };
    if (!message_map[role]) {
      throw new Error(`Unsupported role: ${role}`);
    }
    this.memory.add_message(message_map[role](content));
  }

  async run(request?: string) {
    if (this.state !== AgentState.IDLE) {
      throw new Error(`Cannot run agent from state: ${this.state}`);
    }
    if (request) {
      this.update_memory({ role: Role.USER, content: request });
    }
    const results: string[] = [];
    return await this.state_context(AgentState.RUNNING, async () => {
      while (this.current_step < this.max_steps && this.state !== AgentState.FINISHED) {
        this.current_step += 1;
        // console.log(`Executing step ${this.current_step}/${this.max_steps}`);

        const stepResult = await this.step();

        if (this.is_stuck()) this.handle_stuck_state();

        results.push(`Step ${this.current_step}: ${stepResult}`);
      }
      if (this.current_step >= this.max_steps) {
        this.current_step = 0;
        this.state = AgentState.IDLE;
        results.push(`Terminated: Reached max steps (${this.max_steps})`);
      }
      // TODO: SANDBOX_CLIENT
      // await SANDBOX_CLIENT.cleanup();

      return results.join('\n') || 'No steps executed';
    });
  }

  abstract step(): Promise<string>;

  handle_stuck_state(): void {
    const stuckPrompt =
      'Observed duplicate responses. Consider new strategies and avoid repeating ineffective paths already attempted.';

    this.next_step_prompt = `${stuckPrompt}\n${this.next_step_prompt ?? ''}`;

    // console.warn(`Agent detected stuck state. Added prompt: ${stuckPrompt}`);
  }

  is_stuck(): boolean {
    const msgs = this.memory.messages;
    if (msgs.length < 2) return false;

    const last = msgs[msgs.length - 1];
    if (!last.content) return false;

    const duplicateCount = msgs
      .slice(0, -1)
      .reverse()
      .filter((m) => m.role === 'assistant' && m.content === last.content).length;

    return duplicateCount >= this.duplicate_threshold;
  }

  get messages(): Message[] {
    return this.memory.messages;
  }

  set messages(v: Message[]) {
    this.memory.messages = v;
  }
}
