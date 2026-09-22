#!/usr/bin/env node
// @author AVRG3
import { createRequire } from 'node:module';
const { version } = createRequire(import.meta.url)('../package.json');
import { Command } from 'commander';
import { runTool } from './tools.js';
const program = new Command().name('tiny-runtime').description('Deterministic agent helpers. JSON configs; no model calls.').version(version);
for (const [command, tool, description] of [['collect','collect_pages','Collect cursor pages with resumable checkpoints'], ['check','check_progress','Inspect a trace for repeated stalls'], ['plan','plan_cache','Produce advisory cache hints from a progress trace']] as const) {
  const c = program.command(command).argument('<path>', 'JSON config/trace file').description(description).option('-o, --output-dir <path>', 'Parent for a fresh output directory');
  if (command === 'collect') c.option('--checkpoint <path>', 'Resume from an immutable saved checkpoint');
  c.action(async (path: string, options: { outputDir?: string; checkpoint?: string }) => {
    const result = await runTool(tool, { [command === 'collect' ? 'config' : 'path']: path, ...(options.outputDir ? { output_dir: options.outputDir } : {}), ...(options.checkpoint ? { checkpoint: options.checkpoint } : {}) });
    (result.ok ? process.stdout : process.stderr).write(result.text + '\n');
    if (!result.ok) process.exitCode = 1;
  });
}
await program.parseAsync(process.argv);
