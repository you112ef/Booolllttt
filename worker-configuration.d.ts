interface Env {
  RUNNING_IN_DOCKER: Settings;
  DEFAULT_NUM_CTX: Settings;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  GROQ_API_KEY: string;
  HuggingFace_API_KEY: string;
  OPEN_ROUTER_API_KEY: string;
  OLLAMA_API_BASE_URL: string;
  OPENAI_LIKE_API_KEY: string;
  OPENAI_LIKE_API_BASE_URL: string;
  OPENAI_LIKE_API_MODELS: string;
  TOGETHER_API_KEY: string;
  TOGETHER_API_BASE_URL: string;
  DEEPSEEK_API_KEY: string;
  LMSTUDIO_API_BASE_URL: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  MISTRAL_API_KEY: string;
  XAI_API_KEY: string;
  PERPLEXITY_API_KEY: string;
  AWS_BEDROCK_CONFIG: string;
  /**
   * Globally unique identifier for the current workspace. Used for provisioning remote
   * code-server containers and validating access controls.
   */
  BOLT_WORKSPACE_ID: string;
  /**
   * Comma separated list of resource profiles that can be requested when provisioning
   * a code-server instance. Example: "small,medium,large".
   */
  CODE_SERVER_ALLOWED_RESOURCE_PROFILES: string;
  /**
   * Default resource profile that will be used when the client does not request a specific one.
   */
  CODE_SERVER_DEFAULT_RESOURCE_PROFILE: string;
  /**
   * Number of minutes before automatically shutting down inactive code-server sessions.
   */
  CODE_SERVER_SESSION_TTL_MINUTES: string;
  /**
   * Base URL for the provisioning controller responsible for managing code-server containers.
   */
  CODE_SERVER_CONTROLLER_URL: string;
  /**
   * Bearer token (or API key) used to authenticate against the provisioning controller.
   */
  CODE_SERVER_CONTROLLER_TOKEN: string;
  /**
   * Optional URL that can be called to validate whether a user has access to a workspace.
   * When omitted, permission checks fall back to the default implementation.
   */
  CODE_SERVER_PERMISSIONS_URL?: string;
  /**
   * Bearer token used to authenticate against the permission service when present.
   */
  CODE_SERVER_PERMISSIONS_TOKEN?: string;
  /**
   * RS256 private key in PEM format used to sign session JWTs handed to the reverse proxy.
   */
  CODE_SERVER_JWT_PRIVATE_KEY: string;
  /**
   * Optional RS256 public key in PEM format. When not provided the signer key is used for verification.
   */
  CODE_SERVER_JWT_PUBLIC_KEY?: string;
  /**
   * JWT issuer value embedded in generated session tokens.
   */
  CODE_SERVER_JWT_ISSUER: string;
  /**
   * JWT audience value embedded in generated session tokens.
   */
  CODE_SERVER_JWT_AUDIENCE: string;
  /**
   * JWT key identifier used in the session tokens header (kid field).
   */
  CODE_SERVER_JWT_KID: string;
  /**
   * Secret used to mint and verify end-user authentication cookies.
   */
  CODE_SERVER_USER_JWT_SECRET: string;
  /**
   * KV namespace used to persist active code-server sessions.
   */
  CODE_SERVER_SESSIONS: KVNamespace;
  /**
   * Optional KV namespace dedicated to auditing start/stop events.
   */
  CODE_SERVER_AUDIT_LOG?: KVNamespace;
}
