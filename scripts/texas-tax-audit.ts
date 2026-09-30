/**
 * Runs the app's Texas tax checks over a whole book of jobs.
 *
 *   pnpm texas-tax:audit documents.json        # a file
 *   ... | pnpm texas-tax:audit -               # or stdin
 *
 * Input: the JSON array `scripts/texas-tax-audit.sql` produces (the bare
 * array, or the `{ "documents": [...] }` row it returns). Output: the audit —
 * counts, then each flagged document with its checks — as JSON on stdout.
 * Rows that aren't documents are counted and reported, not silently dropped.
 */

import { readFileSync } from 'node:fs';
import { auditDocuments, isAuditDocument } from '../src/lib/texas-tax/audit';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const source = process.argv[2];
if (!source) fail('Usage: texas-tax-audit <documents.json | ->');

let raw: string;
try {
  raw = readFileSync(source === '-' ? 0 : source, 'utf8');
} catch (error) {
  fail(`Could not read ${source}: ${error instanceof Error ? error.message : String(error)}`);
}

let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch {
  fail('That isn’t JSON. Pass the output of scripts/texas-tax-audit.sql.');
}

// Accept the bare array, the { documents } row, or a one-row result set of it.
const unwrap = (value: unknown): unknown => {
  if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === 'object' && 'documents' in value[0]) {
    return (value[0] as { documents: unknown }).documents;
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && 'documents' in value) {
    return (value as { documents: unknown }).documents;
  }
  return value;
};
const rows = unwrap(parsed);
if (!Array.isArray(rows)) fail('Expected a JSON array of documents.');

const documents = rows.filter(isAuditDocument);
const rejected = rows.length - documents.length;
const result = auditDocuments(documents);

process.stdout.write(`${JSON.stringify({ ...result, rejectedRows: rejected }, null, 2)}\n`);
