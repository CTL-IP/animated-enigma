-- Task 34: PayPal client payments — the business's PayPal connection, and the
-- PayPal fields on an invoice.
--
-- Who may write a connection is tighter than the ordinary tenant boundary.
-- Storing a PayPal client id and secret is `org:manage` work in the app's
-- terms, and `org:manage` is held by the owner role alone (rbac.ts); its
-- database form is `has_role(organization_id, 'owner')`. Every member may
-- *see* that a connection exists — the invoice screen has to say "PayPal is
-- connected" to the office manager who sends invoices — but the ciphertext
-- column is never selected by any query that serves a screen, so seeing the
-- row reveals nothing usable.
--
-- Nothing deletes a connection. Disconnecting sets `revoked_at`; the row stays,
-- because "when was PayPal connected, and by whom" is the first question a
-- missing payment asks. There is no delete policy, so even an owner cannot.
--
-- The three PayPal columns on `invoices` are deliberately outside the freeze
-- trigger's list: they describe where the invoice is being collected, not what
-- it bills, so they stay writable after issue.

alter table paypal_connections
  add constraint paypal_connections_environment_known
  check (environment in ('sandbox', 'live'));

alter table paypal_connections
  add constraint paypal_connections_has_client_id
  check (char_length(client_id) > 0);

alter table paypal_connections
  add constraint paypal_connections_webhook_id_not_blank
  check (webhook_id is null or char_length(webhook_id) > 0);

alter table paypal_connections
  add constraint paypal_connections_revoked_after_connected
  check (revoked_at is null or revoked_at >= connected_at);

create trigger paypal_connections_set_updated_at before update on paypal_connections
  for each row execute function set_updated_at();

alter table paypal_connections enable row level security;
alter table paypal_connections force row level security;

-- Any member of the tenant may see the organization's connection row.
create policy paypal_connections_tenant on paypal_connections
  for select
  using (organization_id = current_org() and is_member_of(organization_id));

-- Only an owner may create or change it.
create policy paypal_connections_owner_insert on paypal_connections
  for insert
  with check (
    organization_id = current_org()
    and is_member_of(organization_id)
    and has_role(organization_id, 'owner')
  );

create policy paypal_connections_owner_update on paypal_connections
  for update
  using (
    organization_id = current_org()
    and is_member_of(organization_id)
    and has_role(organization_id, 'owner')
  )
  with check (
    organization_id = current_org()
    and is_member_of(organization_id)
    and has_role(organization_id, 'owner')
  );
