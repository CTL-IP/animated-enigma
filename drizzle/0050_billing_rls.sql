-- Platform billing: what an organization pays to run Tactical Foreman itself.
--
-- One thing the database owns here: `updated_at` on every write, the same as
-- everywhere else — useful on this table in particular since "when did the
-- tier last change" is the first question a billing dispute asks.
--
-- RLS is the ordinary tenant boundary, nothing tighter. Unlike `time_entries`,
-- who the subscription belongs to isn't a question — it's the whole org's
-- bill, not one person's — so there's no person-scoping to add on top. Which
-- roles may *change* it (org:manage) is an app-layer permission, the same way
-- `financials:read` and `costs:read` are: RLS proves the tenant can't see
-- another tenant's bill, not which of its own members may edit it.

create trigger organization_subscriptions_set_updated_at before update on organization_subscriptions
  for each row execute function set_updated_at();

alter table organization_subscriptions enable row level security;
alter table organization_subscriptions force row level security;

create policy organization_subscriptions_tenant on organization_subscriptions
  using (organization_id = current_org() and is_member_of(organization_id))
  with check (organization_id = current_org() and is_member_of(organization_id));
