/**
 * An estimate line has to be able to go untaxed from the screen. Unticking
 * Taxable used to save `true`, and a line added by hand was always taxed —
 * labor included, which is the mistake the Texas tax check warns about on a
 * home job.
 *
 * Each case renders the real builder, does what a person would, then reads the
 * form the way the actions do — `Object.fromEntries(formData)` through the same
 * schema — so it checks the value `updateLine` / `addLine` would write. The
 * actions' database writes are not exercised here.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { EstimateBuilder } from '@/app/(app)/projects/[id]/estimate/estimate-builder';
import type { EstimateLineRow } from './queries';
import { lineSchema, updateLineSchema } from './schema';

// What the forms post is under test, not where. The app's React 19 takes a
// server action as a form's action; React 18, which renders these tests, only
// takes a string there, so the stubs are strings.
vi.mock('@/lib/estimates/actions', () => ({
  addCatalogLine: 'addCatalogLine',
  addLine: 'addLine',
  updateLine: 'updateLine',
  deleteLine: 'deleteLine',
}));

afterEach(cleanup);

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

function line(overrides: Partial<EstimateLineRow> = {}): EstimateLineRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    description: 'Frame closet wall',
    category: null,
    lineType: 'labor',
    quantity: '8',
    unit: 'hour',
    unitCost: '65',
    wasteFactorPct: '0',
    taxable: false,
    lineCost: '520',
    sortOrder: 0,
    catalogItemId: null,
    ...overrides,
  };
}

function renderBuilder(lines: EstimateLineRow[] = []) {
  render(
    <EstimateBuilder
      projectId={PROJECT_ID}
      versionId={VERSION_ID}
      lines={lines}
      catalog={[]}
      editable
    />,
  );
}

function fields(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form));
}

/** What `updateLine` would save from the edit form. */
function savedEdit(form: HTMLFormElement) {
  return updateLineSchema.parse(fields(form));
}

/** What `addLine` would save from the add-line form. */
function savedAdd(form: HTMLFormElement) {
  return lineSchema.parse(fields(form));
}

function openEditor(): HTMLFormElement {
  fireEvent.click(screen.getByRole('button', { name: 'Edit line' }));
  return screen.getByRole('button', { name: 'Save' }).closest('form')!;
}

function addForm(): HTMLFormElement {
  return screen.getByText('Add a line').closest('form')!;
}

function taxableBox(form: HTMLFormElement): HTMLInputElement {
  return within(form).getByRole('checkbox', { name: 'Taxable' });
}

function describeLine(form: HTMLFormElement, text: string) {
  fireEvent.change(within(form).getByPlaceholderText('Description'), {
    target: { value: text },
  });
}

function pickType(form: HTMLFormElement, type: string) {
  fireEvent.change(within(form).getByLabelText('Type'), { target: { value: type } });
}

describe('editing a line', () => {
  it('saves false when Taxable is unticked', () => {
    renderBuilder([line({ lineType: 'material', description: 'Drywall, 1/2 in', taxable: true })]);
    const form = openEditor();
    expect(taxableBox(form)).toBeChecked();

    fireEvent.click(taxableBox(form));

    expect(savedEdit(form).taxable).toBe(false);
    expect(taxableBox(form)).not.toBeChecked();
  });

  it('saves true when Taxable is ticked', () => {
    renderBuilder([line({ taxable: false })]);
    const form = openEditor();
    expect(taxableBox(form)).not.toBeChecked();

    fireEvent.click(taxableBox(form));

    expect(savedEdit(form).taxable).toBe(true);
    expect(taxableBox(form)).toBeChecked();
  });

  it('keeps an untaxed labor line untaxed when only the quantity changes', () => {
    renderBuilder([line({ lineType: 'labor', taxable: false })]);
    const form = openEditor();

    fireEvent.change(form.querySelector('input[name="quantity"]')!, { target: { value: '10' } });

    const saved = savedEdit(form);
    expect(saved.quantity).toBe(10);
    expect(saved.lineType).toBe('labor');
    expect(saved.taxable).toBe(false);
  });

  it('leaves the box alone when the type changes — the line keeps what was saved', () => {
    renderBuilder([
      line({ lineType: 'material', description: 'Owner-supplied vanity', taxable: false }),
    ]);
    const form = openEditor();

    fireEvent.change(form.querySelector('select[name="lineType"]')!, {
      target: { value: 'equipment' },
    });

    expect(savedEdit(form)).toMatchObject({ lineType: 'equipment', taxable: false });
    expect(taxableBox(form)).not.toBeChecked();
  });

  it('keeps a taxed line taxed when only the cost changes', () => {
    renderBuilder([line({ lineType: 'material', description: 'Drywall, 1/2 in', taxable: true })]);
    const form = openEditor();

    fireEvent.change(form.querySelector('input[name="unitCost"]')!, { target: { value: '14.5' } });

    const saved = savedEdit(form);
    expect(saved.unitCost).toBe(14.5);
    expect(saved.taxable).toBe(true);
  });
});

