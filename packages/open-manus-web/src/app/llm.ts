import * as console from 'node:console';
import { type Tiktoken, type TiktokenModel, encoding_for_model, get_encoding } from 'tiktoken';
import { AzureOpenAI, OpenAI } from 'openai';
import type {
  ChatCompletionCreateParamsBase,
  ChatCompletionCreateParamsStreaming,
} from 'openai/src/resources/chat/completions/completions';
import type { ChatCompletionMessage } from 'openai/resources';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions/completions';
import {
  Message,
  ROLE_VALUES,
  type TOOL_CHOICE_TYPE,
  TOOL_CHOICE_VALUES,
  type ToolCall,
  ToolChoice,
} from '@/app/schema';
import type { LLMSettings } from '@/app/config';
import { config } from '@/app/config';
import { retry } from '@/app/utils/decorators/retry';
import { TokenLimitExceeded, ValueError } from '@/app/utils/error';

const REASONING_MODELS = ['o1', 'o3-mini'];
const MULTIMODAL_MODELS = [
  'gpt-4-vision-preview',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
];

export class TokenCounter {
  /*
    Token constants
   */
  BASE_MESSAGE_TOKENS = 4;
  FORMAT_TOKENS = 2;
  LOW_DETAIL_IMAGE_TOKENS = 85;
  HIGH_DETAIL_TILE_TOKENS = 170;

  /*
    Image processing constants
  */
  MAX_SIZE = 2048;
  HIGH_DETAIL_TARGET_SHORT_SIDE = 768;
  TILE_SIZE = 512;

  constructor(public tokenizer: Tiktoken) {}

  count_text(text: string): number {
    return text ? this.tokenizer.encode(text).length : 0;
  }

  /*
    Calculate tokens for an image based on detail level and dimensions

          For "low" detail: fixed 85 tokens
          For "high" detail:
          1. Scale to fit in 2048x2048 square
          2. Scale shortest side to 768px
          3. Count 512px tiles (170 tokens each)
          4. Add 85 tokens
   */
  count_image({
    detail = 'medium',
    dimensions,
  }: {
    detail?: 'low' | 'high' | 'medium';
    dimensions?: { width: number; height: number };
  }): number {
    if (detail === 'low') {
      return this.LOW_DETAIL_IMAGE_TOKENS;
    }
    if ((detail === 'high' || detail === 'medium') && dimensions) {
      return this._calculate_high_detail_tokens(dimensions);
    }
    return detail === 'high'
      ? this._calculate_high_detail_tokens({ width: 1024, height: 2024 })
      : 1024;
  }
  /*
    Calculate tokens for high detail images based on dimensions
   */
  private _calculate_high_detail_tokens({ width, height }: { width: number; height: number }) {
    if (width > this.MAX_SIZE || height > this.MAX_SIZE) {
      const scale = this.MAX_SIZE / Math.max(width, height);
      width = width * scale;
      height = height * scale;
    }

    const scale = this.HIGH_DETAIL_TARGET_SHORT_SIDE / Math.min(width, height);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    const tilesX = Math.ceil(scaledWidth / this.TILE_SIZE);
    const tilesY = Math.ceil(scaledHeight / this.TILE_SIZE);

    return tilesX * tilesY * this.HIGH_DETAIL_TILE_TOKENS + this.LOW_DETAIL_IMAGE_TOKENS;
  }

  /*
    Calculate tokens for message content
   */
  count_content(
    content:
      | string
      | (
          | string
          | { text: string }
          | ({ image_url: string } & Parameters<typeof this.count_image>[0])
        )[],
  ): number {
    if (!content) return 0;
    if (typeof content === 'string') return this.count_text(content);
    let token_count = 0;
    content.forEach((c) => {
      if (typeof c === 'string') {
        token_count += this.count_text(c);
      } else if ('text' in c) {
        token_count += this.count_text(c['text']);
      } else if ('image_url' in c) {
        token_count += this.count_image(c);
      }
    });
    return token_count;
  }

  /*
    Calculate tokens for tool calls
   */
  count_tool_calls(tool_calls: ToolCall[]): number {
    let token_count = 0;
    tool_calls.forEach((t) => {
      if ('fn' in t) {
        const fn = t.fn;
        token_count += this.count_text(fn.name);
        token_count += this.count_text(fn.args);
      }
    });
    return token_count;
  }

