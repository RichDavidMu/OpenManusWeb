import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import manusConfig from '@/config/config';
import mcpExample from '@/config/mcp.example';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = dirname(__filename);
const WORKSPACE_ROOT = join(PROJECT_ROOT, 'workspace');

export class LLMSettings {
  public model: string;
  public base_url: string;
  public api_key: string;
  public api_type: string;
  public api_version: string;
  public max_tokens: number;
  public max_input_tokens?: number;
  public temperature: number;
  constructor({
    model,
    base_url,
    api_key,
    api_type,
    api_version,
    max_tokens = 4096,
    max_input_tokens,
    temperature = 1,
  }: LLMSettings) {
    this.model = model;
    this.base_url = base_url;
    this.api_key = api_key;
    this.api_type = api_type;
    this.api_version = api_version;
    this.max_tokens = max_tokens;
    this.max_input_tokens = max_input_tokens;
    this.temperature = temperature;
  }
}

export class ProxySettings {
  server: string;
  username?: string;
  password?: string;
  constructor({ server, username, password }: ProxySettings) {
    this.server = server;
    this.username = username;
    this.password = password;
  }
}

export class SearchSettings {
  engine: string;
  fallback_engines: string[];
  retry_dalay: number;
  max_retries: number;
  lang: string;
  country: string;
  constructor({
    engine = 'Google',
    fallback_engines = ['DuckDuckGo', 'Bing'],
    retry_dalay = 60,
    max_retries = 3,
    lang = 'en',
    country = 'us',
  }: Partial<SearchSettings>) {
    this.engine = engine;
    this.fallback_engines = fallback_engines;
    this.retry_dalay = retry_dalay;
    this.max_retries = max_retries;
    this.lang = lang;
    this.country = country;
  }
}

export class RunflowSettings {
  public use_data_analysis_agent: boolean;
  constructor({ use_data_analysis_agent = false }: Partial<RunflowSettings>) {
    this.use_data_analysis_agent = use_data_analysis_agent;
  }
}

export class BrowserSettings {
  headless: boolean;
  disable_security: boolean;
  extra_chromium_args: string[];
  chrome_instance_path?: string;
  wss_url?: string;
  cdp_url?: string;
  proxy?: ProxySettings;
  max_content_length: number;
  constructor({
    headless = false,
    disable_security = true,
    extra_chromium_args = [],
    chrome_instance_path,
    wss_url,
    cdp_url,
    proxy,
    max_content_length = 2000,
  }: Partial<BrowserSettings>) {
    this.headless = headless;
    this.disable_security = disable_security;
    this.extra_chromium_args = extra_chromium_args;
    this.chrome_instance_path = chrome_instance_path;
    this.proxy = proxy;
    this.max_content_length = max_content_length;
    this.wss_url = wss_url;
    this.cdp_url = cdp_url;
  }
}

export class SandboxSettings {
  use_sandbox: boolean;
  image: string;
  work_dir: string;
  memory_limit: string;
  cpu_limit: number;
  timeout: number;
  network_enabled: boolean;
  constructor({
    use_sandbox = false,
    image = 'python:3.12-slim',
    work_dir = '/workspace',
    memory_limit = '512M',
    cpu_limit = 1,
    timeout = 300,
    network_enabled = false,
  }: Partial<SandboxSettings>) {
    this.use_sandbox = use_sandbox;
    this.image = image;
    this.work_dir = work_dir;
    this.memory_limit = memory_limit;
    this.cpu_limit = cpu_limit;
    this.timeout = timeout;
    this.network_enabled = network_enabled;
  }
}

export class DaytonaSettings {
  daytona_api_key: string;
  daytona_server_url: string;
  daytona_target?: string;
  sandbox_image_name: string;
  sandbox_entrypoint: string;
  VNC_password: string;
  constructor({
    daytona_api_key = 'your_daytona_api_key',
    daytona_server_url = 'https://app.daytona.io/api',
    daytona_target = 'us',
    sandbox_image_name = 'whitezxj/sandbox:0.1.0',
    sandbox_entrypoint = '/usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf',
    VNC_password = '123456',
  }: Partial<DaytonaSettings>) {
    this.daytona_api_key = daytona_api_key;
    this.daytona_server_url = daytona_server_url;
    this.daytona_target = daytona_target;
    this.sandbox_image_name = sandbox_image_name;
    this.sandbox_entrypoint = sandbox_entrypoint;
    this.VNC_password = VNC_password;
  }
}

export class MCPServerConfig {
  type: string;
  url?: string;
  command?: string;
  args: string[];
  constructor({ type, url, command, args = [] }: Partial<MCPServerConfig> & { type: string }) {
    this.type = type;
    this.url = url;
    this.command = command;
    this.args = args;
  }
}

