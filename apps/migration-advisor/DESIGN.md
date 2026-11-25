---
name: RTI Migration Advisor
description: Neutral, convention-aligned local planning workspace.
colors:
  action: "#185bb4"
  action-dark: "#8cbcff"
  primary-control: "#285da3"
  primary-control-hover: "#204e8b"
  paper: "#f7f8fa"
  paper-dark: "#1c1e22"
  surface: "#ffffff"
  surface-dark: "#25282e"
  raised: "#f1f3f6"
  raised-dark: "#2d3037"
  ink: "#242830"
  ink-dark: "#eceef2"
  muted: "#5e6570"
  muted-dark: "#adb4c0"
  rule: "#d9dde3"
  rule-dark: "#3e444f"
  control: "#a5acb6"
  control-dark: "#656e7c"
  success: "#21694d"
  success-dark: "#87d7b3"
  warning-bg: "#fff6e6"
  warning-bg-dark: "#362c20"
  warning-text: "#754615"
  warning-text-dark: "#f1cd93"
  warning-rule: "#e3c798"
  warning-rule-dark: "#725b38"
  rail: "#181b20"
  rail-muted: "#b7c0ce"
  rail-rule: "#363b44"
  rail-hover: "#2b313a"
  rail-active: "#29384d"
  rail-active-text: "#acd0ff"
typography:
  headline:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.015em"
  title:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.015em"
  section:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  supporting:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "11px"
    lineHeight: 1.5
  result:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.5
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.65
rounded:
  flat: "0"
  status: "3px"
  control: "4px"
spacing:
  tight: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  section: "20px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary-control}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.primary-control-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
  nav-active:
    backgroundColor: "{colors.rail-active}"
    textColor: "{colors.rail-active-text}"
    rounded: "{rounded.flat}"
    padding: "9px 4px"
  input-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.flat}"
    padding: "24px"
  warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-text}"
    rounded: "{rounded.flat}"
    padding: "12px"
---

# Design System: RTI Migration Advisor

## Overview

**Creative North Star: "Convention-directed RTI workspace"**

This is a compact Operate interface grounded in the repository's Datadog and Coralogix native app-shell conventions, with neutral RTI identity rather than vendor impersonation. A dark labeled rail and breadcrumb header frame flat, ruled content. Blue controls signal action; typography and explicit section boundaries supply hierarchy without an ornamental visual world.

The shipped cascade is the authority: `packages/frontend/src/main.tsx` imports self-hosted fonts, then `styles.css`, then `conventions.css`. The latter overrides the former's paper/navy/oxide palette, wide sidebar and old shell geometry. Retain only still-active base typography, controls, register, inspector and guided-flow rules. `PRODUCT.md` and `direction-contract.json` pin this code-led convention; no comp or concept seed applies.

**Key Characteristics:**
- Neutral light and dark content with a constant dark RTI rail.
- Compact self-hosted Plex typography and tabular numbers.
- Flat bordered sections, small control corners and native disclosures.
- Separate guided input/result screens with explicit uncertainty.
- Local theme preference and keyboard-safe mobile navigation.

Implementation evidence: `App.tsx`, `main.tsx`, `conventions.css`, active portions of `styles.css`, `FeatureInspector.tsx`, `OtelFlow.tsx`, `OtelConfiguration.tsx` and `useFlowRoute.ts`, under `packages/frontend/src/`.

Bounded review record supplied by the finish handoff: all ten default captures at desktop light (1440×1000) and mobile dark (390×844), covering Cost inputs/results, migration map and OTel inputs/results, were screenshot-reviewed with no fixes. Paths: `.impeccable/review/conventions-{desktop,mobile}-{cost-input,cost-results,shell-map,otel-input,otel-results}.png`. Desktop dark and mobile light have functional-test coverage only, not screenshot review. The handoff reports 56 tests, 12 browser checks and TypeScript/Vite 8.3.8 passed; Doctor 92 reflects existing App complexity. These are bounded handoff facts, not a new audit or a universal accessibility certification. No new raster assets.

## Colors

Neutral application surfaces carry the workspace; blue is functional, while restrained semantic tones mark status and uncertainty. Frontmatter records the effective values, not the names' historical meanings.

### Primary
- **Action blue / dark-theme action blue:** links, unknown-price text, caret, native checked controls and focus. The implementation still calls this custom property `--oxide`; it is blue, not an oxide identity.
- **Primary control blue:** filled submit actions and selected vendor controls remain the same blue with white text in both themes. Primary hover deepens that blue.

### Neutral
- **Paper / surface / raised:** workspace background, input and ledger surfaces, and subdued header/selected-row bands; each has a dark-theme counterpart.
- **Ink / muted:** main text and supporting descriptions, each theme-resolved.
- **Rule / control:** quiet section dividers versus stronger interactive borders, each theme-resolved.
- **Rail / rail muted / rail rule / rail hover / rail active / rail active text:** constant dark navigation with a separate active-state palette. Brand text is white; drawer close text inherits the pale rail treatment.

