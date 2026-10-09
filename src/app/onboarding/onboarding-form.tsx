'use client';

import { useFormState } from 'react-dom';
import { createOrganization } from '@/lib/auth/org-actions';
import { US_TIMEZONES } from '@/lib/auth/org-utils';
import type { FormState } from '@/lib/auth/actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SubmitButton, FormNotice } from '@/components/forms/form-bits';

const initialState: FormState = {};

export function OnboardingForm() {
  const [state, formAction] = useFormState(createOrganization, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormNotice error={state.error} />
      <div className="space-y-1.5">
        <Label htmlFor="name">Company name</Label>
        <Input id="name" name="name" placeholder="PT's Tactical Renovations" required autoFocus />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Time zone</Label>
        <Select id="timezone" name="timezone" defaultValue="America/New_York">
          {US_TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Sets the clock your schedule and daily logs run on. Change it later in Settings.
        </p>
      </div>
      <SubmitButton pendingLabel="Setting up…">Create organization</SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        You’ll be the administrator. You can invite your team right after.
      </p>
    </form>
  );
}