describe('adding a line by hand', () => {
  it('starts a labor line untaxed', () => {
    renderBuilder();
    const form = addForm();
    describeLine(form, 'Hang and finish drywall');

    pickType(form, 'labor');

    expect(savedAdd(form)).toMatchObject({ lineType: 'labor', taxable: false });
    expect(taxableBox(form)).not.toBeChecked();
  });

  it('starts material and equipment lines taxed', () => {
    renderBuilder();
    const form = addForm();
    describeLine(form, 'Drywall, 1/2 in');
    expect(savedAdd(form)).toMatchObject({ lineType: 'material', taxable: true });
    expect(taxableBox(form)).toBeChecked();

    pickType(form, 'equipment');
    expect(savedAdd(form)).toMatchObject({ lineType: 'equipment', taxable: true });
  });

  it('starts subcontractor, allowance and other lines taxed, for the tax check to ask about', () => {
    renderBuilder();
    const form = addForm();
    describeLine(form, 'Electrical sub');

    for (const type of ['subcontractor', 'allowance', 'other']) {
      pickType(form, type);
      expect(savedAdd(form)).toMatchObject({ lineType: type, taxable: true });
      expect(taxableBox(form)).toBeChecked();
    }
  });

  it('follows the type until the box is touched, then keeps what the person chose', () => {
    renderBuilder();
    const form = addForm();
    describeLine(form, 'Tile setter');

    pickType(form, 'labor');
    expect(taxableBox(form)).not.toBeChecked();
    pickType(form, 'material');
    expect(taxableBox(form)).toBeChecked();

    // A labor line on a commercial job is taxed; the person says so.
    pickType(form, 'labor');
    fireEvent.click(taxableBox(form));
    pickType(form, 'material');
    pickType(form, 'labor');

    expect(savedAdd(form)).toMatchObject({ lineType: 'labor', taxable: true });
    expect(taxableBox(form)).toBeChecked();
  });

  it('can untick a material line', () => {
    renderBuilder();
    const form = addForm();
    describeLine(form, 'Owner-supplied fixtures');

    fireEvent.click(taxableBox(form));

    expect(savedAdd(form)).toMatchObject({ lineType: 'material', taxable: false });
  });

  // After an add, React resets the form's fields to their defaults with a
  // native form.reset() — it does not re-render, and its own event handlers
  // are off at that moment. The box has to land back in step with the type.
  it('is back to a taxed material line after the form resets', () => {
    renderBuilder();
    const form = addForm();
    describeLine(form, 'Demo tub surround');
    pickType(form, 'labor');
    expect(taxableBox(form)).not.toBeChecked();

    fireEvent.submit(form);
    form.reset();

    expect(taxableBox(form)).toBeChecked();
    expect(fields(form)).toMatchObject({ lineType: 'material', taxable: 'true' });
  });

  it('follows the type again after a reset, even if the last line’s box was set by hand', () => {
    renderBuilder();
    const form = addForm();
    describeLine(form, 'Frame soffit');
    pickType(form, 'labor');
    fireEvent.click(taxableBox(form));

    fireEvent.submit(form);
    form.reset();
    describeLine(form, 'Frame soffit, second side');
    pickType(form, 'labor');

    expect(savedAdd(form)).toMatchObject({ lineType: 'labor', taxable: false });
    expect(taxableBox(form)).not.toBeChecked();
  });
});

describe('the line schemas', () => {
  const edit = {
    lineId: '33333333-3333-4333-8333-333333333333',
    description: 'Frame closet wall',
    lineType: 'labor',
    quantity: '8',
    unit: 'hour',
    unitCost: '65',
    wasteFactorPct: '0',
  };
  const add = { estimateVersionId: VERSION_ID, description: 'Frame closet wall' };

  it('read the two values the forms send', () => {
    expect(updateLineSchema.parse({ ...edit, taxable: 'false' }).taxable).toBe(false);
    expect(updateLineSchema.parse({ ...edit, taxable: 'true' }).taxable).toBe(true);
    expect(lineSchema.parse({ ...add, taxable: 'false' }).taxable).toBe(false);
    expect(lineSchema.parse({ ...add, taxable: 'true' }).taxable).toBe(true);
  });

  it('refuse a line that doesn’t say, rather than guessing taxed', () => {
    expect(updateLineSchema.safeParse(edit).success).toBe(false);
    expect(updateLineSchema.safeParse({ ...edit, taxable: '' }).success).toBe(false);
    expect(lineSchema.safeParse(add).success).toBe(false);
    expect(lineSchema.safeParse({ ...add, taxable: 'on' }).success).toBe(false);
  });
});
