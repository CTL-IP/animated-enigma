/**
 * The `texas-tax` skill's reference files, rendered from the same data the
 * application and the MCP server run on. Generated, never hand-edited: a test
 * compares the committed files with a fresh render, so the skill can't tell
 * Claude one thing while the code does another.
 *
 * Regenerate with `pnpm texas-tax:render`.
 */

import {
  LEDGER,
  LEDGER_CHECKED_ON,
  LEDGER_STATUS_LABELS,
  LEDGER_TOPICS,
  type LedgerTopic,
} from './ledger';
import {
  BUSINESS_PROFILES,
  PROFILE_LABELS,
  PROFILE_OBLIGATIONS,
  PUBLICATION_RELEVANCE,
  obligationStatus,
} from './profiles';
import { PUBLICATIONS_INDEX_URL, TX_PUBLICATIONS, type TxPublication } from './publications';
import { findPublication, queryPublications } from './texas-tax-core';

const GENERATED =
  '<!-- Generated from src/lib/texas-tax by `pnpm texas-tax:render`. Do not edit by hand: a test fails when this file and the data disagree. -->';

/** Pipes would break a table cell. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function numberCell(pub: TxPublication): string {
  const label = pub.number ?? pub.numberLabel ?? '—';
  if (!pub.url) return label;
  return `[${label}](${pub.url})${pub.urlChecked ? '' : '†'}`;
}

function spanishCell(pub: TxPublication): string {
  if (!pub.spanish) return '';
  const s = pub.spanish;
  return ` · es: [${s.number}](${s.url})${s.urlChecked ? '' : '†'} ${cell(s.title)}`;
}

function relevanceCell(key: string): string {
  const relevance = PUBLICATION_RELEVANCE[key];
  if (!relevance) return '—';
  const who = relevance.profiles
    .map((p) => `${PROFILE_LABELS[p.profile]}${p.level === 'core' ? ' (core)' : ''}`)
    .join('; ');
  return cell(`${who}. ${relevance.why}`);
}

export function renderPublicationsMarkdown(): string {
  const rowCount = TX_PUBLICATIONS.reduce((n, pub) => n + pub.subjects.length, 0);
  const out: string[] = [
    GENERATED,
    '',
    '# Texas Comptroller tax publications',
    '',
    `The index as published at ${PUBLICATIONS_INDEX_URL} — ${TX_PUBLICATIONS.length} publications, ${rowCount} rows once cross-listings count — in the three orders the Comptroller offers: by subject, by number, by title.`,
    '',
    'A † marks an address built from the Comptroller’s own pattern that was not seen live when this was built. "Matters to" is this repository’s judgement, by kind of business; "(core)" means read it before doing that kind of work.',
    '',
    '## By subject',
  ];

  let subject: string | null = null;
  for (const row of queryPublications({ sort: 'subject' })) {
    if (row.subject !== subject) {
      subject = row.subject;
      out.push('', `### ${subject}`, '', '| No. | Title | Matters to |', '|---|---|---|');
    }
    const pub = row.publication;
    out.push(
      `| ${numberCell(pub)} | ${cell(pub.title)}${pub.pdf ? ' (PDF)' : ''}${spanishCell(pub)} | ${relevanceCell(pub.key)} |`,
    );
  }

  out.push('', '## By number', '', '| No. | Title | Subjects |', '|---|---|---|');
  for (const { publication: pub } of queryPublications({ sort: 'number' })) {
    out.push(`| ${numberCell(pub)} | ${cell(pub.title)}${pub.pdf ? ' (PDF)' : ''} | ${cell(pub.subjects.join('; '))} |`);
  }

  out.push('', '## By title', '', '| Title | No. |', '|---|---|');
  for (const { publication: pub } of queryPublications({ sort: 'title' })) {
    out.push(`| ${cell(pub.title)}${pub.pdf ? ' (PDF)' : ''} | ${numberCell(pub)} |`);
  }

  const notes = TX_PUBLICATIONS.filter((pub) => pub.note);
  if (notes.length > 0) {
    out.push('', '## Notes on individual entries', '');
    for (const pub of notes) out.push(`- **${pub.number ?? pub.title}** — ${pub.note}`);
  }
  return `${out.join('\n')}\n`;
}

const TOPIC_TITLES: Record<LedgerTopic, string> = {
  contracting: 'Contracting',
  filing: 'Filing, penalties and audits',
  franchise: 'Franchise tax',
  'motor-vehicle': 'Motor vehicles',
  other: 'Other',
};

export function renderLedgerMarkdown(): string {
  const counts = { confirmed: 0, partial: 0, unresolved: 0 };
  for (const fact of LEDGER) counts[fact.status] += 1;
  const out: string[] = [
    GENERATED,
    '',
    '# The ledger: every rule, with its evidence',
    '',
    `${LEDGER.length} facts, checked ${LEDGER_CHECKED_ON}: ${counts.confirmed} confirmed, ${counts.partial} partly confirmed, ${counts.unresolved} not settled.`,
    '',
    'How they were checked matters. comptroller.texas.gov was blocked by the build environment’s network policy, so the pages were read through web-search excerpts, not opened in full. Where a fact is short of confirmed, the note says why. Code cites these by id — `src/lib/texas-tax/ledger.ts` — and a test fails if a cited id is missing.',
  ];
  for (const topic of LEDGER_TOPICS) {
    const facts = LEDGER.filter((f) => f.topic === topic);
    if (facts.length === 0) continue;
    out.push('', `## ${TOPIC_TITLES[topic]}`);
    for (const f of facts) {
      out.push(
        '',
        `### \`${f.id}\` — ${LEDGER_STATUS_LABELS[f.status]}`,
        '',
        f.statement,
        '',
        `- Sources: ${f.sources.map((s) => `[${s.label}](${s.url})`).join('; ')}`,
        `- How checked: ${f.method}`,
      );
      if (f.note) out.push(`- Note: ${f.note}`);
    }
  }
  return `${out.join('\n')}\n`;
}

export function renderObligationsMarkdown(): string {
  const out: string[] = [
    GENERATED,
    '',
    '# Obligations by kind of business',
    '',
    'What each kind of business does under the Texas rules in the ledger. **Rule** items are backed by ledger facts and carry the weakest status among them; **Read first** items claim nothing beyond pointing at the publications to read before acting. A group of companies maps each company onto one or more of these profiles.',
  ];
  for (const profile of BUSINESS_PROFILES) {
    out.push('', `## ${PROFILE_LABELS[profile]}`, '', `Profile id: \`${profile}\``);
    for (const o of PROFILE_OBLIGATIONS[profile]) {
      const status = obligationStatus(o);
      const tag = status === 'pointer' ? 'Read first' : `Rule — ${LEDGER_STATUS_LABELS[status]}`;
      out.push('', `### ${o.title}`, '', `*${tag}.* ${o.detail}`);
      const pubs = o.publications.flatMap((key) => {
        const pub = findPublication(key);
        return pub ? [pub.url ? `[${pub.number ?? pub.title}](${pub.url})` : (pub.number ?? pub.title)] : [];
      });
      if (pubs.length > 0) out.push('', `Publications: ${pubs.join(', ')}`);
      if (o.ledger.length > 0) out.push('', `Ledger: ${o.ledger.map((id) => `\`${id}\``).join(', ')}`);
    }
  }
  return `${out.join('\n')}\n`;
}

/** The generated files, by path relative to the skill directory. */
export function renderSkillReferences(): Record<string, string> {
  return {
    'references/publications.md': renderPublicationsMarkdown(),
    'references/ledger.md': renderLedgerMarkdown(),
    'references/obligations.md': renderObligationsMarkdown(),
  };
}