export class MCPSettings {
  server_reference: string;
  servers: Map<string, MCPServerConfig>;

  constructor({ server_reference = 'app.mcp.server', servers = new Map() }: Partial<MCPSettings>) {
    this.servers = servers;
    this.server_reference = server_reference;
  }
  static load_server_config(): MCPSettings['servers'] {
    const servers: MCPSettings['servers'] = new Map();
    Object.entries(mcpExample.mcpServers).forEach(([name, config]) => {
      servers.set(name, new MCPServerConfig(config));
    });
    return servers;
  }
}

export class AppConfig {
  llm: Record<string, LLMSettings>;
  sandbox?: SandboxSettings;
  browser_config?: BrowserSettings;
  search_config?: SearchSettings;
  mcp_config?: MCPSettings;
  run_flow_config?: RunflowSettings;
  daytona_config?: DaytonaSettings;
  constructor({
    llm,
    sandbox,
    browser_config,
    search_config,
    mcp_config,
    run_flow_config,
    daytona_config,
  }: AppConfig) {
    this.llm = llm;
    this.sandbox = sandbox;
    this.browser_config = browser_config;
    this.search_config = search_config;
    this.mcp_config = mcp_config;
    this.run_flow_config = run_flow_config;
    this.daytona_config = daytona_config;
  }
}

export class Config {
  private static instance: Config | null = null;
  private _config!: AppConfig;

  private constructor() {
    this.load_initial_config();
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  private load_initial_config() {
    const base_llM = manusConfig.llm;

    // llm settings
    const default_settings = new LLMSettings({
      model: base_llM.model,
      base_url: base_llM.base_url,
      api_key: base_llM.api_key,
      max_tokens: base_llM.max_tokens ?? 4096,
      max_input_tokens: base_llM.max_input_tokens ?? undefined,
      temperature: base_llM.temperature ?? 1.0,
      api_type: base_llM.api_type ?? '',
      api_version: base_llM.api_version ?? '',
    });
    // browser setting
    const browser_config = manusConfig.browser;
    let browser_settings;
    if (browser_config) {
      const proxy_config = browser_config.proxy;
      let proxy_settings = undefined;
      if (proxy_config && proxy_config.server) {
        proxy_settings = new ProxySettings(proxy_config);
      }
      const valid_browser_params = browser_config;
      if (proxy_settings) {
        valid_browser_params.proxy = proxy_settings;
      }
      browser_settings = new BrowserSettings(valid_browser_params);
    }
    // search setting
    const search_config = manusConfig.search;
    let search_settings;
    if (search_config) {
      search_settings = new SearchSettings(search_config);
    }
    // sandbox_config
    const sandbox_config = manusConfig.sandbox;
    let sandbox_settings;
    if (sandbox_config) {
      sandbox_settings = new SandboxSettings(sandbox_config);
    }
    // daytona_config
    const daytona_config = manusConfig.daytona;
    let daytona_settings;
    if (daytona_config) {
      daytona_settings = new DaytonaSettings(daytona_config);
    } else {
      daytona_settings = new DaytonaSettings({});
    }
    // mcp_config
    const mcp_config = manusConfig.mcp;
    let mcp_settings;
    if (mcp_config) {
      mcp_settings = new MCPSettings({ ...mcp_config, servers: MCPSettings.load_server_config() });
    } else {
      mcp_settings = new MCPSettings({ servers: MCPSettings.load_server_config() });
    }
    // run_flow_config
    const run_flow_config = manusConfig.runflow;
    let run_flow_settings;
    if (run_flow_config) {
      run_flow_settings = new RunflowSettings(run_flow_config);
    } else {
      run_flow_settings = new RunflowSettings({});
    }

    const config_dict = {
      llm: { default: default_settings },
      sandbox: sandbox_settings,
      browser_config: browser_settings,
      search_config: search_settings,
      mcp_config: mcp_settings,
      run_flow_config: run_flow_settings,
      daytona_config: daytona_settings,
    };

    this._config = new AppConfig(config_dict);
  }

  get llm() {
    return this._config.llm;
  }
  get sandbox() {
    return this._config.sandbox!;
  }
  get browser_config() {
    return this._config.browser_config!;
  }
  get search_config() {
    return this._config.search_config!;
  }
  get mcp_config() {
    return this._config.mcp_config!;
  }
  get run_flow_config() {
    return this._config.run_flow_config!;
  }
  get daytona_config() {
    return this._config.daytona_config!;
  }
  get workspace_root() {
    return PROJECT_ROOT;
  }
  get root_path() {
    return WORKSPACE_ROOT;
  }
}

export const config = Config.getInstance();
