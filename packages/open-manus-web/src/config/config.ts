export default {
  llm: {
    model: 'qwen-plus',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    api_key: 'your-api-key',
    max_tokens: 8192,
    temperature: 0.0,
    vision: {
      model: 'qwen-plus',
      base_url: 'your-api-key',
      api_key: 'sk-c466e8c00c7647d9808deecb8fa16fe1',
      max_tokens: 8192,
      temperature: 0.0,
    },
  },
  mcp: {
    server_reference: 'app.mcp.server',
  },
  runflow: {
    use_data_analysis_agent: false,
  },
  daytona: {
    daytona_api_key: 'YOUR_DAYTONA_API_KEY_HERE',
  },
} as APPConfigMeta;

export interface APPConfigMeta {
  llm: {
    model: string;
    base_url: string;
    api_key: string;
    max_tokens: number;
    temperature: number;
    max_input_tokens?: number;
    api_type?: string;
    api_version?: string;
    vision: {
      model: string;
      base_url: string;
      api_key: string;
      max_tokens: number;
      temperature: number;
    };
  };
  browser?: {
    headless?: boolean;
    disable_security?: boolean;
    extra_chrome_args?: string[];
    chrome_instance_path?: string;
    wss_url?: string;
    cdp_url?: string;
    proxy?: {
      server: string;
      username?: string;
      password?: string;
    };
  };
  search?: {
    engine?: string;
    fallback_engine?: string[];
    retry_delay?: number;
    max_retries?: number;
    lang?: string;
    country?: string;
  };
  sandbox?: {
    use_sandbox?: boolean;
    image?: string;
    work_dir?: string;
    memory_limit?: string;
    cpu_limit?: number;
    timeout?: number;
    network_enabled?: boolean;
  };
  mcp: {
    server_reference: string;
  };
  runflow: {
    use_data_analysis_agent: boolean;
  };
  daytona: {
    daytona_api_key: string;
  };
}
