import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { stateFromAddress } from './job-checks';

export interface JobTaxContext {
  hasProperty: boolean;
  propertyType: string | null;
  state: string | null;
}

/**
 * The query behind `jobTaxContext`, exported so the SQL Drizzle generates can
 * be run against the real schema — the check that would have caught the
 * go-live crashes (agent log, 2026-09-25) before anyone opened a page.
 *
 * A join is safe here where it usually isn't: a project has at most one
 * property, so nothing gets multiplied. Both sides are scoped to the org.
 */
export function jobTaxContextQuery(organizationId: string, projectId: string) {
  const P = schema.projects;
  const PR = schema.properties;
  return getDb()
    .select({ propertyId: P.propertyId, propertyType: PR.propertyType, address: PR.address })
    .from(P)
    .leftJoin(PR, and(eq(PR.id, P.propertyId), eq(PR.organizationId, organizationId)))
    .where(and(eq(P.organizationId, organizationId), eq(P.id, projectId)));
}

/** What the Texas tax checks need about a job's site. Null for an unknown project. */
export async function jobTaxContext(
  organizationId: string,
  projectId: string,
): Promise<JobTaxContext | null> {
  const [row] = await jobTaxContextQuery(organizationId, projectId);
  if (!row) return null;
  return {
    // A property id pointing at nothing visible is no property at all.
    hasProperty: row.propertyId !== null && row.address !== null,
    propertyType: row.propertyType ?? null,
    state: stateFromAddress(row.address),
  };
}
