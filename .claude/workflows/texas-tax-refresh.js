export const meta = {
  name: 'texas-tax-refresh',
  description:
    'Re-check the Texas tax ledger against the Comptroller: what still holds, what moved, what could not be verified — with the exact edits to propose',
  whenToUse:
    'Quarterly, after a Texas legislative session, or when Comptroller Tax Policy News announces a change touching src/lib/texas-tax/ledger.ts. Pass args {checkedOn: "YYYY-MM-DD"}; optional ids (array of fact ids), topic, batchSize, and repoPath when the repository is not the working directory (a scheduled session that cloned it).',
  phases: [
    { title: 'Load', detail: 'read every fact in the ledger' },
    { title: 'Check', detail: 'one agent per batch, against the Comptroller' },
    { title: 'Challenge', detail: 'try to refute every claimed change' },
    { title: 'Report', detail: 'proposed ledger edits — nothing applied' },
  ],
}

// Scripts can't read the clock (it would break resume), so the date comes in.
const checkedOn = args && args.checkedOn
if (!checkedOn || !/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) {
  throw new Error('Pass args.checkedOn as YYYY-MM-DD.')
}
const wantedIds = args && Array.isArray(args.ids) ? args.ids : null
const wantedTopic = args && typeof args.topic === 'string' ? args.topic : null
const batchSize = Math.max(1, Math.min(12, (args && args.batchSize) || 8))
// A scheduled session may have cloned the repository somewhere other than
// the working directory; every path below is relative to it.
const repo = args && typeof args.repoPath === 'string' && args.repoPath ? args.repoPath.replace(/\/?$/, '/') : ''

const SOURCE = {
  type: 'object',
  properties: { label: { type: 'string' }, url: { type: 'string' } },
  required: ['label', 'url'],
}
const FACTS = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          topic: { type: 'string' },
          status: { type: 'string' },
          statement: { type: 'string' },
          sources: { type: 'array', items: SOURCE },
          note: { type: 'string' },
        },
        required: ['id', 'topic', 'status', 'statement', 'sources'],
      },
    },
  },
  required: ['facts'],
}
const VERDICTS = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['holds', 'changed', 'contradicted', 'unverifiable'] },
          method: { type: 'string', enum: ['full-page', 'search-excerpt', 'none'] },
          evidence: { type: 'string', description: 'Verbatim text that decides it; empty if none was read.' },
          sourceUrl: { type: 'string' },
          proposedStatement: { type: 'string', description: 'Only for changed or contradicted.' },
          proposedStatus: { type: 'string', enum: ['confirmed', 'partial', 'unresolved'] },
        },
        required: ['id', 'verdict', 'method', 'evidence', 'sourceUrl'],
      },
    },
  },
  required: ['verdicts'],
}
const CHALLENGE = {
  type: 'object',
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' }, evidence: { type: 'string' } },
  required: ['refuted', 'reason'],
}

phase('Load')
const loaded = await agent(
  `Read ${repo}src/lib/texas-tax/ledger.ts and return every entry of the LEDGER array exactly as written: id, topic, status, statement, sources (label and url), and note where present. Copy; do not paraphrase, merge or add.`,
  { label: 'load-ledger', phase: 'Load', schema: FACTS, effort: 'low' },
)
let facts = (loaded && loaded.facts) || []
if (wantedIds) facts = facts.filter((f) => wantedIds.includes(f.id))
if (wantedTopic) facts = facts.filter((f) => f.topic === wantedTopic)
if (facts.length === 0) {
  log('No ledger facts matched the filter — nothing to check.')
  return { checkedOn, checked: 0 }
}

const batches = []
for (let i = 0; i < facts.length; i += batchSize) batches.push(facts.slice(i, i + batchSize))
log(`${facts.length} facts in ${batches.length} batch(es) of up to ${batchSize}.`)

function checkPrompt(batch) {
  return `Re-verify these Texas tax rules against the Texas Comptroller's own pages. For each fact, open its source URLs with WebFetch. If comptroller.texas.gov can't be reached (an egress block is common), use WebSearch restricted to comptroller.texas.gov and set method to "search-excerpt".

Verdicts:
- holds — the source still states the rule. Quote the sentence.
- changed — the source now states it differently (a rate, threshold, date or condition). Give proposedStatement and proposedStatus.
- contradicted — the source says the opposite.
- unverifiable — no text you read decides it.

Quote evidence verbatim. Never decide from memory: if you didn't read it, it is unverifiable. Return one verdict per fact id.

Facts (JSON):
${JSON.stringify(batch, null, 1)}`
}

function challengePrompt(fact, claim) {
  return `A checker says this Texas tax ledger fact has ${claim.verdict}. Try to REFUTE that: read the source yourself (WebFetch, or WebSearch on comptroller.texas.gov if blocked). Set refuted=true unless the source text you read confirms the change; quote what you read.

Ledger fact: ${JSON.stringify(fact)}
Checker's claim: ${JSON.stringify(claim)}`
}

const perBatch = await pipeline(
  batches,
  (batch, _item, i) =>
    agent(checkPrompt(batch), { label: `check-${i + 1}`, phase: 'Check', schema: VERDICTS }),
  (result, batch) => {
    const verdicts = (result && result.verdicts) || []
    // A fact the checker skipped is unverifiable — never silently dropped.
    const returned = new Set(verdicts.map((v) => v.id))
    for (const f of batch) {
      if (!returned.has(f.id)) {
        verdicts.push({ id: f.id, verdict: 'unverifiable', method: 'none', evidence: '', sourceUrl: '' })
      }
    }
    return parallel(
      verdicts.map((v) => async () => {
        if (v.verdict !== 'changed' && v.verdict !== 'contradicted') return v
        const fact = batch.find((f) => f.id === v.id)
        const c = await agent(challengePrompt(fact, v), {
          label: `challenge-${v.id}`,
          phase: 'Challenge',
          schema: CHALLENGE,
        })
        return { ...v, challenge: c, verdict: c && c.refuted === false ? v.verdict : 'disputed' }
      }),
    )
  },
)

const verdicts = perBatch.filter(Boolean).flat().filter(Boolean)
const counts = {}
for (const v of verdicts) counts[v.verdict] = (counts[v.verdict] || 0) + 1
log(`Verdicts: ${JSON.stringify(counts)}`)

phase('Report')
const report = await agent(
  `Write the Texas tax ledger refresh report for ${checkedOn} as markdown. ${
    wantedIds || wantedTopic
      ? `This run was deliberately filtered (${wantedIds ? `ids: ${wantedIds.join(', ')}` : ''}${wantedIds && wantedTopic ? '; ' : ''}${wantedTopic ? `topic: ${wantedTopic}` : ''}) — ${facts.length} fact(s) were in scope; say so rather than treating the rest as missed.`
      : `This run covered the whole ledger (${facts.length} facts).`
  } Sections:
1. Summary — counts by verdict and by method (full page vs search excerpt).
2. Edits to make — for each changed or contradicted fact that survived its challenge: the exact new statement, status, note and sources for ${repo}src/lib/texas-tax/ledger.ts, and every place in ${repo}src/ that cites the id (grep for it) and may need the same change.
3. Disputed — checker and challenger disagree; give both quotes.
4. Could not verify — why, per fact.
5. Still holds — ids only.
Do not edit any file. Mention that after edits the tests and \`pnpm texas-tax:render\` must run.

Verdicts (JSON):
${JSON.stringify(verdicts, null, 1)}`,
  { label: 'report', phase: 'Report' },
)

return { checkedOn, checked: facts.length, counts, report }
