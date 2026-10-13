export const meta = {
  name: 'texas-tax-job-audit',
  description:
    "Sweep the Foreman's live invoices and estimates for Texas tax mistakes with the app's own checks, then write a prioritized fix list",
  whenToUse:
    'Before filing a sales tax return, before or during a Comptroller audit, or after changing how jobs are priced. Pass args {projectRef} — the Supabase project to read; optional organization.',
  phases: [
    { title: 'Pull', detail: 'read-only SQL, then the app’s checks over every document' },
    { title: 'Brief', detail: 'what to fix first, in plain words' },
  ],
}

// No default: a production database is never the thing a script reaches for
// when nobody named one, and this repository is public.
const projectRef = args && typeof args.projectRef === 'string' ? args.projectRef.trim() : ''
if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  throw new Error('Pass args.projectRef: the 20-character Supabase project ref of the database to audit.')
}
const organization = (args && args.organization) || null

const CHECK = {
  type: 'object',
  properties: { id: { type: 'string' }, level: { type: 'string' }, title: { type: 'string' } },
  required: ['id', 'level', 'title'],
}
const AUDIT = {
  type: 'object',
  properties: {
    databaseStatus: { type: 'string', description: 'Status reported by get_project.' },
    stoppedBecause: { type: 'string', description: 'Set when the audit could not run; empty otherwise.' },
    documents: { type: 'number' },
    flagged: { type: 'number' },
    warnings: { type: 'number' },
    rejectedRows: { type: 'number' },
    byCheck: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, count: { type: 'number' } }, required: ['id', 'count'] } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          kind: { type: 'string' },
          organization: { type: 'string' },
          worst: { type: 'string' },
          checks: { type: 'array', items: CHECK },
        },
        required: ['label', 'kind', 'worst', 'checks'],
      },
    },
  },
  required: ['databaseStatus', 'stoppedBecause'],
}

phase('Pull')
const audit = await agent(
  `Run the Texas tax job audit against the Foreman's live database. Read-only throughout.

1. Load the Supabase MCP tools with ToolSearch. Call get_project for project ref ${projectRef}. If it isn't healthy (for example INACTIVE — the free tier pauses), stop: return databaseStatus and stoppedBecause, and do NOT restore or change the project.
2. Run the contents of scripts/texas-tax-audit.sql from this repository with execute_sql, exactly as written. It only selects; if anything about it would write, stop instead.
3. Save the returned documents JSON to a file in your scratchpad and run \`pnpm -s texas-tax:audit <that file>\` in this repository. That applies the same checks the estimate and invoice screens show.
4. Return the audit: counts, byCheck as {id, count} pairs, and every finding with its checks (id, level, title).${organization ? ` Keep only documents whose organization is "${organization}".` : ''}

This repository is public: write nothing from the results into it, its PRs or its agent log.`,
  { label: 'pull-and-check', phase: 'Pull', schema: AUDIT },
)

if (!audit || audit.stoppedBecause) {
  log(`Audit did not run: ${audit ? audit.stoppedBecause : 'the pull agent returned nothing'}`)
  return { ran: false, databaseStatus: audit ? audit.databaseStatus : null, stoppedBecause: audit ? audit.stoppedBecause : 'no result' }
}
log(`${audit.documents} documents checked; ${audit.flagged} flagged, ${audit.warnings} with warnings.`)

phase('Brief')
const brief = await agent(
  `Write a short, plain-language fix list for a contractor from this Texas tax audit of their jobs. Lead with warnings — commercial jobs carrying no tax (an auditor collects it from the contractor), home jobs taxing labor (the client paid tax nobody owed), rates no Texas address has — naming each job. Then the information items: how many home jobs carried no tax (materials tax is owed by the contractor on those: paid at purchase, or reported as taxable purchases if bought tax-free), untaxed debris haul-off charges, and data gaps (no property, no state, no property type) that stop the checks from running. End with "This week": at most five concrete actions. Cite publications by number (94-116, 94-157). Research material, not tax advice. Don't write the result into any file.

Audit (JSON):
${JSON.stringify(audit, null, 1)}`,
  { label: 'brief', phase: 'Brief' },
)

return {
  ran: true,
  documents: audit.documents,
  flagged: audit.flagged,
  warnings: audit.warnings,
  byCheck: audit.byCheck,
  brief,
}
