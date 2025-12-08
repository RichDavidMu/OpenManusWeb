import type { Tiktoken } from 'tiktoken';
import { encoding_for_model } from 'tiktoken';
import type { Message, ToolCall } from '@/schema';
import type { LLMSetting } from '@/config';
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
  static getInstance({
    config_name = 'default',
    llm_config,
  }: {
    config_name?: string;
    llm_config?: LLMSetting;
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
    llm_config,
  }: {
    config_name?: string;
    llm_config?: LLMSetting;
  }) {

  }
}
