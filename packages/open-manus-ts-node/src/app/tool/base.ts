import type { PropertiesOnly } from '@/types/utils';
import { ValueError } from '@/app/utils/error';

export abstract class BaseTool {
  name!: string;
  description!: string;
  parameters?: any;

  abstract execute(params?: any): Promise<any>;

  to_param() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  success_response(data: string | Record<string, any>): ToolResult {
    let text;
    if (typeof data === 'string') {
      text = data;
    } else {
      text = JSON.stringify(data);
    }
    console.log(`Created success response for ${this.constructor.name}`);
    return new ToolResult({ output: text });
  }

  fail_response(msg: string): ToolResult {
    console.log(`Tool ${this.constructor.name} returned failed result: ${msg}`);
    return new ToolResult({ error: msg });
  }
}

export class ToolResult {
  output?: string;
  error?: string;
  base64_image?: string;
  system?: string;

  constructor({ output, error, base64_image, system }: PropertiesOnly<ToolResult>) {
    this.output = output;
    this.error = error;
    this.base64_image = base64_image;
    this.system = system;
  }

  isTruthy(): boolean {
    return Boolean(this.output || this.error || this.base64_image || this.system);
  }

  add(other: ToolResult): ToolResult {
    const combineFields = ({
      field,
      otherField,
      concatenate = true,
    }: {
      field?: string;
      otherField?: string;
      concatenate?: boolean;
    }) => {
      if (field && otherField) {
        if (concatenate) return field + otherField;
        throw new ValueError('Cannot combine tool results');
      }
      return field || otherField;
    };

    return new ToolResult({
      output: combineFields({ field: this.output, otherField: other.output }),
      error: combineFields({ field: this.error, otherField: other.error }),
      base64_image: combineFields({
        field: this.base64_image,
        otherField: other.base64_image,
        concatenate: false,
      }),
      system: combineFields({ field: this.system, otherField: other.system }),
    });
  }

  toString(): string {
    return this.error ? `Error: ${this.error}` : String(this.output ?? '');
  }

  replace(props: PropertiesOnly<ToolResult>): ToolResult {
    return new ToolResult(props);
  }
}

export class CLIResult extends ToolResult {}

export class ToolFailure extends ToolResult {}