  count_message_tokens(messages: Message[]): number {
    let total_token = this.FORMAT_TOKENS;
    messages.forEach((m) => {
      let tokens = this.BASE_MESSAGE_TOKENS;
      tokens += this.count_text(m.role);
      if ('content' in m) {
        tokens += this.count_content(m.content!);
      }
      if ('tool_calls' in m) {
        tokens += this.count_tool_calls(m.tool_calls!);
      }
      tokens += this.count_text(m.name!);
      tokens += this.count_text(m.tool_call_id!);
      total_token += tokens;
    });
    return total_token;
  }
}

export class LLM {
  private static _instances: Map<string, LLM> = new Map();
  client!: AzureOpenAI | OpenAI;
  model!: string;
  max_tokens!: number;
  temperature!: number;
  api_type!: string;
  api_key!: string;
  api_version!: string;
  base_url!: string;
  total_input_tokens!: number;
  total_completion_tokens!: number;
  max_input_tokens?: number;

  tokenizer!: Tiktoken;
  token_counter!: TokenCounter;

  static getInstance({
    config_name = 'default',
    llm_config,
  }: {
    config_name?: string;
    llm_config?: LLMSettings;
  }): LLM {
    if (!LLM._instances.has(config_name)) {
      const inst = new LLM({ config_name, llm_config });
      this._instances.set(config_name, inst);
      return inst;
    }
    return LLM._instances.get(config_name)!;
  }
  constructor({
    config_name = 'default',
    llm_config: llm_config_props,
  }: {
    config_name?: string;
    llm_config?: LLMSettings;
  }) {
    if (!this.client) {
      const llm_config = llm_config_props || config.llm[config_name] || config.llm['default'];
      this.model = llm_config.model;
      this.max_tokens = llm_config.max_tokens;
      this.temperature = llm_config.temperature;
      this.api_type = llm_config.api_type;
      this.api_key = llm_config.api_key;
      this.api_version = llm_config.api_version;
      this.base_url = llm_config.base_url;
      this.max_input_tokens = llm_config.max_input_tokens;
      this.total_input_tokens = 0;
      this.total_completion_tokens = 0;
      this.max_input_tokens = llm_config.max_input_tokens;

      // initialize tokenizer
      try {
        this.tokenizer = encoding_for_model(this.model as TiktokenModel);
      } catch (_e) {
        this.tokenizer = get_encoding('cl100k_base');
      }
      if (this.api_type === 'azure') {
        this.client = new AzureOpenAI({
          apiKey: this.api_key,
          apiVersion: this.api_version,
          baseURL: this.base_url,
        });
      } else {
        this.client = new OpenAI({
          apiKey: this.api_key,
          baseURL: this.base_url,
        });
      }
      this.token_counter = new TokenCounter(this.tokenizer);
    }
  }

