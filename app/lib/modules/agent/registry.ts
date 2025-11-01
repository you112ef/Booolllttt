import type { AgentToolDefinition } from './types';

const defaultTools: AgentToolDefinition[] = [
  {
    id: 'repo-audit',
    title: 'Codebase audit',
    description:
      'Analyseer de repository, verzamel metadata (packages, lint status, tests) en rapporteer potenti?le risico\'s.',
    category: 'analysis',
    execution: {
      type: 'workflow',
      entryPoint: 'agent.workflows.repoAudit',
    },
    prerequisites: ['git'],
    docsUrl: 'https://github.com/stackblitz-labs/bolt.diy',
  },
  {
    id: 'supabase-migrations',
    title: 'Supabase migraties beheren',
    description: 'Genereer, valideer en voer Supabase SQL migraties uit.',
    category: 'data',
    execution: {
      type: 'mcp',
      entryPoint: 'supabase.migrations',
    },
    prerequisites: ['supabase-project', 'supabase-service-role'],
  },
  {
    id: 'deployment-preview',
    title: 'Deployment preview',
    description:
      'Maak een tijdelijke preview-build (Vercel/Netlify) en geef feedback over performance en regressies.',
    category: 'devops',
    execution: {
      type: 'workflow',
      entryPoint: 'agent.workflows.deploymentPreview',
    },
    prerequisites: ['vercel-api-token | netlify-api-token'],
  },
  {
    id: 'test-suite',
    title: 'Test suite draaien',
    description: 'Voer unit- en end-to-end-tests uit en rapporteer resultaten inclusief fouten en flaky tests.',
    category: 'code',
    execution: {
      type: 'shell',
      entryPoint: 'pnpm test',
      args: {
        cwd: '/workspace',
      },
    },
    prerequisites: ['node', 'pnpm'],
  },
  {
    id: 'mcp-web-search',
    title: 'Web search (MCP)',
    description: 'Voer een gerichte web search uit via een Model Context Protocol server voor researchtaken.',
    category: 'support',
    execution: {
      type: 'mcp',
      entryPoint: 'web.search',
    },
    prerequisites: ['mcp-server-web'],
  },
];

let registry: AgentToolDefinition[] = [...defaultTools];

export function getAgentTools(): AgentToolDefinition[] {
  return registry;
}

export function findAgentTool(id: string): AgentToolDefinition | undefined {
  return registry.find((tool) => tool.id === id);
}

export function registerAgentTool(tool: AgentToolDefinition) {
  if (registry.some((existing) => existing.id === tool.id)) {
    registry = registry.map((existing) => (existing.id === tool.id ? tool : existing));
  } else {
    registry = [...registry, tool];
  }
}

export function resetAgentTools(tools: AgentToolDefinition[] = defaultTools) {
  registry = [...tools];
}

