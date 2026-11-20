// Runs every tests/scenarios/fixtures/*.json through the REAL CLI and stores
// scenario.json / inputs.json / output.jsonl per fixture + a markdown table (stdout).
// Usage: node scripts/run-fixtures.mjs <outDir>
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
if (!outDir) { console.error('usage: run-fixtures.mjs <outDir>'); process.exit(1); }
const fixDir = 'tests/scenarios/fixtures';
const rows = [];
let failed = 0;
for (const file of readdirSync(fixDir).filter((f) => f.endsWith('.json')).sort()) {
  const f = JSON.parse(readFileSync(join(fixDir, file), 'utf8'));
  const dir = join(outDir, f.id);
  mkdirSync(dir, { recursive: true });
  const args = ['build/headless/cli.js', '--seed', String(f.seed), '--night', String(f.night ?? 1), '--ticks', String(f.ticks),
    '--snapshot-every', String(f.snapshot_every), '--out', join(dir, 'output.jsonl')];
  if (f.scenario) { writeFileSync(join(dir, 'scenario.json'), JSON.stringify(f.scenario, null, 2)); args.push('--scenario', join(dir, 'scenario.json')); }
  if (f.inputs) { writeFileSync(join(dir, 'inputs.json'), JSON.stringify(f.inputs, null, 2)); args.push('--inputs', join(dir, 'inputs.json')); }
  writeFileSync(join(dir, 'expected.json'), JSON.stringify(f.expect, null, 2));
  const r = spawnSync('node', args, { encoding: 'utf8' });
  writeFileSync(join(dir, 'command.txt'), `node ${args.join(' ')}\nexit=${r.status}\n${r.stderr}`);
  const lines = r.status === 0 ? readFileSync(join(dir, 'output.jsonl'), 'utf8').trim().split('\n') : [];
  const end = lines.length ? lines.at(-1) : '(none)';
  const events = lines.filter((l) => l.includes('"type":"event"')).length;
  if (r.status !== 0) failed++;
  rows.push(`| ${f.id} | ${f.requirement} | ${f.description} | ${r.status} | ${events} | \`${end}\` |`);
}
console.log('# Scenario evidence (real CLI output)\n');
console.log('Pass/fail against `expected.json` is asserted by `tests/scenarios/headless.test.ts` (see ../unit-and-scenario-tests.log).\n');
console.log('| Fixture | Req | Description | Exit | Events | End line |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
process.exit(failed ? 1 : 0);
