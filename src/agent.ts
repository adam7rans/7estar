// Agent runtime with HTTP endpoints to enable autonomous artifact delivery.
// This acts as a bridge for Claude Code tool-calls until SDK wiring is added.

import fs from 'node:fs';
import path from 'node:path';
import express, { Request, Response } from 'express';
import { runTest, type RunResult } from './tools.js';
import Anthropic from '@anthropic-ai/sdk';

export type ArtifactIndex = {
  runId: string;
  artifactsDir: string;
  screenshots: string[];
  logs: { console: string | null; network: string | null; actions: string | null };
  trace: string | null;
};

function ensureRunDir(runId: string): string {
  const dir = path.resolve('runs', runId);
  if (!fs.existsSync(dir)) {
    throw new Error(`Run not found: ${runId}`);
  }
  return dir;
}

export function buildArtifactIndex(artifactsDir: string): ArtifactIndex {
  const files = fs.readdirSync(artifactsDir);
  const screenshots = files.filter((f) => f.endsWith('.png')).sort();
  const consoleLog = files.includes('console.log') ? 'console.log' : null;
  const networkLog = files.includes('network.log') ? 'network.log' : null;
  const actions = files.includes('actions.json') ? 'actions.json' : null;
  const trace = files.includes('trace.zip') ? 'trace.zip' : null;
  const runId = path.basename(artifactsDir);
  return {
    runId,
    artifactsDir,
    screenshots,
    logs: { console: consoleLog, network: networkLog, actions },
    trace,
  };
}

export async function startAgentWithTest(scriptPath: string): Promise<RunResult & { index: ArtifactIndex }>
{
  const result = await runTest(scriptPath);
  const index = buildArtifactIndex(result.artifactsDir);
  // Placeholder for Claude Code SDK: here we would post a concise summary
  // to the session so Claude can request only needed artifacts via tool-calls.
  // For now, we log a structured JSON summary to stdout.
  const summary = {
    status: result.status,
    runId: result.runId,
    artifactsDir: result.artifactsDir,
    criticalErrors: result.criticalErrors,
    index,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ type: 'test_run_summary', payload: summary }, null, 2));

  // If Anthropic key present, post to Claude and serve tool calls
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      await postSummaryToClaudeAndServeToolCalls(summary);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[agent] Claude SDK error:', e);
    }
  }
  return { ...result, index };
}

