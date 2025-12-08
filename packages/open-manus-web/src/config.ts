export class LLMSetting {
  constructor(
    public model: string,
    public base_url: string,
    public api_key: string,
    public api_type: string,
    public api_version: string,
    public max_tokens = 4096,
    public max_input_tokens: number | undefined = undefined,
    public temperature = 1,
  ) {}
}
