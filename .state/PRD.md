# PRD — Phase 5: Marketplace Shell

## Phase Goal
Build the individual service detail pages with "Coming Soon" overlays, wire entry badges on service cards, and add an admin service approval workflow. The marketplace itself is already built (Phase 2) — this phase completes the service browsing shell before the marketplace goes live.

## Requirements

### R1 — Service Detail Page
- `/marketplace/[slug]` (public, ISR revalidate 60)
- Fetch service by slug. If `deleted_at IS NOT NULL`: 404. If `is_coming_soon=true` (all services at launch): render with Coming Soon overlay.
- Page content (behind the overlay or visible):
  - Service title, description, long_description (rendered markdown)
  - Provider info (display_name from profiles join, if provider_id set)
  - Rate display:
    - If rate_type='custom' OR rate_cents IS NULL: show rate_label OR "Contact for pricing"
    - Else: show formatted rate_cents + "/" + rate_type (e.g., "$150/hr", "$2,500 fixed")
    - rate_label overrides all display if set
  - Category and tags
  - "Coming Soon" badge / overlay on entire page
  - Entry badge (if service has custom_entry_amount): same EntryBadge component
  - CTA button: disabled "Coming Soon — Join the waitlist" → triggers inline LeadCaptureForm (source='marketplace_coming_soon')
- If service status='pending' or 'suspended': 404 for public users (only active/approved visible)

### R2 — Service Entry Badge on Marketplace Cards
- Update `/marketplace` page (already built in Phase 2): add EntryBadge to service cards where custom_entry_amount is set
- On service cards: show entry badge text beneath service title/rate if custom_entry_amount > 0

### R3 — Admin Service Approval Workflow
- Update admin service edit form (`/admin/services/[id]/edit`):
  - Status field: dropdown with options pending / approved / active / suspended
  - Current status displayed with color badge
  - is_coming_soon toggle: default true, admin can set false when marketplace launches
- Update admin services list (`/admin/services`):
  - Show status badge on each row
  - Filter: "All", "Pending approval", "Active"
  - "Approve" quick-action button on pending services (sets status='approved')
- Server Action update: `updateService` already exists — extend to handle status transitions
- No email notifications for status changes (post-launch feature)

## Acceptance Criteria
1. `/marketplace/[slug]` renders for services with status='active' or 'approved'
2. `/marketplace/[slug]` returns 404 for status='pending', 'suspended', or deleted services
3. Service detail shows correct rate display: custom rate_type shows rate_label or "Contact for pricing"; hourly/fixed/monthly shows formatted rate
4. "Coming Soon" badge/overlay renders on all services (is_coming_soon=true for all at launch)
5. Entry badge renders on service detail and marketplace cards when custom_entry_amount is set
6. LeadCaptureForm wired to "Join the waitlist" CTA on service detail
7. Admin services list shows status badge on each row
8. Admin can filter services by status (All / Pending / Active)
9. Admin can approve a service from the list (quick-action button)
10. Admin service edit form has status dropdown and is_coming_soon toggle
11. `npm run build` passes with no errors
12. `npx tsc --noEmit` passes with 0 errors

## Out of Scope for Phase 5
- Full marketplace purchase flow (post-launch, when marketplace goes live)
- Service provider registration/portal
- Service booking/inquiry form (post-launch)
- Homepage hero content (Phase 6)
