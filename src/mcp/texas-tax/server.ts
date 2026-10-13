/**
 * The Texas tax knowledge in `src/lib/texas-tax/` as an MCP server, so any
 * Claude session in this repository — or any MCP client — can look up a
 * publication, classify a job, or work out a due date with the same code the
 * application runs.
 *
 * Read-only and offline: nothing here calls the network, so nothing here can
 * be out of date in a way the ledger doesn't already admit. Every answer ends
 * with its evidence line — which ledger facts it rests on and how firmly —
 * because an assistant quoting this to a contractor has to be able to say
 * how sure it is.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { today } from '@/lib/schedule/schedule-core';
import {
  LEDGER,
  LEDGER_CHECKED_ON,
  LEDGER_STATUSES,
  LEDGER_STATUS_LABELS,
  LEDGER_TOPICS,
  checkedOnDates,
  ledgerFact,
  weakestStatus,
  type LedgerStatus,
} from '@/lib/texas-tax/ledger';
import {
  BUSINESS_PROFILES,
  PROFILE_LABELS,
  PROFILE_OBLIGATIONS,
  PUBLICATION_RELEVANCE,
  obligationStatus,
} from '@/lib/texas-tax/profiles';
import { PUBLICATIONS_INDEX_URL, TX_SUBJECTS, type TxPublication } from '@/lib/texas-tax/publications';
import {
  CONTRACT_FORMS,
  CUSTOMER_KINDS,
  FILING_FREQUENCIES,
  PROPERTY_USES,
  PUBLICATION_SORTS,
  WORK_KINDS,
  checkCombinedRate,
  classifyContract,
  findPublication,
  franchisePosition,
  latePayment,
  nextSalesTaxDue,
  queryPublications,
  rentalPermitStatus,
  salesTaxDue,
  vehicleRentalTax,
  type DueDate,
} from '@/lib/texas-tax/texas-tax-core';

export const SERVER_NAME = 'texas-tax';
export const SERVER_VERSION = '1.0.0';

export const SERVER_INSTRUCTIONS = `Texas Comptroller tax publications and the Texas rules a contractor or small business group acts on: contract taxability (residential vs nonresidential, lump-sum vs separated), resale and exemption certificates, local rates, sales tax due dates, late penalties, franchise tax thresholds, and vehicle rental tax.

Every rule was checked against Comptroller pages through web-search excerpts — most on ${LEDGER_CHECKED_ON}, a few since — not by reading the full pages. Each answer ends with an evidence line: confirmed, partly confirmed, or not settled. Say which when you rely on it, link the publication for anything that matters, and never present an unsettled rule as settled. This is research material, not tax advice.`;

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

function text(body: string): CallToolResult {
  return { content: [{ type: 'text', text: body }] };
}

function failure(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** "Evidence: Confirmed — a, b (checked … ; tx_ledger has the sources)." */
export function evidenceLine(ledger: readonly string[], status?: LedgerStatus): string {
  const firmness = status ?? weakestStatus(ledger);
  const ids = ledger.length > 0 ? ledger.join(', ') : 'no ledger fact';
  return `Evidence: ${LEDGER_STATUS_LABELS[firmness]} — ${ids}. Checked ${checkedOnDates(ledger).join(' and ')} against Comptroller pages via search excerpts; tx_ledger has the sources.`;
}

function linkNote(pub: { url: string | null; urlChecked: boolean }): string {
  if (!pub.url) return 'no link';
  return `${pub.url}${pub.urlChecked ? '' : ' (address follows the Comptroller’s pattern; not seen live)'}`;
}

function pubLabel(pub: TxPublication): string {
  return pub.number ?? pub.numberLabel ?? '—';
}

function sourcesLine(keys: readonly string[]): string {
  const parts = keys.flatMap((key) => {
    const pub = findPublication(key);
    return pub ? [`${pub.number ? `Pub ${pub.number}` : pub.title} <${pub.url ?? PUBLICATIONS_INDEX_URL}>`] : [];
  });
  return parts.length > 0 ? `Sources: ${parts.join('; ')}` : '';
}

