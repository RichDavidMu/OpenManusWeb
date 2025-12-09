import { BaseAgent } from '@/app/agent/base';

export abstract class ReActAgent extends BaseAgent {
  abstract think(): Promise<boolean>;
  abstract act(): Promise<string>;
  async step(): Promise<string> {
    const should_act = await this.think();
    if (!should_act) {
      return 'Thinking complete - no action needed';
    }
    return await this.act();
  }
}
