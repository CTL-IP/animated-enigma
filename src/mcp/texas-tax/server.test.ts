import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SERVER_INSTRUCTIONS, SERVER_NAME, createTexasTaxServer, evidenceLine } from './server';

let client: Client;

beforeEach(async () => {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await createTexasTaxServer().connect(serverSide);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
});

afterEach(async () => {
  await client.close();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { text: content.map((c) => c.text).join('\n'), isError: result.isError === true };
}

describe('the texas-tax MCP server', () => {
  it('introduces itself and says how sure it is', () => {
    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    expect(SERVER_INSTRUCTIONS).toMatch(/search excerpts/);
    expect(SERVER_INSTRUCTIONS).toMatch(/not tax advice/);
  });

  it('offers the eleven tools, all read-only', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'tx_check_rate',
      'tx_classify_contract',
      'tx_franchise_position',
      'tx_get_publication',
      'tx_late_payment',
      'tx_ledger',
      'tx_next_sales_tax_due',
      'tx_profile_obligations',
      'tx_sales_tax_due',
      'tx_search_publications',
      'tx_vehicle_rental',
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
      expect(tool.description!.length, tool.name).toBeGreaterThan(40);
    }
  });

  it('searches the index, sorted the way asked', async () => {
    const byNumber = await call('tx_search_publications', { subject: 'Franchise Tax', sort: 'number' });
    expect(byNumber.text).toMatch(/^2 of 2 rows, sorted by number\./);
    expect(byNumber.text).toMatch(/98-806 · Franchise Tax Overview/);

    const spanish = await call('tx_search_publications', { query: 'reparación y remodelación' });
    expect(spanish.text).toMatch(/94-116 · Real Property Repair and Remodeling/);
    expect(spanish.text).toMatch(/Why it matters:/);

    const limited = await call('tx_search_publications', { limit: 3 });
    expect(limited.text).toMatch(/^3 of 95 rows/);
    expect(limited.text).toMatch(/92 more/);

    const none = await call('tx_search_publications', { query: 'zzzz nothing' });
    expect(none.text).toMatch(/Nothing in the index matches/);
  });

  it('marks a link it never saw live', async () => {
    const r = await call('tx_get_publication', { number: '94-167' });
    expect(r.text).toMatch(/not seen live/);
    const seen = await call('tx_get_publication', { number: '94-116s' });
    expect(seen.text).toMatch(/94-116\.php\n/);
    expect(seen.text).toMatch(/Spanish: 94-116s · Reparación y Remodelación de Bienes Raíces/);
  });

  it('says so when a publication isn’t in the index', async () => {
    const r = await call('tx_get_publication', { number: '99-999' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/No publication “99-999”/);
  });

  it('classifies a job, with steps, sources and evidence', async () => {
    const r = await call('tx_classify_contract', {
      propertyUse: 'nonresidential',
      workKind: 'repair-remodel',
      contractForm: 'lump-sum',
    });
    expect(r.text).toMatch(/Customer is taxed on: the whole charge, labor included/);
    expect(r.text).toMatch(/Labor taxable: yes/);
    expect(r.text).toMatch(/Sources: Pub 94-116/);
    expect(r.text).toMatch(/Evidence: Confirmed/);
    expect(r.text).not.toMatch(/\n\n\n/);
  });

  it('carries an unsettled rule through as unsettled', async () => {
    const r = await call('tx_classify_contract', {
      propertyUse: 'nonresidential',
      workKind: 'repair-remodel',
      contractForm: 'lump-sum',
      customer: 'government',
    });
    expect(r.text).toMatch(/Evidence: Not settled/);
    expect(r.text).toMatch(/exempt-lump-sum-materials/);
  });

  it('rejects arguments outside the schema', async () => {
    const r = await call('tx_classify_contract', {
      propertyUse: 'castle',
      workKind: 'repair-remodel',
      contractForm: 'lump-sum',
    });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Input validation error/);
  });

  it('works out due dates, flagging weekends and holidays', async () => {
    const aug = await call('tx_sales_tax_due', { frequency: 'monthly', year: 2026, month: 8 });
    expect(aug.text).toMatch(/\*\*August 2026\*\* — file by \*\*2026-09-21\*\*/);
    expect(aug.text).toMatch(/weekend day/);

    const mlk = await call('tx_sales_tax_due', { frequency: 'monthly', year: 2024, month: 12 });
    expect(mlk.text).toMatch(/Martin Luther King Jr\. Day/);
    expect(mlk.text).toMatch(/never late/);

    const next = await call('tx_next_sales_tax_due', { frequency: 'quarterly', today: '2026-09-26' });
    expect(next.text).toMatch(/Q3 2026 \(Jul–Sep\).*2026-10-20/);

    const bad = await call('tx_sales_tax_due', { frequency: 'monthly', year: 2026 });
    expect(bad).toMatchObject({ isError: true, text: 'Give the month as 1–12.' });
  });

  it('prices a late payment', async () => {
    const r = await call('tx_late_payment', {
      taxDue: '1,000.00',
      dueDate: '2026-01-20',
      paidDate: '2026-02-20',
    });
    expect(r.text).toMatch(/31 days late: 10% penalty/);
    expect(r.text).toMatch(/Total before interest: \$150\.00/);
    expect(r.text).toMatch(/Interest would start on 2026-03-22/);

    const bad = await call('tx_late_payment', { taxDue: 'lots', dueDate: '2026-01-20', paidDate: '2026-02-20' });
    expect(bad.isError).toBe(true);
  });

  it('places revenue against the franchise threshold', async () => {
    const r = await call('tx_franchise_position', { reportYear: 2026, annualizedRevenue: 900000, combinedGroup: true });
    expect(r.text).toMatch(/At or below the \$2,650,000\.00 no-tax-due threshold/);
    expect(r.text).toMatch(/whole group/);
    const unknown = await call('tx_franchise_position', { reportYear: 2027, annualizedRevenue: 1 });
    expect(unknown.text).toMatch(/No threshold is recorded here for 2027/);
  });

  it('answers vehicle rental questions and asks for something to answer', async () => {
    const r = await call('tx_vehicle_rental', { contractDays: 45, vehiclesHeldForRental: 4 });
    expect(r.text).toMatch(/31–180 days: collect 6\.25%/);
    expect(r.text).toMatch(/a qualified permit needs five/);
    const empty = await call('tx_vehicle_rental', {});
    expect(empty).toMatchObject({ isError: true });
  });

  it('checks a rate', async () => {
    expect((await call('tx_check_rate', { ratePercent: 8.25 })).text).toMatch(/^OK:/);
    expect((await call('tx_check_rate', { ratePercent: '0.0825' })).text).toMatch(/looks like a fraction/);
  });

  it('lists a profile’s obligations with their standing', async () => {
    const r = await call('tx_profile_obligations', { profile: 'vehicle-rental' });
    expect(r.text).toMatch(/\*\*Vehicle rental company\*\*/);
    expect(r.text).toMatch(/Collect rental tax on every rental\*\* — Confirmed/);
    const insurance = await call('tx_profile_obligations', { profile: 'insurance-agency' });
    expect(insurance.text).toMatch(/— Read first/);
  });

  it('opens the ledger, filtered', async () => {
    const unresolved = await call('tx_ledger', { status: 'unresolved' });
    expect(unresolved.text).toMatch(/^2 facts/);
    expect(unresolved.text).toMatch(/exempt-lump-sum-materials/);
    expect(unresolved.text).toMatch(/manufactured-homes/);
    const one = await call('tx_ledger', { id: 'rate-range' });
    expect(one.text).toMatch(/Sales Tax Rate Locator/);
    const missing = await call('tx_ledger', { id: 'nope' });
    expect(missing.isError).toBe(true);
  });
});

describe('evidenceLine', () => {
  it('names the facts and the weakest status among them', () => {
    expect(evidenceLine(['rate-range'])).toMatch(/^Evidence: Confirmed — rate-range\./);
    expect(evidenceLine(['rate-range', 'veteran-owned-exemption'])).toMatch(/^Evidence: Partly confirmed/);
    expect(evidenceLine([])).toMatch(/no ledger fact/);
  });
});
