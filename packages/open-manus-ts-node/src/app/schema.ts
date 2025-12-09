import type { PropertiesOnly } from '@/types/utils';

export const Role = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
} as const;
export const ROLE_VALUES = Array.from(Object.values(Role));
export type ROLE_TYPE = (typeof Role)[keyof typeof Role];

export const ToolChoice = {
  NONE: 'none',
  AUTO: 'auto',
  REQUIRED: 'required',
} as const;
export const TOOL_CHOICE_VALUES = Array.from(Object.values(ToolChoice));
export type TOOL_CHOICE_TYPE = (typeof ToolChoice)[keyof typeof ToolChoice];

export const AgentState = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  FINISHED: 'FINISHED',
  ERROR: 'ERROR',
} as const;
export const AGENT_STATE_VALUES = Array.from(Object.values(AgentState));
export type AGENT_STATE_TYPE = (typeof AgentState)[keyof typeof AgentState];

export class Function {
  public name: string;
  public args: string;
  constructor({ name, args }: Function) {
    this.name = name;
    this.args = args;
  }
}

export class ToolCall {
  public id: string;
  public type: string = 'function';
  public fn: Function;
  constructor({ id, type = 'function', fn }: ToolCall) {
    this.id = id;
    this.type = type;
    this.fn = fn;
  }
}

export class Message {
  role: ROLE_TYPE;
  content?: string;
  tool_calls?: ToolCall[];
  name?: string;
  tool_call_id?: string;
  base64_image?: string;

  constructor({
    role,
    content,
    name,
    tool_calls,
    base64_image,
    tool_call_id,
  }: PropertiesOnly<Message>) {
    this.role = role;
    this.content = content;
    this.name = name;
    this.tool_calls = tool_calls;
    this.tool_call_id = tool_call_id;
    this.base64_image = base64_image;
  }

  private __add__(other: Message[] | Message): Message[] {
    if (other instanceof Array) {
      return [this, ...other];
    } else if (other instanceof Message) {
      return [this, other];
    } else {
      throw new TypeError('unsupported operand type(s)');
    }
  }
  private __radd__(other: Message[]): Message[] {
    if (other instanceof Array) {
      return [...other, this];
    } else {
      throw new TypeError('unsupported operand type(s)');
    }
  }
  public to_dict() {
    const message: PropertiesOnly<Message> = { role: this.role };
    if (this.content) message.content = this.content;

    if (this.tool_calls) message.tool_calls = this.tool_calls;

    if (this.name) message.name = this.name;

    if (this.tool_call_id) message.tool_call_id = this.tool_call_id;

    if (this.base64_image) message.base64_image = this.base64_image;
    return message;
  }
  static user_message(content: string): Message {
    return new Message({ role: Role.USER, content });
  }
  static system_message(content: string): Message {
    return new Message({ role: Role.SYSTEM, content });
  }
  static assistant_message({
    content,
    base64_image,
  }: Pick<Message, 'content' | 'base64_image'>): Message {
    return new Message({ role: Role.ASSISTANT, content, base64_image });
  }
  static tool_message({
    content,
    name,
    tool_call_id,
    base64_image,
  }: Pick<Message, 'content' | 'name' | 'tool_call_id' | 'base64_image'>): Message {
    return new Message({
      role: Role.TOOL,
      content,
      name,
      tool_call_id,
      base64_image,
    });
  }
  static from_tool_calls(params: Omit<PropertiesOnly<Message>, 'role'>): Message {
    return new Message({ role: Role.TOOL, ...params });
  }
}

export class Memory {
  messages: Message[] = [];
  max_messages: number = 100;

  public add_message(message: Message): void {
    this.messages.push(message);
    if (this.messages.length > this.max_messages) {
      this.messages = this.messages.slice(-this.max_messages);
    }
  }
  public add_messages(messages: Message[]): void {
    this.messages.push(...messages);
    if (this.messages.length > this.max_messages) {
      this.messages = this.messages.slice(-this.max_messages);
    }
  }
  public clear(): void {
    this.messages = [];
  }
  public get_recent_messages(n: number): Message[] {
    return this.messages.slice(-n);
  }
  public to_dict_list() {
    return this.messages.map((m) => m.to_dict());
  }
}