  count_tokens(text: string): number {
    return text ? this.tokenizer.encode(text).length : 0;
  }
  count_message_tokens(messages: Message[]): number {
    return this.token_counter.count_message_tokens(messages);
  }
  update_token_count(input_tokens: number, completion_tokens = 0): void {
    this.total_input_tokens += input_tokens;
    this.total_completion_tokens += completion_tokens;
    console.info(
      `Token usage: input=${input_tokens}, completion=${completion_tokens}, ` +
        `total=${this.total_input_tokens + this.total_completion_tokens}`,
    );
  }
  check_token_limit(input_tokens: number): boolean {
    return this.max_input_tokens
      ? this.total_input_tokens + input_tokens <= this.max_input_tokens
      : true;
  }
  get_limit_error_message(input_tokens: number): string {
    return `Token limit exceeded: current=${this.total_input_tokens}, needed=${input_tokens}, max=${this.max_input_tokens}`;
  }
  static format_messages(messages: (Message | any)[], support_images = false): any[] {
    const formatted_messages: any[] = [];
    for (let message of messages) {
      if (message instanceof Message) {
        message = message.to_dict();
      }
      if (message instanceof Object) {
        if (!message.role) {
          throw new ValueError("Message dict must contain 'role' field");
        }
        if (support_images && message.base64_image) {
          if (!message.content) {
            message.content = [];
          } else if (typeof message.content === 'string') {
            message.content = [{ type: 'text', text: message.content }];
          } else if (Array.isArray(message.content)) {
            message.content = message.content.map((i: any) => {
              if (typeof i === 'string') {
                return { type: 'text', text: i };
              }
              return i;
            });
          }
          message.content.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${message.base64_image}` },
          });
          delete message.base64_image;
        } else if (!support_images && message.base64_image) {
          delete message.base64_image;
        }
        if ('content' in message || 'tool_calls' in messages) {
          formatted_messages.push(message);
        }
      } else {
        throw new TypeError(`Message must be a Message object or a dict ${typeof message}`);
      }
    }
    for (const msg of formatted_messages) {
      if (!ROLE_VALUES.includes(msg.role)) {
        throw new ValueError(`Invalid role: ${msg.role}`);
      }
    }
    return formatted_messages;
  }

  @retry({ wait: 30 * 1000, stop: 6, retry: (error) => !(error instanceof TokenLimitExceeded) })
  async ask({
    messages,
    system_msgs,
    stream = true,
    temperature,
  }: {
    messages: Array<Message | any>;
    system_msgs?: Array<Message | any>;
    stream?: boolean;
    temperature?: number;
  }): Promise<string> {
    try {
      const supports_images = MULTIMODAL_MODELS.includes(this.model);
      if (system_msgs) {
        system_msgs = LLM.format_messages(system_msgs, supports_images);
        messages = system_msgs.concat(LLM.format_messages(messages, supports_images));
      } else {
        messages = LLM.format_messages(messages, supports_images);
      }
      const input_tokens = this.count_message_tokens(messages);
      if (!this.check_token_limit(input_tokens)) {
        throw new TokenLimitExceeded(this.get_limit_error_message(input_tokens));
      }
      const params: ChatCompletionCreateParamsBase = {
        model: this.model,
        messages: messages,
      };
      if (REASONING_MODELS.includes(this.model)) {
        params.max_completion_tokens = this.max_tokens;
      } else {
        params.max_tokens = this.max_tokens;
        params.temperature = temperature || this.temperature;
      }
      if (!stream) {
        const response = await this.client.chat.completions.create({ ...params, stream: false });
        if (!response.choices[0].message.content) {
          throw new ValueError('Empty or invalid response from LLM');
        }
        this.update_token_count(
          response.usage?.prompt_tokens || 0,
          response.usage?.completion_tokens,
        );
        return response.choices[0].message.content;
      }
      this.update_token_count(input_tokens);
      params.stream = true;
      const response = await this.client.chat.completions.create(
        params as ChatCompletionCreateParamsStreaming,
      );
      const collected_messages = [];
      let completion_text = '';
      for await (const chunk of response) {
        const chunk_message = chunk.choices[0].delta?.content || '';
        collected_messages.push(chunk_message);
        completion_text += chunk_message;
        process.stdout.write(chunk_message);
      }
      console.log('');
      const full_response = collected_messages.join('').trim();
      if (!full_response) {
        throw new ValueError('Empty response from streaming LLM');
      }
      const completion_tokens = this.count_tokens(completion_text);
      console.log(`Estimated completion tokens for streaming response: ${completion_tokens}`);
      this.total_completion_tokens += completion_tokens;
      return full_response;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
  @retry({ wait: 30 * 1000, stop: 6, retry: (error) => !(error instanceof TokenLimitExceeded) })
  async ask_with_image({
    messages,
    system_msgs,
    images,
    stream = false,
    temperature,
  }: {
    messages: Array<Message | any>;
    images: Array<string | Record<string, any>>;
    system_msgs?: Array<Message | any>;
    stream?: boolean;
    temperature?: number;
  }): Promise<string> {
    try {
      if (!MULTIMODAL_MODELS.includes(this.model)) {
        throw new ValueError(
          `Model ${this.model} does not support images. Use a model from ${MULTIMODAL_MODELS}`,
        );
      }
      const formatted_messages = LLM.format_messages(messages, true);
      if (
        !formatted_messages ||
        formatted_messages[formatted_messages.length - 1].role !== 'user'
      ) {
        throw new ValueError('The last message must be from the user to attach images');
      }
      const last_message = formatted_messages[formatted_messages.length - 1];
      const content = last_message.content;
      const multimodal_content =
        typeof content === 'string'
          ? [{ text: content, type: 'text' }]
          : Array.isArray(content)
            ? content
            : [];
      for (const image of images) {
        if (typeof image === 'string') {
          multimodal_content.push({ image_url: image, type: 'image_url' });
        } else if (typeof image === 'object' && 'url' in image) {
          multimodal_content.push({ image_url: image, type: 'image_file' });
        } else if (typeof image === 'object' && 'image_url' in image) {
          multimodal_content.push(image);
        } else {
          throw new ValueError(`Unsupported image format: ${image}`);
        }
      }
      last_message.content = multimodal_content;
      let all_messages;
      if (system_msgs) {
        all_messages = LLM.format_messages(system_msgs, true).concat(formatted_messages);
      } else {
        all_messages = formatted_messages;
      }
      const input_tokens = this.count_message_tokens(all_messages);
      if (!this.check_token_limit(input_tokens)) {
        throw new TokenLimitExceeded(this.get_limit_error_message(input_tokens));
      }
      const params: ChatCompletionCreateParamsBase = {
        model: this.model,
        messages: all_messages,
        stream,
      };
      if (REASONING_MODELS.includes(this.model)) {
        params.max_completion_tokens = this.max_tokens;
      } else {
        params.max_tokens = this.max_tokens;
        params.temperature = temperature || this.temperature;
      }
      if (!stream) {
        const response = await this.client.chat.completions.create({ ...params, stream: false });
        if (!response.choices[0].message.content) {
          throw new ValueError('Empty or invalid response from LLM');
        }
        this.update_token_count(response.usage?.prompt_tokens || 0);
        return response.choices[0].message.content;
      }
      this.update_token_count(input_tokens);
      const response = await this.client.chat.completions.create({
        ...params,
        stream: true,
      });
      const collected_messages = [];
      for await (const chunk of response) {
        const chunk_message = chunk.choices[0].delta?.content || '';
        collected_messages.push(chunk_message);
        process.stdout.write(chunk_message);
      }
      console.log('');
      const full_response = collected_messages.join('').trim();
      if (!full_response) {
        throw new ValueError('Empty response from streaming LLM');
      }
      return full_response;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
  @retry({ wait: 30 * 1000, stop: 6, retry: (error) => !(error instanceof TokenLimitExceeded) })
  async ask_tool({
    messages,
    system_msgs,
    tools,
    tool_choice = ToolChoice.AUTO,
    temperature,
    ...extra
  }: {
    messages: Array<Message | any>;
    system_msgs?: Array<Message | any>;
    tools?: any[];
    tool_choice?: TOOL_CHOICE_TYPE;
    temperature?: number;
  }): Promise<ChatCompletionMessage | null> {
    try {
      if (!TOOL_CHOICE_VALUES.includes(tool_choice)) {
        throw new ValueError(`Invalid tool_choice: ${tool_choice}`);
      }
      const supports_images = MULTIMODAL_MODELS.includes(this.model);
      if (system_msgs) {
        system_msgs = LLM.format_messages(system_msgs, supports_images);
        messages = system_msgs.concat(messages);
      } else {
        messages = LLM.format_messages(messages, supports_images);
      }
      let input_tokens = this.count_message_tokens(messages);
      let tools_token = 0;
      if (tools) {
        for (const tool of tools) {
          tools_token += this.count_tokens(tool);
        }
      }
      input_tokens += tools_token;

      if (!this.check_token_limit(input_tokens)) {
        throw new TokenLimitExceeded(this.get_limit_error_message(input_tokens));
      }

      if (tools) {
        for (const tool of tools) {
          if (typeof tool !== 'object' || !('type' in tools)) {
            throw new ValueError(`Each tool must be a dict with 'type' field`);
          }
        }
      }
      const params: ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages,
        tools,
        tool_choice,
        stream: false,
        ...extra,
      };
      if (REASONING_MODELS.includes(this.model)) {
        params.max_completion_tokens = this.max_tokens;
      } else {
        params.max_tokens = this.max_tokens;
        params.temperature = temperature || this.temperature;
      }
      params.stream = false;
      const response = await this.client.chat.completions.create(params);
      if (!response?.choices || !response.choices[0].message) {
        return null;
      }
      this.update_token_count(
        response.usage?.prompt_tokens || 0,
        response.usage?.completion_tokens,
      );
      return response.choices[0].message;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}
