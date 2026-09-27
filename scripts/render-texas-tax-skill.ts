/**
 * Writes the texas-tax skill's generated reference files from the data in
 * src/lib/texas-tax. Run after changing the index, the ledger or the profiles:
 *
 *   pnpm texas-tax:render
 *
 * The sync test (src/lib/texas-tax/render.test.ts) fails until you do.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderSkillReferences } from '../src/lib/texas-tax/render';

const SKILL_DIR = join(process.cwd(), '.claude', 'skills', 'texas-tax');

for (const [relative, body] of Object.entries(renderSkillReferences())) {
  const target = join(SKILL_DIR, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
  process.stdout.write(`wrote ${relative} (${body.length} bytes)\n`);
}
