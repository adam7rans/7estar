// MCP server exposing run_test and get_artifact as tools over stdio.
// This allows Claude Code (IDE) to connect without an Anthropic API key.

import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { startAgentWithTest, buildArtifactIndex, type ArtifactIndex } from './agent.js';

// Local helper: ensure the run directory exists
function ensureRunDir(runId: string): string {
  const dir = path.resolve('runs', runId);
  if (!fs.existsSync(dir)) {
    throw new Error(`Run not found: ${runId}`);
  }
  return dir;
}

// Local helper: implement get_artifact behavior mirroring HTTP endpoints
async function getArtifact(args: { runId: string; kind: string; name?: string; grep?: string; limit?: number }): Promise<string> {
  const dir = ensureRunDir(args.runId);
  switch (args.kind) {
    case 'index': {
      const idx: ArtifactIndex = buildArtifactIndex(dir);
      return JSON.stringify(idx);
    }
    case 'screenshot': {
      if (!args.name) return JSON.stringify({ error: 'name is required for screenshot' });
      const file = path.join(dir, `${args.name}.png`);
      if (!fs.existsSync(file)) return JSON.stringify({ error: 'screenshot not found' });
      return JSON.stringify({ path: file });
    }
    case 'console':
    case 'network':
    case 'actions': {
      const kind = args.kind as 'console' | 'network' | 'actions';
      const fileName = kind === 'console' ? 'console.log' : kind === 'network' ? 'network.log' : 'actions.json';
      const file = path.join(dir, fileName);
      if (!fs.existsSync(file)) return JSON.stringify({ error: 'log not found' });
      const grep = args.grep?.toLowerCase();
      const limit = args.limit && Number.isFinite(args.limit) ? Number(args.limit) : undefined;
      if (kind === 'actions') {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        let items = Array.isArray(parsed) ? parsed : parsed?.actions ?? [];
        if (grep) items = items.filter((x: unknown) => JSON.stringify(x).toLowerCase().includes(grep));
        if (limit) items = items.slice(-limit);
        return JSON.stringify(items);
      }
      let lines = fs.readFileSync(file, 'utf8').split('\n');
      if (grep) lines = lines.filter((l) => l.toLowerCase().includes(grep));
      if (limit) lines = lines.slice(-limit);
      return lines.join('\n');
    }
    case 'trace': {
      const file = path.join(dir, 'trace.zip');
      if (!fs.existsSync(file)) return JSON.stringify({ error: 'trace not found' });
      return JSON.stringify({ path: file });
    }
    default:
      return JSON.stringify({ error: 'invalid kind' });
  }
}

async function main() {
  const server = new McpServer({
    name: 'testing-agent-mcp',
    version: '0.1.0',
  });

  // Tool: run_test
  server.tool(
    'run_test',
    { scriptPath: z.string().min(1) },
    async ({ scriptPath }: { scriptPath: string }) => {
      const result = await startAgentWithTest(scriptPath);
      const payload = {
        status: result.status,
        runId: result.runId,
        artifactsDir: result.artifactsDir,
        index: result.index,
        criticalErrors: result.criticalErrors,
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
  );

  // Tool: get_artifact
  server.tool(
    'get_artifact',
    {
      runId: z.string().min(1),
      kind: z.enum(['screenshot', 'console', 'network', 'actions', 'trace', 'index']),
      name: z.string().optional(),
      grep: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ runId, kind, name, grep, limit }: { runId: string; kind: 'screenshot'|'console'|'network'|'actions'|'trace'|'index'; name?: string; grep?: string; limit?: number }) => {
      const out = await getArtifact({ runId, kind, name, grep, limit });
      return { content: [{ type: 'text', text: out }] };
    }
  );

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[mcp] fatal error:', err);
  process.exit(1);
});
