import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  renderLedgerMarkdown,
  renderObligationsMarkdown,
  renderPublicationsMarkdown,
  renderSkillReferences,
} from './render';

const SKILL_DIR = join(process.cwd(), '.claude', 'skills', 'texas-tax');

describe('the skill references', () => {
  it('match the data exactly — rerun `pnpm texas-tax:render` if this fails', () => {
    for (const [relative, body] of Object.entries(renderSkillReferences())) {
      expect(readFileSync(join(SKILL_DIR, relative), 'utf8'), relative).toBe(body);
    }
  });
});

describe('renderPublicationsMarkdown', () => {
  const md = renderPublicationsMarkdown();

  it('lists the index three ways', () => {
    expect(md).toMatch(/^<!-- Generated from src\/lib\/texas-tax/);
    expect(md).toMatch(/92 publications, 95 rows/);
    for (const heading of ['## By subject', '## By number', '## By title']) expect(md).toContain(heading);
    // Cross-listed under both subjects in the subject view.
    expect(md.split('Hotel Occupancy Tax Exemptions').length - 1).toBe(4);
  });

  it('links checked addresses plainly and marks pattern-built ones', () => {
    expect(md).toContain('[94-116](https://comptroller.texas.gov/taxes/publications/94-116.php) |');
    expect(md).toContain('[94-167](https://comptroller.texas.gov/taxes/publications/94-167.php)†');
  });

  it('carries the Spanish editions and the notes', () => {
    expect(md).toContain('es: [94-116s]');
    expect(md).toContain('## Notes on individual entries');
  });
});

describe('renderLedgerMarkdown', () => {
  it('counts the facts by status and says how they were checked', () => {
    const md = renderLedgerMarkdown();
    expect(md).toMatch(/\d+ facts, checked 2026-09-26 and 2026-09-27: \d+ confirmed, \d+ partly confirmed, 1 not settled\./);
    expect(md).toContain('### `manufactured-homes` — Not settled');
    expect(md).toContain('### `exempt-lump-sum-materials` — Confirmed');
    expect(md).toContain('### `franchise-no-tax-due-2027` — Partly confirmed');
    expect(md).toMatch(/web-search excerpts, not opened in full/);
  });
});

describe('renderObligationsMarkdown', () => {
  it('covers every profile and tells rules from pointers', () => {
    const md = renderObligationsMarkdown();
    expect(md).toContain('## Vehicle rental company');
    expect(md).toContain('*Rule — Confirmed.*');
    expect(md).toContain('*Read first.*');
  });
});
