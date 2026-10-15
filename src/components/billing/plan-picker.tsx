'use client';

import { useActionState, useState } from 'react';
import {
  BILLING_CADENCES,
  CADENCE_LABELS,
  TIER_ORDER,
  TIER_PRICING,
  computeCharges,
  formatMoney,
  formatPct,
  isBillingCadence,
  isBillingTier,
  type BillingCadence,
  type BillingTier,
} from '@/lib/billing/billing-core';
import { startCheckout } from '@/lib/billing/actions';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SubmitButton, FormNotice } from '@/components/forms/form-bits';

const initial = {} as { error?: string; message?: string };

/**
 * Choose a tier and a cadence, then go to Stripe. The preview underneath uses
 * the organisation's own signed work, so the number it shows is the number
 * that would actually be charged — not a worked example with made-up figures.
 * The form posts whether or not the preview's JavaScript has loaded.
 */
export function PlanPicker({
  bookedLastMonth,
  bookedLastYear,
  defaultTier = 'starter',
  defaultCadence = 'annual',
}: {
  /** Work signed in the last 30 days — what a monthly usage fee would be charged on. */
  bookedLastMonth: number;
  /** Work signed in the last 12 months — what an annual usage fee would be charged on. */
  bookedLastYear: number;
  defaultTier?: BillingTier;
  defaultCadence?: BillingCadence;
}) {
  const [state, formAction] = useActionState(startCheckout, initial);
  const [tier, setTier] = useState<BillingTier>(defaultTier);
  const [cadence, setCadence] = useState<BillingCadence>(defaultCadence);

  const basis = cadence === 'annual' ? bookedLastYear : bookedLastMonth;
  const charges = computeCharges(basis, tier, cadence);
  const usage = cadence === 'annual' ? charges.annualUsage : charges.monthlyUsage;

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Plan</legend>
        {TIER_ORDER.map((t) => {
          const pricing = TIER_PRICING[t];
          const checked = t === tier;
          return (
            <label
              key={t}
              className={
                checked
                  ? 'flex cursor-pointer items-start gap-3 rounded-md border border-primary bg-primary/5 p-3'
                  : 'flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50'
              }
            >
              <input
                type="radio"
                name="tier"
                value={t}
                checked={checked}
                onChange={(e) => {
                  if (isBillingTier(e.target.value)) setTier(e.target.value);
                }}
                className="mt-1"
              />
              <span className="flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{pricing.label}</span>
                  <span className="text-sm tabular-nums">
                    {formatMoney(pricing.monthlyBase)}/mo
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  Usage {formatPct(pricing.annualPct)} once a year, or{' '}
                  {formatPct(pricing.monthlyForeverPct)} every month.
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div>
        <Label htmlFor="cadence" className="mb-1.5 block">
          How the usage fee is billed
        </Label>
        <Select
          id="cadence"
          name="cadence"
          value={cadence}
          onChange={(e) => {
            if (isBillingCadence(e.target.value)) setCadence(e.target.value);
          }}
        >
          {BILLING_CADENCES.map((c) => (
            <option key={c} value={c}>
              {CADENCE_LABELS[c]}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          The usage fee is a percentage of the work you sign while subscribed — each contract and
          approved change order counted once, in the period it was signed. Once a year at the higher
          rate, or every month at the lower one for as long as you stay.
        </p>
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="font-medium">What this would cost</p>
        <p className="mt-1">
          {formatMoney(charges.monthlyBase)} a month, plus{' '}
          {cadence === 'annual' ? (
            <>
              {formatMoney(usage)} once a year on the {formatMoney(bookedLastYear)} you signed in
              the last 12 months.
            </>
          ) : (
            <>
              {formatMoney(usage)} this month on the {formatMoney(bookedLastMonth)} you signed in
              the last 30 days.
            </>
          )}
        </p>
        {basis <= 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing signed in that window yet, so the usage fee starts at zero and the base is all
            there is.
          </p>
        ) : null}
      </div>

      <FormNotice error={state.error} message={state.message} />
      <SubmitButton className="sm:w-auto sm:px-6" pendingLabel="Opening Stripe…">
        Continue to Stripe
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        Stripe takes the card on its own page. This app never sees the number.
      </p>
    </form>
  );
}
