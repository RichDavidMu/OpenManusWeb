import { BaseTool } from '@/app/tool/base';

const TERMINATE_DESCRIPTION =
  'Terminate the interaction when the request is met OR if the assistant cannot proceed further with the task. When you have finished all the tasks, call this tool to end the work.';

export class Terminate extends BaseTool {
  name = 'terminate';
  description = TERMINATE_DESCRIPTION;
  parameters = {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'The finish status of the interaction.',
        enum: ['success', 'failure'],
      },
    },
  };
  async execute(status: string): Promise<string> {
    return `The interaction has been completed with status: ${status}`;
  }
}