export function startAgentServer(port = 4317) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Healthcheck
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Run a test on-demand
  app.post('/run-test', async (req: Request, res: Response) => {
    try {
      const { scriptPath } = req.body as { scriptPath?: string };
      if (!scriptPath || typeof scriptPath !== 'string') {
        return res.status(400).json({ error: 'scriptPath (string) is required' });
      }
      const result = await startAgentWithTest(scriptPath);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Return artifact index for a run
  app.get('/runs/:runId/index', (req: Request, res: Response) => {
    try {
      const dir = ensureRunDir(req.params.runId);
      res.json(buildArtifactIndex(dir));
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  });

  // Stream screenshot by name (without extension)
  app.get('/runs/:runId/screenshot/:name', (req: Request, res: Response) => {
    try {
      const dir = ensureRunDir(req.params.runId);
      const file = path.join(dir, `${req.params.name}.png`);
      if (!fs.existsSync(file)) return res.status(404).json({ error: 'screenshot not found' });
      res.type('png');
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Get logs with optional filtering (grep, limit)
  app.get('/runs/:runId/log/:kind', (req: Request, res: Response) => {
    try {
      const dir = ensureRunDir(req.params.runId);
      const kind = req.params.kind as 'console' | 'network' | 'actions';
      let fileName: string;
      if (kind === 'console') fileName = 'console.log';
      else if (kind === 'network') fileName = 'network.log';
      else if (kind === 'actions') fileName = 'actions.json';
      else return res.status(400).json({ error: 'invalid kind' });

      const file = path.join(dir, fileName);
      if (!fs.existsSync(file)) return res.status(404).json({ error: 'log not found' });

      const content = fs.readFileSync(file, 'utf8');
      const grep = typeof req.query.grep === 'string' ? req.query.grep : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      if (kind === 'actions') {
        // actions.json is returned as parsed JSON, optional grep filters by JSON.stringify line
        const parsed = JSON.parse(content);
        let items = Array.isArray(parsed) ? parsed : parsed?.actions ?? [];
        if (grep) {
          const g = grep.toLowerCase();
          items = items.filter((x: unknown) => JSON.stringify(x).toLowerCase().includes(g));
        }
        if (limit && Number.isFinite(limit)) items = items.slice(-limit);
        return res.json(items);
      }

      // line-based logs
      let lines = content.split('\n');
      if (grep) {
        const g = grep.toLowerCase();
        lines = lines.filter((l) => l.toLowerCase().includes(g));
      }
      if (limit && Number.isFinite(limit)) lines = lines.slice(-limit);
      res.type('text/plain').send(lines.join('\n'));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Download playwright trace
  app.get('/runs/:runId/trace', (req: Request, res: Response) => {
    try {
      const dir = ensureRunDir(req.params.runId);
      const file = path.join(dir, 'trace.zip');
      if (!fs.existsSync(file)) return res.status(404).json({ error: 'trace not found' });
      res.type('application/zip');
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[agent] HTTP server listening on http://localhost:${port}`);
  });
  return server;
}

// ---------------- Claude Code SDK wiring (Messages API with tools) ----------------

type TestRunSummary = {
  status: 'PASS' | 'FAIL';
  runId: string;
  artifactsDir: string;
  criticalErrors: string[];
  index: ArtifactIndex;
};

const toolDefs = [
  {
    name: 'get_artifact',
    description: 'Retrieve specific test artifacts and logs from a given run.',
    input_schema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Run ID (timestamp id)' },
        kind: { type: 'string', enum: ['screenshot', 'console', 'network', 'actions', 'trace', 'index'] },
        name: { type: 'string', nullable: true, description: 'Screenshot basename without .png when kind is screenshot' },
        grep: { type: 'string', nullable: true, description: 'Optional case-insensitive filter for logs' },
        limit: { type: 'number', nullable: true, description: 'Optional limit for logs/items' },
      },
      required: ['runId', 'kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_test',
    description: 'Run a Playwright test script and return a fresh summary and artifact index.',
    input_schema: {
      type: 'object',
      properties: {
        scriptPath: { type: 'string', description: 'Path to TS/JS test script exporting default async (page, context, helpers)' },
      },
      required: ['scriptPath'],
      additionalProperties: false,
    },
  },
];

async function postSummaryToClaudeAndServeToolCalls(summary: TestRunSummary) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = `You are the Testing Agent that autonomously provides only the requested test artifacts. You have just completed a test run. Use tools conservatively and retrieve only what is asked.`;

  // Initial user content with concise summary and artifact index
  const userContent = [
    { type: 'text', text: `Test run summary:\nStatus: ${summary.status}\nRunId: ${summary.runId}\nCritical errors: ${summary.criticalErrors.length}\nScreenshots: ${summary.index.screenshots.length}\nLogs: ${JSON.stringify(summary.index.logs)}\nTrace: ${summary.index.trace ? 'available' : 'none'}` },
  ];

  // Start a simple loop: respond to tool use blocks until the model ends turn.
  let messages: any[] = [
    { role: 'user', content: userContent as any },
  ];

  // Single-turn serve; can be extended to a persistent loop if desired.
  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-3-7-sonnet-2025-02-19',
    max_tokens: 1024,
    system,
    tools: toolDefs as any, // SDK typing allows this shape
    messages,
  });

  if (!response.content || response.content.length === 0) return;

  // Find tool_use blocks and execute
  for (const block of response.content) {
    if ((block as any).type === 'tool_use') {
      const tu = block as Anthropic.Messages.ToolUseBlock;
      const toolName = tu.name;
      if (toolName === 'get_artifact') {
        const args = tu.input as any;
        const result = await handleGetArtifact(args);
        await client.messages.create({
          model: process.env.CLAUDE_MODEL || 'claude-3-7-sonnet-2025-02-19',
          max_tokens: 1024,
          system,
          tools: toolDefs as any,
          messages: [
            ...messages,
            { role: 'assistant', content: [tu] as any },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu.id, content: [{ type: 'text', text: result }] }] as any },
          ],
        });
      } else if (toolName === 'run_test') {
        const args = tu.input as any;
        const fresh = await startAgentWithTest(String(args.scriptPath));
        const payload = {
          status: fresh.status,
          runId: fresh.runId,
          artifactsDir: fresh.artifactsDir,
          index: fresh.index,
          criticalErrors: fresh.criticalErrors,
        };
        await client.messages.create({
          model: process.env.CLAUDE_MODEL || 'claude-3-7-sonnet-2025-02-19',
          max_tokens: 1024,
          system,
          tools: toolDefs as any,
          messages: [
            ...messages,
            { role: 'assistant', content: [tu] as any },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu.id, content: [{ type: 'text', text: JSON.stringify(payload) }] }] as any },
          ],
        });
      }
    }
  }
}

async function handleGetArtifact(args: { runId: string; kind: string; name?: string; grep?: string; limit?: number }): Promise<string> {
  const dir = ensureRunDir(args.runId);
  switch (args.kind) {
    case 'index': {
      return JSON.stringify(buildArtifactIndex(dir));
    }
    case 'screenshot': {
      if (!args.name) return JSON.stringify({ error: 'name is required for screenshot' });
      const file = path.join(dir, `${args.name}.png`);
      if (!fs.existsSync(file)) return JSON.stringify({ error: 'screenshot not found' });
      // Return a file path reference; Claude can request it via a separate fetch tool or we can base64 encode (large).
      return JSON.stringify({ path: file });
    }
    case 'console':
    case 'network':
    case 'actions': {
      const kind = args.kind as 'console' | 'network' | 'actions';
      let fileName = kind === 'console' ? 'console.log' : kind === 'network' ? 'network.log' : 'actions.json';
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
