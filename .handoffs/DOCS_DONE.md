# DOCS_DONE.md — Phase 6: Polish & Deploy
**Docs Agent Output**
**Date:** 2026-04-09
**Phase:** 6 — Polish & Deploy
**Overall result: PASS**

---

## Files Updated

| File | Change |
|---|---|
| `README.md` | Added Phase 6 to "What's Been Built" section (13-bullet summary of all Phase 6 deliverables); updated homepage project-structure comment from placeholder text to actual description; updated `privacy/page.tsx` and `terms/page.tsx` comments from "Placeholder (Phase 6)" to substantive descriptions; added `sitemap.ts` and `robots.ts` to project structure; added `scripts/verify-rls.ts` entry; updated vercel.json comment to mention security headers; updated `library/` components comment to include `filter-sheet-trigger`; added `runbook-rls-audit.md` and `pre-launch-checklist.md` to Key Documentation |

---

## Files Reviewed (no changes required)

| File | Finding |
|---|---|
| `docs/runbooks/runbook-rls-audit.md` | Complete and accurate. Prerequisites, run command, output categories (OK/DANGER/WARNING/NOT FOUND), corrective SQL, and table list all match `scripts/verify-rls.ts` exactly. |
| `docs/runbooks/pre-launch-checklist.md` | Complete. 10 sections, 60+ checklist items covering all Phase 6 surfaces. Admin section correctly includes mobile hamburger check (Phase 6 addition). |
| `.env.local.example` | No changes needed. Phase 6 introduced no new environment variables. |
| `.agents/docs/CLAUDE.md` | No changes needed. Agent instructions are phase-agnostic. |

---

## ADRs Created

None. Phase 6 introduces no new architectural decisions:
- ISR revalidation: existing pattern (used on `/library`, `/free/[slug]`, `/sweepstakes`, `/marketplace` since Phase 2/4B)
- next/image: Next.js built-in — no decision record warranted
- Security headers via `vercel.json`: deployment-level configuration, not a code architecture decision
- Sheet for mobile navigation: `shadcn/ui` component already in use (`mobile-nav.tsx`)

ADR creation skipped — per agent rules, skipping is valid when no new architectural pattern is introduced.

---

## Documentation Debt Flagged

1. **OG banner**: `public/og-banner.png` is a programmatically generated solid-color placeholder. Before launch, this should be replaced with a production-quality branded image. The SVG at `public/og-banner.svg` can be used as a reference. No runbook needed — this is a design asset task (external).

2. **Privacy and Terms legal review**: Both `/privacy` and `/terms` pages contain placeholder content with explicit E14 external-task notices. No documentation update needed — the pages correctly call out that legal review is required before launch.

3. **`next.config.ts` remotePatterns**: Avatar and user-uploaded images from Supabase Storage use `<Image unoptimized>` because no `remotePatterns` are configured. If image optimization for user avatars is desired, an ADR and `next.config.ts` update would be warranted. Out of scope for this cycle.
