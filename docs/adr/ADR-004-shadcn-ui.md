# ADR-004: shadcn/ui Component Library

## Status: Accepted

## Context

The application needs a UI component library for forms, dialogs, navigation, and data display. Options considered:

1. **Headless UI (Radix UI primitives only)** — Maximum flexibility, but requires building all styling from scratch. High effort for consistent results.
2. **Chakra UI / MUI** — Pre-styled, but opinionated CSS-in-JS approach conflicts with Tailwind CSS and adds significant bundle weight.
3. **DaisyUI** — Tailwind plugin. Simpler, but less composable and lacks the accessibility primitives of Radix UI.
4. **shadcn/ui** — Not a dependency, but a code generator. Copies accessible Radix UI primitives into `src/components/ui/` with Tailwind-based styling. Full ownership of the component code. Works natively with Tailwind CSS.

## Decision

Use **shadcn/ui** with the New York style and zinc base color.

Components installed in Phase 1 (under `src/components/ui/`):
- `button.tsx` — Primary interactive element
- `card.tsx` — Card, CardHeader, CardContent, CardTitle, CardDescription
- `input.tsx` — Text input field
- `dialog.tsx` — Modal dialog
- `dropdown-menu.tsx` — Nav auth dropdown (Profile, Sign Out, etc.)
- `badge.tsx` — Status labels
- `tabs.tsx` — Tabbed content sections
- `table.tsx` — Data tables
- `sheet.tsx` — Slide-out panel (used for mobile nav)
- `skeleton.tsx` — Loading placeholder
- `sonner.tsx` — Toast notifications (uses `sonner` + `next-themes`)

Configuration file: `components.json` at the project root.

**Version note:** The CLI installed shadcn/ui v2, which uses `@base-ui/react/button` for the Button component instead of the Radix-based button used in earlier versions. The `Button` component uses a `render` prop instead of `asChild`. The `Toaster` is provided by `sonner` rather than the older hook-based `@radix-ui/react-toast`. All component usages in Phase 1 have been adapted to v2 APIs.

## Consequences

**Enables:**
- Components are owned by the project — can be modified freely without forking a library.
- Accessibility is handled by Radix UI primitives underneath.
- Tailwind class merging via `cn()` (from `src/lib/utils.ts`) keeps component variants consistent.
- New components can be added with `npx shadcn@latest add <component>` at any phase.

**Makes harder:**
- Upgrading shadcn/ui means manually diffing generated component code — there is no `npm update` for copied files.
- The `asChild` pattern from older shadcn/ui documentation no longer applies to `Button` in v2; developers must use the `render` prop instead.
- Adding non-shadcn custom components requires maintaining the same Tailwind variable naming conventions (`bg-background`, `text-foreground`, etc.) to stay consistent with the generated components.
