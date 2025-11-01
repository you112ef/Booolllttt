import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { listToolAvailability } from '~/lib/.server/agent/tool-availability';

export async function loader({ context }: LoaderFunctionArgs) {
  const env = (context.cloudflare?.env as Record<string, unknown> | undefined) ?? (typeof process !== 'undefined' ? process.env : undefined);
  const tools = listToolAvailability(env);

  return json({ tools });
}

