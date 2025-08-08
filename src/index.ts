#!/usr/bin/env ts-node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runTest } from './tools.js';
import type { Argv } from 'yargs';
import { startAgentServer, startAgentWithTest } from './agent.js';

async function main() {
  await yargs(hideBin(process.argv))
    .command('test <script>', 'Run a Playwright test script with the Testing Agent', (y: Argv) =>
      y.positional('script', { type: 'string', demandOption: true, describe: 'Path to test script exporting default async (page, context, helpers)' })
    , async (args: { script: string }) => {
      const scriptPath = String(args.script);
      const result = await runTest(scriptPath);
      // TODO: Wire Claude Code SDK session here: post summary to conversation
      console.log(`[${result.status}] Run completed. Artifacts: ${result.artifactsDir}`);
      if (result.criticalErrors.length) {
        console.log('Critical console errors detected:');
        for (const err of result.criticalErrors) console.log(err);
      }
    })
    .command(
      'agent',
      'Start agent HTTP runtime. Options: --port <number> [--script <path> to run immediately]',
      (y: Argv) =>
        y.option('port', { type: 'number', default: 4317, describe: 'Port to listen on' })
         .option('script', { type: 'string', describe: 'Optional script to run on startup' }),
      async (args: { port?: number; script?: string }) => {
        const port = Number(args.port ?? 4317);
        startAgentServer(port);
        if (args.script) {
          try {
            await startAgentWithTest(String(args.script));
          } catch (e) {
            console.error(e);
          }
        }
      }
    )
    .demandCommand(1)
    .help()
    .strict()
    .parse();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
