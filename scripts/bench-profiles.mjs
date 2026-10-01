// @author AVRG3
/** Synthetic recurring documents; includes setup, process startup, parsing and validation. No model calls. */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runTool } from '../packages/context/dist/tools.js';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-profile-bench-'));
const recipe = { version: 1, name: 'Synthetic monthly reports', formats: ['text'], anchors: ['Monthly report'], fields: [
  { name: 'reference', label: 'Reference:', type: 'text' }, { name: 'total', label: 'Total:', type: 'decimal' }, { name: 'date', label: 'Date:', type: 'date' },
] };
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const results = [];
try {
  for (const [count, filler] of [[1, 0], [25, 500], [100, 500]]) {
    const files = [], truth = []; let sourceBytes = 0;
    for (let i = 0; i < count; i++) {
      const bad = count > 1 && i === count - 1;
      const body = ['Monthly report', `Reference: SYN-${i}`, 'Date: 2026-09-30', ...(bad ? [] : ['Total: 1234.50']),
        ...Array.from({ length: filler }, (_, line) => `Line item ${line}: Synthetic unrelated product description and shipping detail.`)].join('\n') + '\n';
      const file = path.join(dir, `batch-${count}-${i}.txt`); await fs.writeFile(file, body); files.push(file); sourceBytes += Buffer.byteLength(body);
      truth.push(bad ? 'needs_review' : 'matched');
    }
    const profile = path.join(dir, 'profile.json'); const setupTimes = [], batchTimes = [], scriptTimes = [];
    let text, baseline, reportBytes;
    for (let trial = 0; trial < 3; trial++) {
      let start = performance.now();
      // Models would also need to choose/verify rules. This measures only local sample read + recipe save.
      await fs.readFile(files[0], 'utf8'); await fs.writeFile(profile, JSON.stringify(recipe)); setupTimes.push(performance.now() - start);
      const out = path.join(dir, `result-${count}-${trial}.jsonl`);
      start = performance.now(); text = await runTool('extract', { paths: files, profile, out }); batchTimes.push(performance.now() - start);
      const report = await fs.readFile(out, 'utf8'); reportBytes = Buffer.byteLength(report);
      const rows = report.trim().split('\n').map(s => JSON.parse(s));
      assert.deepEqual(rows.slice(1).map(r => r.status), truth);
      for (const row of rows.slice(1).filter(r => r.status === 'matched')) assert.equal(row.fields.total.value, '1234.50');
      start = performance.now(); const scripted = [];
      // Independent prepared code for this known format; a real alternative, not full-file model reading.
      for (const file of files) {
        const lines = (await fs.readFile(file, 'utf8')).split('\n').map(s => s.trim());
        const fields = {}; let valid = lines.includes('Monthly report');
        for (const [name, label, pattern] of [['reference', 'Reference:', /^SYN-\d+$/], ['total', 'Total:', /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/], ['date', 'Date:', /^2026-09-30$/]]) {
          const matching = lines.flatMap((line, i) => line.startsWith(label) ? [{ value: line.slice(label.length).trim(), at: `line ${i + 1}` }] : []);
          if (matching.length !== 1 || !pattern.test(matching[0].value)) valid = false;
          else fields[name] = matching[0];
        }
        scripted.push({ file, status: valid ? 'matched' : 'needs_review', ...(valid ? { fields } : {}) });
      }
      baseline = JSON.stringify(scripted); scriptTimes.push(performance.now() - start);
      assert.deepEqual(scripted.map(r => r.status), truth);
      assert.deepEqual(rows.slice(1).map(r => r.fields ?? null), scripted.map(r => r.fields ?? null));
    }
    results.push({ count, sourceBytes, sampleReadBytes: (await fs.stat(files[0])).size, profileBytes: Buffer.byteLength(JSON.stringify(recipe)), responseBytes: Buffer.byteLength(text), fullReportBytes: reportBytes, preparedResponseBytes: Buffer.byteLength(baseline), setupMs: median(setupTimes), batchMs: median(batchTimes), preparedMs: median(scriptTimes) });
  }
  const lines = ['# Reusable document profile measurements', '', `Synthetic TXT reports, 3 trials per case; medians, ${process.platform}/${process.arch}, Node ${process.version}. No company data or model calls. Setup is one example read plus saving known rules; it does not measure an agent inventing/checking the rules. Batch time includes reading the saved profile, starting an isolated process, reading/parsing every document, validating every field, writing a full report and formatting the bounded response. No warmed document cache carries across batches.`, '', '| Documents | Source bytes | Initial example + profile bytes | Response bytes | Complete report bytes | Setup ms | Batch ms | Prepared script ms |', '|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const r of results) lines.push(`| ${r.count} | ${r.sourceBytes} | ${r.sampleReadBytes + r.profileBytes} | ${r.responseBytes} | ${r.fullReportBytes} | ${r.setupMs.toFixed(2)} | ${r.batchMs.toFixed(2)} | ${r.preparedMs.toFixed(2)} |`);
  lines.push('', 'Every expected field value/status is checked. Batches of 25/100 contain one missing-total document, which must need review. The tiny case demonstrates that a tool response can exceed its entire input. The prepared script already knows the format and is faster; profiles are not a faster parsing algorithm. For complete comparison, use the complete-report bytes, not the preview alone.', '', 'The reusable benefit is one batch invocation for all three fields, without resending rules or repeatedly rediscovering them. Existing extraction can also batch patterns; neither that nor a correct script should be displaced merely because a profile is available. A new MCP parameter and its documentation can add model overhead; compare the actual catalog as well.', '', 'These figures do not prove lower billed dollars, total model tokens or end-to-end agent time. One-time setup and review must be amortized across actual repeated work. No automatic model fallback runs on mismatches. Reproduce: `npm run bench:profiles`. CI checks answers, not a minimum saving percentage.', '');
  await fs.writeFile(process.argv[2] ?? 'bench/PROFILES.md', lines.join('\n')); console.log(JSON.stringify(results, null, 2));
} finally { await fs.rm(dir, { recursive: true, force: true }); }