Semantic colors are not additional brand accents: success green marks local status and feedback; warning background/text/rule form a theme-aware amber notice. Disposition badges retain their active base green/amber/rose triples and explicit dark overrides in `conventions.css`; field errors retain their light red and dark pale-red text treatments. These component-specific combinations live in the sidecar rather than expanding the core identity palette.

**The Theme Pair Rule.** Resolve content colors through the current theme; keep the rail dark and the filled primary control blue in both themes.

**The Uncertainty Stays Visible Rule.** Keep unknown pricing, planning warnings and disposition labels textual as well as colored; do not present missing prices as zero.

## Typography

**Heading and body font:** IBM Plex Sans, with `sans-serif` fallback. The actual self-hosted Fontsource imports are normal weights 400, 500 and 600; no Plex Mono, serif display face or remote font service is used.

**Code font:** the native `ui-monospace, SFMono-Regular, Consolas, monospace` stack for generated artifacts. This is code typography, not a system display face.

**Character:** one practical sans family, compact headings, sentence-case labels and tabular numerals inherited from the root. There is no separate hero/display tier or mathematical scale ratio.

### Hierarchy
- **Headline:** workspace headings; mobile reduces to 22px.
- **Title:** guided input/result headings use 19px. The inspector retains its more-specific active base rule at 22px.
- **Section:** section and artifact headings; smaller nested headings use 14px.
- **Body:** root text; the interface also uses recurring 13px help, explanatory and mode text.
- **Label:** field labels, controls and ledger rows; supporting notes use 11px, with 10px citation/formula/footer details in dense contexts.
- **Result:** planning range; mobile reduces to 20px. Ledger totals use 22px at weight 500, reducing to 21px on mobile rather than sharing the range's weight.
- **Code:** read-only artifacts with relaxed code line height, not editable monospace form inputs.

Paragraphs retain the base 74ch maximum except explicit broader utility/report contexts.

**The One Plex Voice Rule.** Use the shipped 400/500/600 Plex Sans hierarchy for interface text; reserve native monospace for code artifacts.

## Layout

The desktop shell is a 76px sticky full-height rail plus a flexible, minimum-zero workspace. The breadcrumb topbar has a 48px minimum height and 20px horizontal padding. Main content uses 24px horizontal gutters; the raised disclaimer spans those gutters. Context and footer rows wrap rather than imposing a fixed page width.

Guided flows are centered within a 900px maximum-width container. The input panel is capped at 720px with 24px padding. Field grids use two equal minimum-zero columns and a 12px gap; at a flow-container width of 560px or less, they collapse to one column. The active mobile flow override also forces single-column input fields. Submitted ledgers stack vertically; obsolete simultaneous source/target worksheet splits are not the calculator's layout.

The migration register and non-modal inspector use a separate responsive grid: a side inspector above 900px, full-width inspector before the register at 900px and below. Active inherited register widths vary at 1200px and 1600px; they do not change the 76px shell rail. Opening an inspector focuses its heading; closing returns focus to the originating row or register.

At 700px and below the rail becomes a 220px fixed drawer, not a horizontal nav or a permanently visible rail. The topbar minimum height becomes 52px, main gutters 16px, input-panel padding 18px and touch actions at least 44px. The drawer uses an explicit close button, backdrop, scroll locking, bounded Tab/Shift+Tab, Escape and inert workspace. Dismissal restores menu-trigger focus; choosing a page closes the drawer and focuses the page/flow heading.

**The Shell Before Surface Rule.** Preserve the compact rail, breadcrumb, disclaimer and local footer around every task; adapt the drawer and content grid independently.

## Elevation & Depth

Flat by default: no card or button shadows. Theme-resolved surface bands, thin rules, selected-row fills and heavier ledger/artifact top rules provide separation. The mobile drawer overlays the workspace with a half-black backdrop, not an elevated-card shadow.

Control transitions are 120ms ease-out for background and border color only when reduced motion is not requested. The inspector retains its 180ms entrance from an 8px horizontal displacement with `cubic-bezier(.16,1,.3,1)`; reduced motion removes that animation. There is no ornamental ambient motion.

**The Flat Sections Rule.** Separate content with borders, spacing and theme-resolved fills; do not introduce decorative elevation.

## Shapes

Small control corners (4px), tighter status badges (3px), and square panels, ledger sections and rail navigation. Segmented vendor controls round only the outside corners and share the internal border. Common section borders are 1px; cost ledgers, total summaries and code artifacts use a 2px ink top rule. Use real outlined SVG icons with accessible control names, not text glyph substitutes.

## Components

### Buttons

Compact and explicit. Secondary actions inherit Plex, medium weight, an 8px × 12px padding, theme surface and control border; standard minimum height is 38px, rising to 44px on mobile. Primary actions use 10px × 18px padding and a 44px minimum height, with mobile full-width flow submission. Focus is a 2px action outline offset 3px; primary focus offset is 4px. Disabled actions retain the base 0.55 opacity and unavailable cursor. Topbar icon controls are transparent, 32px minimum on desktop and 44px on mobile.

### Chips

Disposition badges are informational, not pill buttons: a textual Translate, Redesign or Specialist label, a 1px semantic border, small corners and 3px × 7px padding. Preserve their theme-specific green, amber and rose combinations and inherited 11px medium text.

