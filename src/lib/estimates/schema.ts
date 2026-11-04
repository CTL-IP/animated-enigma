import { z } from 'zod';
import { LINE_TYPES } from './estimate-core';
import { UNITS } from '@/lib/catalog/catalog-core';
import { VERSION_STATUSES } from '@/lib/scopes/scopes-core';

/** Zod schemas for estimate editing (Task 16). */

export const createEstimateSchema = z.object({
  projectId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  scopeVersionId: z
    .union([z.literal(''), z.string().uuid()])
    .optional()
    .transform((v) => (v ? v : undefined)),
});

const qty = z.coerce.number().nonnegative('Quantity can’t be negative.').max(1_000_000);
const money = z.coerce.number().nonnegative('Cost can’t be negative.').max(100_000_000);
const percent = z
  .union([z.literal(''), z.coerce.number().min(0).max(100)])
  .optional()
  .transform((v) => (v === '' || v === undefined ? 0 : Number(v) / 100));

/**
 * Always stated. Both line forms send 'true' or 'false', so a line without one
 * didn't come from them and is refused rather than guessed. Guessing is how
 * this broke: a missing value read as taxed, and an unticked checkbox sends
 * nothing — so unticking Taxable saved it taxed.
 *
 * A ticked box arrives as a hidden 'false' followed by the box's 'true', so
 * read the form with `Object.fromEntries` (last value wins), not
 * `formData.get` (first).
 */
const taxableFlag = z
  .enum(['true', 'false'], { message: 'Say whether the line is taxable.' })
  .transform((v) => v === 'true');

/** Add a line from a catalog item — costs snapshot server-side from the item. */
export const addCatalogLineSchema = z.object({
  estimateVersionId: z.string().uuid(),
  catalogItemId: z.string().uuid(),
  quantity: qty.default(1),
});

/** Add or edit a free-form line. */
export const lineSchema = z.object({
  estimateVersionId: z.string().uuid(),
  description: z.string().trim().min(1, 'Add a description.').max(500),
  lineType: z.enum(LINE_TYPES).default('material'),
  quantity: qty.default(1),
  unit: z.enum(UNITS).default('each'),
  unitCost: money.default(0),
  wasteFactorPct: percent,
  taxable: taxableFlag,
});

export const updateLineSchema = z.object({
  lineId: z.string().uuid(),
  description: z.string().trim().min(1, 'Add a description.').max(500),
  lineType: z.enum(LINE_TYPES),
  quantity: qty,
  unit: z.enum(UNITS),
  unitCost: money,
  wasteFactorPct: percent,
  taxable: taxableFlag,
});

/**
 * A Pricing rate typed as a percent. The columns keep a fraction to four places,
 * so two decimals of a percent — 8.25 — is the finest a rate can be stored.
 * Anything finer is refused rather than rounded: the column would quietly keep
 * 8.125 as 8.13, and a tax rate that changes itself is worse than one that asks.
 *
 * Stored as hundredths over 10,000, not `n / 100`, so 8.15 goes in as 0.0815
 * rather than 0.08150000000000002.
 */
const ratePercent = (label: string) =>
  z
    .union([z.literal(''), z.coerce.number().min(0).max(100)])
    .optional()
    .refine(
      (v) => v === '' || v === undefined || Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
      `${label} takes two decimal places at most — 8.25, not 8.125.`,
    )
    .transform((v) => (v === '' || v === undefined ? 0 : Math.round(Number(v) * 100) / 10000));

export const ratesSchema = z.object({
  estimateVersionId: z.string().uuid(),
  overheadPct: ratePercent('Overhead %'),
  profitPct: ratePercent('Profit %'),
  taxRate: ratePercent('Tax %'),
  name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const statusChangeSchema = z.object({
  versionId: z.string().uuid(),
  status: z.enum(VERSION_STATUSES),
});
