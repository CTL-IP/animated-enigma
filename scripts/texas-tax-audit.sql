-- Texas tax job audit: every invoice that isn't void, and the latest estimate
-- on every project that isn't deleted — finished and closed jobs included,
-- because an audit period covers them too — as one JSON array in the shape
-- scripts/texas-tax-audit.ts reads. READ-ONLY — it selects and nothing else.
--
-- Runs as the service role (Supabase SQL editor, or the Supabase MCP's
-- execute_sql), which sees every organization; each document carries its
-- organization's name so the report can be split by tenant.
--
-- Correlations are written as explicit, aliased identifiers (l.invoice_id =
-- i.id), never bare column names: projects, properties, invoices and the line
-- tables all have their own "id" and "organization_id".

with invoice_docs as (
  select json_build_object(
    'id', i.id,
    'kind', 'invoice',
    'label', i.invoice_number || ' · ' || coalesce(p.project_number, '') || ' ' || coalesce(p.name, ''),
    'organization', o.name,
    'hasProperty', pr.id is not null,
    'propertyType', pr.property_type,
    'state', pr.address->>'state',
    'taxRatePercent', i.tax_rate,
    'lines', coalesce((
      select json_agg(
        json_build_object('description', l.description, 'taxable', l.taxable, 'amount', l.amount)
        order by l.sort_order
      )
      from invoice_line_items l
      where l.invoice_id = i.id and l.organization_id = i.organization_id
    ), '[]'::json)
  ) as doc
  from invoices i
  join organizations o on o.id = i.organization_id
  join projects p on p.id = i.project_id and p.organization_id = i.organization_id
  left join properties pr on pr.id = p.property_id and pr.organization_id = i.organization_id
  where i.status <> 'void'
),
latest_estimates as (
  select distinct on (v.project_id) v.id, v.organization_id, v.project_id, v.version_number, v.tax_rate
  from estimate_versions v
  order by v.project_id, v.version_number desc
),
estimate_docs as (
  select json_build_object(
    'id', v.id,
    'kind', 'estimate',
    'label', coalesce(p.project_number, '') || ' ' || coalesce(p.name, '') || ' · estimate v' || v.version_number,
    'organization', o.name,
    'hasProperty', pr.id is not null,
    'propertyType', pr.property_type,
    'state', pr.address->>'state',
    -- Estimates store the rate as a fraction; the audit reads percent.
    'taxRatePercent', v.tax_rate * 100,
    'lines', coalesce((
      select json_agg(
        json_build_object(
          'description', l.description,
          'taxable', l.taxable,
          'amount', l.line_cost,
          'lineType', l.line_type
        )
        order by l.sort_order, l.created_at
      )
      from estimate_line_items l
      where l.estimate_version_id = v.id and l.organization_id = v.organization_id
    ), '[]'::json)
  ) as doc
  from latest_estimates v
  join organizations o on o.id = v.organization_id
  join projects p on p.id = v.project_id and p.organization_id = v.organization_id
  left join properties pr on pr.id = p.property_id and pr.organization_id = v.organization_id
  where p.deleted_at is null
)
select coalesce(json_agg(d.doc), '[]'::json) as documents
from (
  select doc from invoice_docs
  union all
  select doc from estimate_docs
) d;
