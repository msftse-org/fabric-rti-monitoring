# Observability Migration Advisor

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Rayfin static web app, React, TypeScript, and Vite within the existing npm
workspace. This follows the repository's existing Fabric apps.

## Users

Customers evaluating migration from Datadog or Coralogix to Azure Managed
Grafana and the repository's Microsoft Fabric Eventhouse solution.

## Product Purpose

Map source capabilities to destination services and compare the customer's
observability costs using documented pricing units and explicit assumptions.
Suggest reviewed OTel Collector configurations for Fabric-only replacement or
dual-output evaluation that retains the incumbent vendor destination.

## Operating Context

The customer runs the tool from a computer with access to source and target
platforms. This first version is a manual planning tool: vendor API discovery,
resource conversion, and deployment are deliberately not implemented.

## Capabilities and Constraints

- Feature-level mappings must distinguish migration, redesign, replacement,
  and unavailable capabilities.
- Grafana alerting is not the same as on-call schedules and escalation.
- Calculator inputs are current SOURCE usage only: logs, traces and metrics
  GB/day for both vendors, plus Datadog infrastructure and APM hosts.
  Advanced source assumptions and public/quoted source rates remain editable.
  Missing Coralogix prices remain explicitly unknown, never free.
- Fabric capacity sizing cannot be inferred from ingestion volume alone.
- Plans and calculations can be exported without contacting vendor systems.
- Configuration suggestions use editable RTI targets and a dated, non-secret
  deployment inventory; the browser does not discover live cloud resources.
- Configuration and cost tools use essential-input screens followed by separate
  result screens; advanced settings remain available without crowding the default.
- The cost path automatically projects target costs from source usage; it never
  asks customers for Fabric SKUs, hours, rates, Grafana numbers or collector costs,
  including hidden advanced overrides. Restored monthly totals are view-only.
- Results prominently say Planning estimate and show lower-activity and
  continuous-query sensitivity references. These heuristics use Microsoft's
  examples, not a validated GB-to-Fabric sizing formula. Actual costs may be
  outside the range. No guaranteed savings or complete-bill claim.
- Target assumptions, limitations and line items are expandable and read-only.
  Above the supported reference range, a pilot is required, not target rate entry.
- Additive fragments retain explicitly listed existing exporters. They must be
  manually merged without replacing current receivers, processors or extensions.
- Authentication uses environment references; no configuration is applied.
- Credentials and customer telemetry must not be requested or uploaded.
- Assumption for this version: USD monthly estimates with editable source
  billing days and contract assumptions; target region and operating assumptions
  are fixed read-only planning references in the automatic model.
- Assumption for this version: a self-contained local-first app, with optional
  protected Fabric static hosting, not an already deployed customer service.

## Evidence on Hand

The repository's collectors, KQL schema, Grafana dashboards, existing Rayfin
apps, and deployment guides. Official vendor and Azure pricing references were
checked for the calculator. There is no validated customer quote or
production workload sizing.

## Product Principles

- Explain gaps before proposing automation.
- Prefer traceable formulas and explicit uncertainty to persuasive savings claims.
- Keep customer inputs local.
- Separate shipped capabilities from design options.
- Make a usable planning artifact, not a vendor compatibility promise.
- Ask only for necessary information first; let users edit inputs from results.
- Follow the existing Datadog and Coralogix apps' native interface convention:
  compact dark navigation rail, compact breadcrumb topbar, restrained content
  sections, disclaimer/status/footer, theme support and a keyboard-safe mobile
  drawer. Use product-neutral RTI branding, not vendor impersonation.
