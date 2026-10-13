# Marketing Module — PRD Addendum

| | |
|---|---|
| **Product** | PT's Tactical Foreman |
| **Document** | Addendum to `docs/PRD.md` |
| **Version** | 0.1 |
| **Date** | 2026-10-13 |
| **Status** | Draft — pending owner approval. Nothing here is built. |

---

## 1. Decision

The job-photo marketing pipeline and the Foreman become one system, in stages.
The Foreman is the system of record for job photos, video, leads, and client
consent. Marketing reads cleared photos from it and writes leads back into it.

**Why not merge everything at once.** The marketing pipeline runs on Google tools;
the Foreman runs on Vercel and Supabase, and the settled decision of 2026-09-09
keeps it that way (Supabase Storage stays, Drive is not adopted). Rebuilding the
pipeline inside the Foreman in one step would stop marketing while it is rebuilt,
and storage uploads are still unverified end to end (CLAUDE.md, open item 5).

**Why not keep them separate.** Every job photo would be uploaded twice — once to
a project, once to the marketing intake — and the two copies drift. Worse, a lead
that came from a post can't be tied to the job it became, so nobody can say which
posts make money.

## 2. Goals

- **One upload.** A photo or video taken on a job goes into the Foreman once and
  is available to marketing from there.
- **Every public post is traceable** to a cleared photo, a consenting client, and
  the person who approved it.
- **Every lead from social media carries the post or campaign it came from**, so
  closed revenue can be attributed to marketing.
- **Fewer tools.** Duplicate marketing apps are retired once their jobs live here.

## 3. Non-goals

- **Autonomous posting.** PRD §10: AI never auto-publishes. That holds here (§6).
- Ad buying, budgets, or bidding.
- A home-built social scheduler. Publishing goes through a provider behind a
  seam (§4, phase 3).
- Marketing analytics beyond lead and revenue attribution.

## 4. Phases

### Phase 1 — Connect (no new screens)

Prerequisite: a real file pushed through storage upload end to end (open item 5).

- **Marketing clearance on photos, separate from `clientVisible`.**
  `clientVisible` means the client may see a photo in their own portal. Posting
  it publicly is a different permission with a different risk — house numbers,
  faces, the inside of someone's home. One flag cannot mean both.
- **Client marketing consent.** Per client (or per project): whether their job may
  be used in marketing, when consent was given, how (a clause in signed terms, a
  release form, or a verbal yes recorded by a named person), and when it was
  withdrawn. No consent, no clearable photos from that job.
- **Read-only export for the existing pipeline.** The Google-side pipeline pulls
  cleared photos through an authenticated, read-only export behind a seam — not
  by hand-copying files. Signed URLs are short-lived by design (`withUrls` in
  `src/lib/media/queries.ts`), so each export run gets fresh links.
- **Lead attribution.** A lead records the campaign or post it came from,
  alongside its existing source.
- **A marketing permission set.** Read cleared media, mark candidates, manage
  campaign drafts. Never `costs:read` or `financials:read`.

### Phase 2 — Review queue in the Foreman

- A marketing review view under **Documents** (no new navigation section):
  candidate photos, clearance, captions.
- AI drafts captions and groups photos into campaign drafts — before, progress,
  and after sequences from one job. Drafts only, labeled as AI, with the original
  output kept (PRD §10).
- A named person approves each post. The approval is audit-logged.

### Phase 3 — Publish and measure

- Approved posts go to a social provider through `src/lib/<provider>/`, shaped
  like `google/`: a pure core plus one module that owns the vendor call. The
  app is the source of truth; the provider holds a copy.
- Dashboard: leads and closed revenue by campaign.
- Duplicate marketing tools are retired once their functions are covered here.

## 5. Navigation

CLAUDE.md fixes navigation at twelve sections. Phases 1 and 2 add none: the review
queue is a view under Documents, and attribution shows in Leads and the Dashboard.
A thirteenth **Marketing** section is the owner's decision (§9).

## 6. Rules

- **Nothing is posted without a named person's approval.** AI drafts; a person
  publishes. Approving is a human act and is logged.
- **Only cleared photos from consenting clients can enter a campaign.** Checked at
  the query, server-side — not hidden in the screen.
- **Withdrawn consent** unclears every photo from that client and cancels anything
  scheduled. Posts already published are listed for removal by hand: the app
  cannot promise a platform deleted something.
- **Before a photo is cleared**, a person checks the frame for house numbers,
  street signs, license plates, faces, personal belongings, and paperwork. AI may
  flag these; a person decides.
- **The marketing permission set never sees** costs, margins, or invoice amounts.
- **Clearance, consent, approval, and publishing events** go in the audit log.
- **Cleared and published media are soft-deleted**, never hard-deleted: they are
  evidence of what was published and on whose consent.

## 7. Data (for the schema task to design)

Domains, not columns:

- Photo and video marketing clearance — state, who, when
- Client marketing consent — scope, how given, when, withdrawn
- Campaigns and campaign items — media references, caption draft and original AI
  output, approval state, publish state
- Lead-to-campaign attribution
- Publish records — provider, external post id, status

Every table is organization-scoped with RLS **enabled and forced**, per CLAUDE.md.

## 8. Acceptance criteria

1. A photo uploaded once to a project is available to marketing with no second
   upload.
2. A photo from a project without client consent cannot be cleared — enforced
   server-side and tested.
3. The marketing permission set cannot read costs, margins, or invoice amounts —
   tested.
4. No code path publishes without a recorded human approval — tested.
5. A lead created from a post carries its campaign, and the dashboard's leads and
   closed revenue per campaign reconcile with the underlying records.
6. Withdrawing consent unclears that client's media and cancels scheduled posts.

## 9. Open decisions for the owner

1. Approve the staged plan — connect, review queue, publish — or change the order.
2. **Consent method:** a clause in the proposal and contract terms (which would go
   to the attorney review already pending), a separate release form, or both.
3. **Who may approve a post:** the owner only, or the marketing role as well.
4. **Navigation:** a thirteenth Marketing section after phase 2, or keep it under
   Documents.
5. **Publishing provider** for phase 3.
6. **Video and storage.** The Supabase project is on the free tier; video fills
   storage quickly. Set size limits or a plan before video comes in.
