import fs from 'node:fs';
import path from 'node:path';
import { chromium, Browser, Page, BrowserContext } from 'playwright';

export type RunResult = {
  status: 'PASS' | 'FAIL';
  artifactsDir: string;
  runId: string;
  criticalErrors: string[];
};

type Action =
  | { type: 'screenshot'; name: string; time: number }
  | { type: 'step:start' | 'step:end'; name: string; time: number }
  | { type: 'step:error'; name: string; error: string; time: number };

type Helpers = {
  screenshot: (name: string) => Promise<void>;
  step: (name: string, fn: () => Promise<void>) => Promise<void>;
};

function timestampId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export async function runTest(scriptPath: string): Promise<RunResult> {
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script file not found: ${scriptPath}`);
  }

  const runId = timestampId();
  const artifactsDir = path.resolve('runs', runId);
  ensureDir(artifactsDir);

  const consoleLogPath = path.join(artifactsDir, 'console.log');
  const networkLogPath = path.join(artifactsDir, 'network.log');
  const actionsPath = path.join(artifactsDir, 'actions.json');

  const actions: Action[] = [];
  const criticalErrors: string[] = [];

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let status: RunResult['status'] = 'PASS';

  try {
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext();
    page = await context.newPage();

    // Listeners
    page.on('console', (msg) => {
      const line = `[${new Date().toISOString()}] [${msg.type()}] ${msg.text()}\n`;
      fs.appendFileSync(consoleLogPath, line);
      if (msg.type() === 'error') criticalErrors.push(msg.text());
    });

    page.on('requestfinished', async (req) => {
      try {
        const resp = await req.response();
        const rec = {
          time: new Date().toISOString(),
          method: req.method(),
          url: req.url(),
          status: resp?.status(),
        };
        fs.appendFileSync(networkLogPath, JSON.stringify(rec) + '\n');
      } catch (e) {
        // ignore network logging errors
      }
    });

    // Start tracing
    await context.tracing.start({ screenshots: true, snapshots: true });

    // Load and run the user script
    const moduleHref = toFileHref(scriptPath);
    const mod = await import(moduleHref);
    const candidate = (mod as Record<string, unknown>).default ?? (mod as Record<string, unknown>).run ?? (mod as Record<string, unknown>).runner;
    if (typeof candidate !== 'function') {
      throw new Error('Test script must export default async function (page, context, helpers)');
    }
    const runner = candidate as (page: Page, context: BrowserContext, helpers: Helpers) => Promise<void> | void;

    const helpers = {
      async screenshot(name: string) {
        const file = path.join(artifactsDir, `${name}.png`);
        actions.push({ type: 'screenshot', name, time: Date.now() });
        await page!.screenshot({ path: file, fullPage: true });
      },
      async step(name: string, fn: () => Promise<void>) {
        actions.push({ type: 'step:start', name, time: Date.now() });
        await helpers.screenshot(`before_${name}`);
        try {
          await fn();
          actions.push({ type: 'step:end', name, time: Date.now() });
        } catch (e) {
          actions.push({ type: 'step:error', name, error: String(e), time: Date.now() });
          await helpers.screenshot(`on_error_${name}`);
          status = 'FAIL';
          throw e;
        } finally {
          await helpers.screenshot(`after_${name}`);
        }
      }
    };

    // Navigate to blank by default
    await page.goto('about:blank');

    // Execute user script
    await runner(page, context, helpers);

  } catch (err) {
    status = 'FAIL';
  } finally {
    if (context) {
      const tracePath = path.join(artifactsDir, 'trace.zip');
      await context.tracing.stop({ path: tracePath });
    }
    if (page) await page.close().catch(() => { /* ignore */ });
    if (context) await context.close().catch(() => { /* ignore */ });
    if (browser) await browser.close().catch(() => { /* ignore */ });

    // Persist actions
    try {
      fs.writeFileSync(actionsPath, JSON.stringify(actions, null, 2));
    } catch (e) {
      // ignore file write errors
    }
  }

  return { status, artifactsDir, runId, criticalErrors };
}

// Avoid importing node:url types by constructing file URL href manually
function toFileHref(p: string): string {
  const abs = path.isAbsolute(p) ? p : path.resolve(p);
  const withSlashes = abs.replace(/\\/g, '/');
  // Ensure leading slash on Windows paths
  const prefix = withSlashes.startsWith('/') ? '' : '/';
  return `file://${prefix}${withSlashes}`;
}