### Cards / Containers

Input panels and inspector sections are flat surface fills with a thin rule. Register rows use raised fills for hover and inspection. Ledger headers and artifact headers are ruled; amounts stay right-aligned and tabular. Formula and citation text remains secondary, not hidden. Warnings are padded, square amber notices with theme-resolved text and border.

### Inputs / Fields

Theme surfaces, 4px corners, 1px control borders, 9px × 10px padding, and a standard 40px minimum height, rising to 44px on mobile. Labels sit above the field; help and associated errors sit below. Focus shifts the border to action blue and adds the keyboard outline. Native checkbox/radio controls are 17px inside larger clickable label rows. Invalid fields use the warning surface and the existing red border; errors have separate pale-red text in dark mode. Validation opens ancestor disclosures and focuses the offending input.

### Navigation

The compact rail pairs outlined SVG icons with visible labels. Desktop buttons are at least 68px high, with 10.5px labels and a blue-toned active fill/text; keyboard focus is inset inside the rail. Drawer items become left-aligned 13px icon-and-label rows at least 48px high. Breadcrumbs use 12px desktop text, a slash separator and a medium-weight current page; mobile text is 11px. The real theme toggle persists locally and defaults to OS preference. Vendor names identify source selection, not shell branding.

### Guided calculator and automatic results

Cost input is source-only: logs/traces/metrics volumes for both vendors, plus Datadog hosts/APM hosts. Editable source assumptions and rates sit in native disclosures. Do not recreate target SKU, quantity, hour or rate inputs, including hidden overrides; saved legacy monthly totals are view-only. A compact raised import panel at the top of usage input accepts local Datadog/Coralogix usage or cost exports (file picker plus a How to export disclosure with copyable key-free commands), previews detected values in a green-edged list, and applies them only on explicit Apply; it never collects credentials.

Submission produces a separate result screen with Edit inputs, a savings summary (green saving tone, neutral pending, warning-edged extra cost) with scaled today-versus-Fabric bars, then a bordered two-column split: current vendor ledger beside the visible itemized Fabric ledger, each with a series-colored composition bar and legend. The split stacks below a 720px container width. The Fabric column includes one compact sizing reference (source GB/day, capacity SKU, hours/month and region); sensitivity range details and the sizing warning live in the collapsed read-only assumptions disclosure rather than a repeated section below the comparison. Unknown source lines retain Quote needed and an Enter rate return action that opens and focuses the source field. Unsupported volumes retain pilot-required language.

This describes the hierarchy and interaction, not a sizing guideline: automatic model limitations and reference amounts are product facts owned by `PRODUCT.md` and the model. No GB-to-capacity formula, confidence interval, savings guarantee or completeness claim is canonized here.

### OTel artifacts and plan actions

The migration register uses vendor-specific capability names and a textual support
kind beneath each name, distinct from the migration-disposition badge. The inspector
shows documented scope, vendor-specific migration caveats and dated official links.
A native Capability scope disclosure explains the 27-category boundary, entitlement
distinction and unverified omissions (Coralogix notebooks). No support filter or
additional form is introduced. Vendor switches preserve hidden union-plan choices
but close an inspector whose category is omitted; counts, print and exported
mappings reflect only the active vendor (Datadog 27, Coralogix 26).

Preserve essential input then generated results, dated non-secret destination inventory, editable OTel destination/advanced overrides and validation focus. Cost's source-only restriction does not ban OTel destination fields. Generated YAML is read-only, selectable and scrollable, with Copy/Download; environment references, verification and rollout checks are disclosures. Additive merge warnings remain adjacent to the artifact. No deployment is implied.

Save/restore/import are native plan-action disclosures; export and print remain explicit local actions. Print hides shell controls and includes source inputs, planning uncertainty/read-only assumptions and submitted OTel artifacts rather than legacy target input controls.

## Do's and Don'ts

### Do:
- **Do** use the effective `conventions.css` cascade and preserve still-active base component rules.
- **Do** pair neutral RTI identity with the compact dark rail, breadcrumb header and persistent planning context.
- **Do** preserve theme-resolved surfaces, visible focus and keyboard-safe drawer behavior.
- **Do** keep guided input/result separation, source-rate return focus and read-only automatic assumptions.
- **Do** preserve OTel destination overrides, additive merge warnings and local artifact actions.

### Don't:
- **Don't** revive the obsolete paper/navy/oxide identity, wide shell, split calculator worksheet or unused target-form styles.
- **Don't** imitate vendor branding or add fake AI, account or connected-system controls.
- **Don't** present planning references as validated sizing, confidence bounds, a complete bill or guaranteed savings.
- **Don't** add decorative shadows, invented kickers, glyph icons or system display typography.
- **Don't** describe desktop dark or mobile light as screenshot-reviewed; their recorded boundary is functional testing only.

**Not canonized:** obsolete base shell/palette and split-layout declarations, unused target calculator form styles and inherited one-off hardcoded treatments (including the artifact scrollbar) are not future system tokens; automatic pricing/sizing heuristics remain product limitations, not verified design or sizing guidelines.