function dueDateLines(d: DueDate): string[] {
  const lines = [`**${d.period}** — file by **${d.due}**.`];
  if (d.movedForWeekend) lines.push(`The rule names ${d.nominal}, a weekend day, so it moves to the next working day.`);
  if (d.possibleHoliday) {
    lines.push(
      `${d.due} is ${d.possibleHoliday}. If that counts as a legal holiday for Comptroller due dates the deadline moves a day later — filing by ${d.due} is never late.`,
    );
  }
  return lines;
}

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .describe('A calendar day, YYYY-MM-DD.');

const amount = z
  .union([z.number(), z.string().max(40)])
  .describe('An amount in dollars, e.g. 1234.56 or "1,234.56".');

export function createTexasTaxServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    'tx_search_publications',
    {
      title: 'Search Texas tax publications',
      description:
        'Search or list the Texas Comptroller’s tax publication index (92 publications). Sort by subject, number or title, as the Comptroller does; filter by subject, by text (numbers, English or Spanish titles), or by the kind of business it matters to.',
      inputSchema: {
        query: z.string().max(200).optional().describe('Words or a number to look for, e.g. "repair", "94-116", "reparación".'),
        subject: z.enum(TX_SUBJECTS).optional().describe('Only this index subject.'),
        profile: z
          .enum(BUSINESS_PROFILES)
          .optional()
          .describe('Only publications that matter to this kind of business.'),
        level: z.enum(['core', 'situational']).optional().describe('With profile: core reading, or only in some situations.'),
        sort: z.enum(PUBLICATION_SORTS).optional().describe('subject (default), number or title.'),
        limit: z.number().int().min(1).max(100).optional().describe('Most rows to return (default 25).'),
      },
      annotations: READ_ONLY,
    },
    async ({ query, subject, profile, level, sort, limit }) => {
      const rows = queryPublications({ text: query, subject, profile, level, sort });
      const shown = rows.slice(0, limit ?? 25);
      if (rows.length === 0) {
        return text(`Nothing in the index matches. The full index is at ${PUBLICATIONS_INDEX_URL}.`);
      }
      const out = [
        `${shown.length} of ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}, sorted by ${sort ?? 'subject'}.`,
      ];
      let heading: string | null = null;
      for (const row of shown) {
        if (row.subject && row.subject !== heading) {
          heading = row.subject;
          out.push('', `**${row.subject}**`);
        }
        const pub = row.publication;
        const spanish = pub.spanish ? ` · Spanish ${pub.spanish.number}: ${pub.spanish.title}` : '';
        out.push(`- ${pubLabel(pub)} · ${pub.title}${pub.pdf ? ' (PDF)' : ''}${spanish} — ${linkNote(pub)}`);
        if (row.relevance) out.push(`  Why it matters: ${row.relevance.why}`);
      }
      if (rows.length > shown.length) out.push('', `${rows.length - shown.length} more — raise limit or narrow the search.`);
      return text(out.join('\n'));
    },
  );

  server.registerTool(
    'tx_get_publication',
    {
      title: 'Get one Texas tax publication',
      description:
        'One publication from the Comptroller’s index by number (94-116), Spanish number (94-116s) or key: title, subjects, link, Spanish edition, and who it matters to.',
      inputSchema: {
        number: z.string().min(1).max(60).describe('Publication number or key, e.g. "94-116" or "2025-legislative-update".'),
      },
      annotations: READ_ONLY,
    },
    async ({ number }) => {
      const pub = findPublication(number);
      if (!pub) {
        return failure(`No publication “${number}” in the index. Try tx_search_publications, or browse ${PUBLICATIONS_INDEX_URL}.`);
      }
      const relevance = PUBLICATION_RELEVANCE[pub.key];
      const out = [
        `**${pubLabel(pub)} · ${pub.title}**${pub.pdf ? ' (PDF)' : ''}`,
        `Subjects: ${pub.subjects.join('; ')}`,
        `Link: ${linkNote(pub)}`,
      ];
      if (pub.spanish) out.push(`Spanish: ${pub.spanish.number} · ${pub.spanish.title} — ${linkNote(pub.spanish)}`);
      if (pub.note) out.push(`Note: ${pub.note}`);
      if (relevance) {
        out.push(
          `Matters to: ${relevance.profiles.map((p) => `${PROFILE_LABELS[p.profile]} (${p.level})`).join('; ')}`,
          `Why: ${relevance.why}`,
        );
      } else {
        out.push('Matters to: none of the business profiles this server knows.');
      }
      return text(out.join('\n'));
    },
  );

  server.registerTool(
    'tx_classify_contract',
    {
      title: 'How a Texas contract job is taxed',
      description:
        'Classify a Texas construction job: what the customer is taxed on, whether labor is taxable, and how the contractor buys materials (tax paid at purchase or on a resale certificate), with the steps to follow and the evidence behind it.',
      inputSchema: {
        propertyUse: z
          .enum(PROPERTY_USES)
          .describe('residential (homes, apartments, condos, nursing and retirement homes), nonresidential (commercial, incl. hotels), multiple-use, or unknown.'),
        workKind: z
          .enum(WORK_KINDS)
          .describe('repair-remodel, new-construction, scheduled-maintenance, real-property-service (debris haul-off, landscaping…), or disaster-repair (declared disaster area).'),
        contractForm: z
          .enum(CONTRACT_FORMS)
          .describe('lump-sum (one price for labor and materials) or separated (materials and labor charged separately).'),
        customer: z
          .enum(CUSTOMER_KINDS)
          .optional()
          .describe('taxable (default), government, or exempt-organization.'),
      },
      annotations: READ_ONLY,
    },
    async ({ propertyUse, workKind, contractForm, customer }) => {
      const t = classifyContract({ propertyUse, workKind, contractForm, customer: customer ?? 'taxable' });
      const base = {
        none: 'nothing',
        materials: 'the materials charge only',
        total: 'the whole charge, labor included',
        undetermined: 'not determined — see below',
      }[t.customerTaxBase];
      const materials = {
        'pay-tax-at-purchase': 'paying tax to the supplier at purchase',
        'resale-certificate': 'on a resale certificate',
        'exemption-certificate': 'on an exemption certificate (an exempt contract, Tax Code §151.311)',
        undetermined: 'not settled — check before relying on a certificate',
      }[t.materials];
      const out = [
        `**${t.headline}**`,
        `- Customer is taxed on: ${base}`,
        `- Labor taxable: ${t.laborTaxable === null ? 'not determined' : t.laborTaxable ? 'yes' : 'no'}`,
        `- Incorporated materials bought: ${materials}`,
        '',
        'Steps:',
        ...t.steps.map((s, i) => `${i + 1}. ${s}`),
        '',
        sourcesLine(t.publications),
        evidenceLine(t.ledger, t.status),
      ];
      return text(out.filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n'));
    },
  );

  server.registerTool(
    'tx_sales_tax_due',
    {
      title: 'Texas sales tax due date for a period',
      description:
        'When a Texas sales and use tax return is due for a given month, quarter or year, moved off weekends, with any holiday flagged.',
      inputSchema: {
        frequency: z.enum(FILING_FREQUENCIES),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12).optional().describe('For monthly filers.'),
        quarter: z.number().int().min(1).max(4).optional().describe('For quarterly filers.'),
      },
      annotations: READ_ONLY,
    },
    async ({ frequency, year, month, quarter }) => {
      const result = salesTaxDue({ frequency, year, index: frequency === 'monthly' ? month : quarter });
      if ('error' in result) return failure(result.error);
      return text([...dueDateLines(result), evidenceLine(result.ledger)].join('\n'));
    },
  );

  server.registerTool(
    'tx_next_sales_tax_due',
    {
      title: 'Next Texas sales tax return due',
      description: 'The next Texas sales and use tax return still due on or after a day (today by default), for a filing frequency.',
      inputSchema: {
        frequency: z.enum(FILING_FREQUENCIES).describe('The frequency on the Comptroller’s assignment letter.'),
        today: day.optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ frequency, today: on }) => {
      const result = nextSalesTaxDue(frequency, on ?? today());
      if ('error' in result) return failure(result.error);
      return text([...dueDateLines(result), evidenceLine(result.ledger)].join('\n'));
    },
  );

  server.registerTool(
    'tx_late_payment',
    {
      title: 'Cost of a late Texas tax payment',
      description:
        'Penalty for paying Texas tax late: 5% (1–30 days), 10% (over 30), another 10% after a Notice of Tax Due date, the $50 late-filing penalty that may be assessed, the forfeited timely-filing discount, and when interest starts.',
      inputSchema: {
        taxDue: amount,
        dueDate: day,
        paidDate: day,
        filedLate: z.boolean().optional().describe('Was the return itself late? Default: yes, when the payment was.'),
        noticeDate: day.optional().describe('The date on a Notice of Tax Due, if one was issued.'),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      const r = latePayment(args);
      if ('error' in r) return failure(r.error);
      const out = [r.summary];
      if (r.daysLate > 0) {
        out.push(
          `Penalty ${r.penaltyPct}%: $${r.penalty.toFixed(2)}. Late-filing penalty: $${r.lateFilingPenalty.toFixed(2)}. Timely-filing discount given up: $${r.discountForfeited.toFixed(2)}.`,
          `Total before interest: $${r.totalBeforeInterest.toFixed(2)}. Interest ${r.interestApplies ? 'applies from' : 'would start on'} ${r.interestStartsOn}; its rate resets every January 1, so it isn't computed here.`,
        );
      }
      out.push(evidenceLine(r.ledger));
      return text(out.join('\n'));
    },
  );

  server.registerTool(
    'tx_franchise_position',
    {
      title: 'Texas franchise tax position',
      description:
        'Whether an entity (or combined group) is at or below the Texas franchise tax no-tax-due threshold for a report year, and what it must file by May 15.',
      inputSchema: {
        reportYear: z.number().int().min(2000).max(2100),
        annualizedRevenue: amount.describe('Annualized total revenue in dollars.'),
        combinedGroup: z.boolean().optional().describe('Is this the total for a combined group?'),
      },
      annotations: READ_ONLY,
    },
    async ({ reportYear, annualizedRevenue, combinedGroup }) => {
      const r = franchisePosition(reportYear, annualizedRevenue, { combinedGroup });
      if ('error' in r) return failure(r.error);
      const out = [r.message, ...r.steps.map((s) => `- ${s}`), ...dueDateLines(r.due), evidenceLine(r.ledger)];
      return text(out.join('\n'));
    },
  );

  server.registerTool(
    'tx_vehicle_rental',
    {
      title: 'Texas motor vehicle rental tax',
      description:
        'Rental tax for a vehicle rental contract of a given length (10%, 6.25%, or a lease past 180 days), and whether a rental permit can be qualified for a given fleet size.',
      inputSchema: {
        contractDays: z.number().int().min(1).optional().describe('Length of the rental contract in days.'),
        vehiclesHeldForRental: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Vehicles titled and held for rental within 12 months.'),
      },
      annotations: READ_ONLY,
    },
    async ({ contractDays, vehiclesHeldForRental }) => {
      if (contractDays === undefined && vehiclesHeldForRental === undefined) {
        return failure('Give contractDays, vehiclesHeldForRental, or both.');
      }
      const out: string[] = [];
      const ledger: string[] = [];
      if (contractDays !== undefined) {
        const r = vehicleRentalTax(contractDays);
        if ('error' in r) return failure(r.error);
        out.push(r.message);
        ledger.push(...r.ledger);
      }
      if (vehiclesHeldForRental !== undefined) {
        const r = rentalPermitStatus(vehiclesHeldForRental);
        if ('error' in r) return failure(r.error);
        out.push(r.message);
        ledger.push(...r.ledger);
      }
      out.push(sourcesLine(['96-143', '96-254']), evidenceLine(ledger));
      return text(out.join('\n'));
    },
  );

  server.registerTool(
    'tx_check_rate',
    {
      title: 'Is this a Texas sales tax rate?',
      description:
        'Check a combined sales tax rate (as a percent) against Texas’s 6.25% state rate and 8.25% maximum; catches a rate typed as a fraction.',
      inputSchema: {
        ratePercent: z.union([z.number(), z.string().max(20)]).describe('The rate as a percent, e.g. 8.25.'),
      },
      annotations: READ_ONLY,
    },
    async ({ ratePercent }) => {
      const r = checkCombinedRate(ratePercent);
      return text(`${r.ok ? 'OK' : 'Not a Texas rate'}: ${r.message}\n${evidenceLine(r.ledger)}`);
    },
  );

  server.registerTool(
    'tx_profile_obligations',
    {
      title: 'Texas tax obligations for a kind of business',
      description:
        'What a kind of business has to do under Texas tax rules — every Texas entity, contractor, government work, vehicle rental, holding company, logistics, insurance agency, software and data — each item with its evidence status.',
      inputSchema: {
        profile: z.enum(BUSINESS_PROFILES),
      },
      annotations: READ_ONLY,
    },
    async ({ profile }) => {
      const out = [`**${PROFILE_LABELS[profile]}**`];
      for (const o of PROFILE_OBLIGATIONS[profile]) {
        const status = obligationStatus(o);
        const tag = status === 'pointer' ? 'Read first' : LEDGER_STATUS_LABELS[status];
        out.push('', `- **${o.title}** — ${tag}`, `  ${o.detail}`);
        const sources = sourcesLine(o.publications);
        if (sources) out.push(`  ${sources}`);
        if (o.ledger.length > 0) out.push(`  Ledger: ${o.ledger.join(', ')}`);
      }
      const cited = PROFILE_OBLIGATIONS[profile].flatMap((o) => o.ledger);
      out.push('', `Rules checked ${checkedOnDates(cited).join(' and ')} against Comptroller pages via search excerpts. Research material, not tax advice.`);
      return text(out.join('\n'));
    },
  );

  server.registerTool(
    'tx_ledger',
    {
      title: 'The evidence behind the Texas tax rules',
      description:
        'The verification ledger: each rule this server applies, its sources, how it was checked, and whether it is confirmed, partly confirmed or not settled. Filter by id, topic or status.',
      inputSchema: {
        id: z.string().max(80).optional().describe('One fact by id, e.g. "lump-sum-contractor-is-consumer".'),
        topic: z.enum(LEDGER_TOPICS).optional(),
        status: z.enum(LEDGER_STATUSES).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ id, topic, status }) => {
      let facts = [...LEDGER];
      if (id) {
        const fact = ledgerFact(id.trim());
        if (!fact) return failure(`No ledger fact “${id}”. Call tx_ledger with no arguments to list them.`);
        facts = [fact];
      }
      if (topic) facts = facts.filter((f) => f.topic === topic);
      if (status) facts = facts.filter((f) => f.status === status);
      if (facts.length === 0) return text('No ledger facts match.');
      const checked = checkedOnDates(facts.map((f) => f.id)).join(' and ');
      const out = [`${facts.length} ${facts.length === 1 ? 'fact' : 'facts'}, checked ${checked}.`];
      for (const f of facts) {
        out.push(
          '',
          `**${f.id}** — ${LEDGER_STATUS_LABELS[f.status]} (${f.topic})`,
          f.statement,
          `Sources: ${f.sources.map((s) => `${s.label} <${s.url}>`).join('; ')}`,
          `How checked: ${f.method}`,
        );
        if (f.note) out.push(`Note: ${f.note}`);
      }
      return text(out.join('\n'));
    },
  );

  return server;
}
