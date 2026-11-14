# Image generation prompts

The optional buffered figure uses `official/buffered-reference-sheet.png`.

## Buffered architecture: initial composition

```text
Use case: infographic-diagram
Asset type: third architecture figure in a public Azure and Fabric technical sample, wide 16:9 high resolution.
Create a precise clean white-background architecture diagram titled "Buffered ingestion: Event Hubs + Eventstream". Subtitle "Architecture extension / Event Hubs Bicep foundation included".
Use a polished navy, azure and teal technical style. Use the supplied sheet of OFFICIAL product assets as exact visual references, preserving shape, orientation, aspect ratio and color. Keep the complete gray-frame Fabric item icons. Do not invent replacement product logos.
Main left-to-right flow in FIVE columns:
1. "Azure Container Apps", official Container Apps icon. Two stacked cards: "Finite synthetic job" with small chips "gateway", "checkout", "payment", "postgres"; then "OpenTelemetry Collector" with official OpenTelemetry icon. Arrow from job to collector labeled "OTLP".
2. "Azure Event Hubs", official Event Hubs icon. Caption "Buffer + retention window". A small badge "Bicep foundation". Arrow from Collector to Event Hubs labeled "Kafka / TLS" then small label "OTLP JSON".
3. "Fabric Eventstream", official Eventstream item icon. Caption "Ingest + enrich". Arrow from Event Hubs to Eventstream labeled "Consumer group".
4. "Eventhouse / KQL", official Fabric Eventhouse item icon and small Fabric logo. Inside vertical stack: cylinder "Raw OTLP JSON", down arrow "Update policies", row "Typed signals + exemplars", down arrow, box "Dedup + materialized views".
5. "Investigation", two stacked small cards with matching official assets: "Azure Managed Grafana" and "Fabric RTI dashboard". Arrow from column4 to5 labeled "KQL".
Below Event Hubs and Eventstream show a compact identity rail: official Managed identity icon then "Collector: Data Sender" pointing toward Event Hubs; another official identity icon then "Workspace: Data Receiver" pointing from Eventstream toward Event Hubs. Distinguish these dotted identity lines from solid telemetry arrows.
Across the bottom a full-width subtle panel titled "Integration contract" with three short items:
"Run ID + Trace ID + Span ID"
"Transactional projections"
"Replay requires deduplication".
Very bottom footnote EXACT: "The broker foundation is implemented. The full buffered integration is an extension."
Constraints: This is a reference design, not a deployed-system screenshot. Only product and generic resource names. No private names, resource IDs, region names, measured throughput, fixed pricing or production claims. All main data arrows unambiguous left to right. Keep labels legible and avoid crowding. Do not imply exemplars are already supported by the direct-export baseline.
```

## Buffered architecture: connector precision

```text
Use case: infographic-diagram
Asset type: technical correction of existing optional buffered architecture diagram.
Edit the supplied diagram with ONLY the following connector corrections. Preserve every word, every official icon, all colors and all boxes.
1. Move the Kafka/TLS connector so it starts at the RIGHT EDGE of the OpenTelemetry Collector card (lower half of the left column), ends at the LEFT EDGE of the Azure Event Hubs column, and has a single arrowhead at Event Hubs. It must not start at the job or OTLP line. Keep Kafka/TLS and OTLP JSON labels beside this connector.
2. The arrow leaving Fabric Eventstream must terminate at the LEFT EDGE of the Raw OTLP JSON card in Eventhouse, not at the Typed signals card. Use an elbow line going up in the gap before the Eventhouse column, then right into Raw OTLP JSON. Do not cross any label. A single arrowhead ends at Raw OTLP JSON.
3. The KQL connector to Investigation must visibly start at the RIGHT EDGE of "Dedup + materialized views", take an elbow route outside the Eventhouse column, and terminate at the LEFT EDGE of the Investigation column. The route can rise to the midpoint of that column. It must not appear to originate from the incoming Eventstream line.
4. Keep the separate arrow from Event Hubs to Fabric Eventstream.
5. Fix identity lines: remove the dashed line directly connecting the two managed identity icons. Draw one dotted arrow from "Collector: Data Sender" to the BOTTOM LEFT portion of Event Hubs. Draw a separate dotted arrow from "Workspace: Data Receiver" that travels left beneath the columns then up to the BOTTOM RIGHT portion of Event Hubs. There must be NO identity arrow targeting the Eventstream box and no shared-identity link between the icons.
All labels and official product logo assets remain exact, without distortion, crop, rotation or color changes. Preserve the subtitle and the bottom footnote explaining that only the broker foundation is implemented.
```

## Architecture with consumption options (current `architecture-azure.png`)

Generated with the GitHub Copilot CLI image generation tool (gpt-image) in one
composition pass. Image1 is the previous `architecture-azure.png` (the AKS revision
below), Image2 is `official/aks-reference-sheet.png`, and Image3 is
`official/consume-reference-sheet.png`. All text was correct in that render. One
deterministic post-processing step followed: the render drew placeholder glyphs instead
of four official icons (an fx glyph for KQL queryset, a page for Notebooks, a robot for
Operations agent, and the Fabric logo for Data agent). Each glyph region was filled
with the surrounding tile background, interpolated per row, and the unmodified official
SVG (`kql_queryset_64_item`, `notebook_64_item`, `operations_agent_64_item`,
`data_agent_64_item`) was rasterized and pasted at the same center with its aspect ratio
preserved. No other pixels were changed. Activator, Fabric apps, and Agent Skills use
neutral glyphs because no official icon is used for them.

```text
Use case: infographic-diagram
Asset type: public GitHub README architecture diagram, wide landscape, high resolution, revision that adds the consumption side.

Image1 is the CURRENT diagram. Keep its visual style exactly: clean white background, navy title typography, pale-blue rounded panels with thin azure borders, teal Microsoft Fabric panel, same arrow style, same numbered bottom rail. Image2 and Image3 are sheets of OFFICIAL product icons with their names written under each icon. Reuse these icons exactly as references, preserving shape, orientation, aspect ratio and colors. Never recolor, crop, rotate, distort or invent product logos. Where no icon is supplied, use a simple neutral navy line glyph that is clearly not a logo.

Title EXACT: "OpenTelemetry on Azure + Fabric"
Subtitle EXACT: "Produce, analyze and consume: dashboards, automation and AI agents"

Layout: THREE columns plus the bottom rail. Main data flow is strictly left to right.

COLUMN 1, left, about 30% of the width, "produce". Keep the two panels from Image1 with the same wording, slightly more compact:
- Panel "Azure Container Apps" (official Container Apps icon): card "Synthetic telemetry job" with caption "Manual run · finite batch", down arrow labeled "OTLP / HTTPS", card "OpenTelemetry Collector" (official OpenTelemetry icon) with chips "Filter", "Transform", "Batch", then a small "Managed identity" badge (official icon).
- Panel "Azure Kubernetes Service" (official AKS icon) with badge "namespace: otel-demo": card "Load generator" arrow to card "Microservices" with tiny chips gateway, checkout, inventory, payment, shipping, notifications; down arrow labeled "OTLP / HTTP"; card "OpenTelemetry Collector" with chips "Filter", "Transform", "Batch"; small "Workload identity" badge.
- Both collectors join into one connector labeled "Azure Data Explorer exporter" that enters column 2 at "Raw telemetry".

COLUMN 2, center, about 27% of the width. Keep the teal "Microsoft Fabric" panel (official Fabric icon) with the "Fabric capacity" badge and inner "Workspace". Inside: "Eventhouse / KQL database" (official KQL database icon) and the vertical stack "Raw telemetry" (caption "Logs / Traces / Metrics") → "Materialized views" → "KQL query layer" (caption "Functions + raw detail"). Remove the Real-Time Dashboard card from this column; it moves to column 3.

COLUMN 3, right, about 43% of the width. One large pale-blue panel titled "Consume" containing four stacked group cards. Each group card has a small navy header and a row of icon tiles with short labels:
1. Header "Dashboards & apps". Tiles: official Azure Managed Grafana icon labeled "Grafana" with caption "Metrics · Logs · Traces"; official Real-Time Dashboard icon labeled "Real-Time Dashboards"; official Power BI icon labeled "Power BI"; neutral app-window glyph labeled "Fabric apps" with caption "On-Call".
2. Header "Explore & analyze". Tiles: official KQL queryset icon labeled "KQL queryset" with a small official Copilot in Fabric icon and caption "+ Copilot"; official Notebook icon labeled "Notebooks"; official OneLake icon labeled "OneLake".
3. Header "Alert & act". Tiles: neutral lightning-bolt glyph labeled "Activator" with caption "Teams · Email · Power Automate"; official Operations agent icon labeled "Operations agent".
4. Header "AI agents". This is the most prominent group card, slightly taller, with a subtle teal accent border. Left part: official Model Context Protocol icon with label "MCP servers" and three chips "Eventhouse MCP", "Fabric RTI MCP", "Grafana MCP". Middle part: neutral document glyph labeled "Agent Skills" with chip "SKILL.md". Right part: official Fabric data agent icon labeled "Data agent". Bottom line inside this card: official GitHub Copilot icon followed by the text "GitHub Copilot · VS Code · Copilot Studio · Microsoft 365 Copilot · Foundry".
Below the four group cards, inside the Consume panel, a thin strip with the text "APIs: Kusto REST + SDKs · Fabric REST".

Connector: one bold azure arrow from the RIGHT EDGE of "KQL query layer" to the LEFT EDGE of the Consume panel, single arrowhead, labeled "KQL · MCP · REST".

Bottom rail: keep the four numbered steps from Image1 with the EXACT same text: "Terraform or Bicep: Azure resources", "Fabric REST: workspace + items", "KQL: schema + serving layer", "Helm: AKS telemetry workload".

Footnote, small gray text at the very bottom, EXACT: "Deployed by this sample: Grafana, Real-Time Dashboards, Fabric apps and a repo Agent Skill. Other options connect to the same Eventhouse."

Constraints: reference design, not a screenshot. Only product and generic names. No resource names, IDs, regions, prices, metrics or production claims. Every label spelled exactly as written above. Short legible labels, generous spacing, no overlapping text, one arrowhead per arrow.
```

## Architecture with AKS (previous version)

Generated with the GitHub Copilot CLI image generation tool (gpt-image). Image1 for
the first prompt is the previous Codex architecture image, produced by the
"Architecture" prompts further below. Image2 is `official/aks-reference-sheet.png`. One
correction edit followed, using the first render as Image1. After that, one
deterministic post-processing step: the edit misspelled the AKS badge text, so the
"Workload identity" text region was copied pixel-for-pixel from the first render at the
same position. No other pixels were changed.

### Composition

```text
Use case: infographic-diagram
Asset type: public GitHub README architecture diagram, wide landscape, high resolution, technical accuracy revision.

Image1 is the CURRENT diagram. Use it as the visual style and layout reference: same clean white background, same navy title typography, same pale-blue rounded panels with thin azure borders, same teal Microsoft Fabric panel, same arrow style, same numbered bottom rail. Image2 is a sheet of OFFICIAL product icons. Reuse these icons exactly as references, preserving their shape, orientation, aspect ratio and colors: Azure Kubernetes Service, OpenTelemetry, Azure Container Apps, Microsoft Fabric, KQL database, Real-Time Dashboard, Azure Managed Grafana, Managed identity. Never recolor, crop, rotate, distort or invent product logos.

Create a NEW version of the diagram that adds a continuous Azure Kubernetes Service workload instrumented with OpenTelemetry.

Title EXACT: "OpenTelemetry on Azure + Fabric"
Subtitle EXACT: "A finite synthetic job or continuous AKS microservices"

LEFT COLUMN: two stacked producer panels of equal width.
Upper panel "Azure Container Apps" with the official Container Apps icon. Keep it compact: card "Synthetic telemetry job" with small text "Manual run • finite batch"; short down arrow labeled "OTLP / HTTPS"; card "OpenTelemetry Collector" with the official OpenTelemetry icon and three small chips "Filter", "Transform", "Batch". A small badge with the official Managed identity icon and text "Managed identity". Footer text "Ingress limited to this environment".
Lower panel "Azure Kubernetes Service" with the official AKS icon, and a small tag "namespace: otel-demo". Inside: a small card "Load generator" with an arrow into a row of six small connected service chips in this exact order with thin arrows between them: "gateway" → "checkout" → "inventory" → "payment" → "shipping" → "notifications". Under the chips a small caption "OpenTelemetry SDK in every service". A down arrow labeled "OTLP / HTTP" goes to a card "OpenTelemetry Collector" with the official OpenTelemetry icon and chips "Filter", "Transform", "Batch". A small badge with the official Managed identity icon and text "Workload identity". Footer text "Cluster-internal services only".

CENTER: the "Microsoft Fabric" panel with the official Fabric logo and the small tag "Fabric capacity". Inside "Workspace", keep the "Eventhouse / KQL database" section with the complete official KQL database icon, and its vertical stack: card "Raw telemetry" with subtitle "Logs / Traces / Metrics", down arrow, card "Materialized views" with a small neutral bar-chart symbol, down arrow, card "KQL query layer" with an italic fx symbol and subtitle "Functions + raw detail". Keep the bypass elbow line from the right edge of Raw telemetry down to KQL query layer. Below the Eventhouse section, still inside the Workspace, add a card "Real-Time Dashboard" with the official Real-Time Dashboard icon and subtitle "Metrics · Logs · Traces", fed by a short arrow from KQL query layer.

INGESTION CONNECTORS: BOTH OpenTelemetry Collector cards each have ONE uninterrupted elbow line leaving their right edge, merging into one line just outside the Fabric panel, which ends with ONE arrowhead at the LEFT EDGE of the Raw telemetry card. Label the merged line "Azure Data Explorer exporter". No other arrows enter Fabric from the left.

RIGHT: the "Azure Managed Grafana" panel with the official Grafana icon. Inside one card titled "Metrics · Logs · Traces" containing three small tab-like mini dashboard thumbnails: a line chart, a log list, and a horizontal trace waterfall with staggered bars. Below it the badge with the official Managed identity icon and text "Managed identity". One arrow from the right edge of KQL query layer to the Grafana panel labeled "KQL query results".

BOTTOM RAIL, four numbered steps with arrows between neighbours, same style as Image1:
1 "Terraform or Bicep: Azure resources"
2 "Fabric REST: workspace + items"
3 "KQL: schema + serving layer"
4 "Helm: AKS telemetry workload"

Constraints: a reference architecture illustration, not a screenshot. Use only the product names and labels given above, spelled exactly. No resource names, IDs, IP addresses, region names, prices or metrics. Sharp, legible text with no paragraphs and no misspellings. Generous whitespace, nothing crowded or overlapping. All telemetry arrows flow left to right.
```

### Correction edit

```text
Use case: infographic-diagram
Edit Image1 with minimal changes. Image2 is a sheet of OFFICIAL product icons; reuse icons from it exactly, preserving shape, aspect ratio and colors. Never recolor, crop or invent logos.

Make ONLY these three corrections inside the existing layout. Keep every other element, label, color, position, font and arrow of Image1 unchanged, including the title, subtitle, Azure Container Apps panel, Microsoft Fabric panel, Azure Managed Grafana panel and the four-step bottom rail.

1. In the "Azure Kubernetes Service" panel, separate the load generator from the services. Replace the current single white card with: a small standalone card "Load generator" on the left, then ONE short arrow from it into a separate white card titled "Microservices" that contains the six chips in this exact order with small arrows between them: "gateway" → "checkout" → "inventory" → "payment" → "shipping" → "notifications", and the caption "OpenTelemetry SDK in every service" under the chips. Keep the down arrow labeled "OTLP / HTTP" from the Microservices card to the in-cluster "OpenTelemetry Collector" card, and keep the "Workload identity" badge and the footer "Cluster-internal services only".

2. Delete the stray horizontal line that currently connects the right edge of the services card to the vertical blue connector line. The ONLY lines that join the vertical connector are the one from the right edge of the upper "OpenTelemetry Collector" card (Azure Container Apps) and the one from the right edge of the lower "OpenTelemetry Collector" card (Azure Kubernetes Service). They merge into one line labeled "Azure Data Explorer exporter" ending with ONE arrowhead at the left edge of "Raw telemetry".

3. In the "Real-Time Dashboard" card inside Microsoft Fabric, replace the plain pink circle with the COMPLETE official Real-Time Dashboard icon from Image2: the light-grey rounded square tile containing the magenta gauge circle, with the small magenta arrow in its lower-right corner, at the same size as the KQL database icon in the same panel.

Sharp, legible text, no misspellings, no new labels beyond those named above.
```

Generated with the Codex built-in image generation tool. The official reference sheet is in `official/reference-sheet.png`. The previous architecture image (the layout reference for the AKS revision above) was refined from an earlier layout; the final edits below fix the connector and preserve the product artwork. `data-flow.png` is still the Codex asset.

## Architecture: final refinement

```text
Use case: infographic-diagram
Asset type: final public GitHub architecture diagram, technical accuracy revision.
Image1 is the edit target. Image2 is the official product asset sheet. Preserve all layout, text, colors and official product icons from Image1, with only these two changes:
1. Fix the collector ingestion connector. It must be ONE uninterrupted elbow line with ONE arrowhead. Start at the right edge of the OpenTelemetry Collector card, go right horizontally to a position just outside the left edge of the Microsoft Fabric boundary, turn up vertically to align with the center of Raw telemetry, turn right to terminate at the LEFT EDGE of the Raw telemetry card. The ONLY arrowhead is at the Raw telemetry card. Delete the existing extra horizontal arrowhead aimed at the Fabric inner boundary near Materialized views. There must be no branch, no extra arrowhead, no connector from Collector to Materialized views. Keep the Azure Data Explorer exporter label readable above the horizontal segment.
2. Match the complete official KQL database asset from Image2 beside Eventhouse / KQL database, including its gray rounded-square outline, blue cylinder and bottom-right arrow. Preserve asset shape, aspect ratio and colors without cropping.
All other elements remain unchanged: the managed identities, internal Azure Container Apps, the finite synthetic job, OTLP/HTTPS, raw telemetry -> materialized views -> KQL functions -> Grafana, and the raw-detail bypass.
```

## Architecture: query layer precision

```text
Use case: infographic-diagram
Asset type: final architecture illustration text precision edit.
Edit only the KQL layer card in the supplied diagram. Keep every product logo, every connector, every other label, the whole layout and the colors unchanged.
Replace the exact card label "KQL functions" with the exact main label "KQL query layer". Beneath it inside the same card, add the smaller readable subtitle "Functions + raw detail".
Reason for this precise content: summary queries use KQL serving functions and detailed trace/log queries read raw tables directly. The existing raw-to-KQL bypass now feeds the general query layer. Do not change any arrows.
Preserve the official product artwork exactly, including the complete KQL database icon and its gray border. Do not redraw or replace any logo.
```

## Data flow

```text
Use case: infographic-diagram
Asset type: public enterprise architecture documentation data flow, 16:9 landscape high resolution.
Create a brand new clean white-background technical infographic titled "From telemetry to operational insight". Use navy typography, azure and teal separators, generous whitespace, sharp readable text, straight unambiguous left-to-right connectors.
The supplied image is a sheet of OFFICIAL product icons. Reuse the precise matching shapes, colors and aspect ratios from this sheet (Azure Container Apps, Microsoft Fabric, KQL database, Azure Managed Grafana, OpenTelemetry, managed identity). Never recolor, crop, rotate or invent these logos.
Across the upper two-thirds create FIVE equal-width numbered stages with arrows only between neighboring stages:
1 "Produce" with official Azure Container Apps icon. Text "Manual Azure job" and "60 synthetic requests".
2 "Collect" with official OpenTelemetry icon. Text "Filter / Transform / Batch" and "Managed identity".
3 "Store" with official Microsoft Fabric icon and smaller complete KQL database icon. Text "Eventhouse raw tables" and chips "Logs", "Traces", "Metrics".
4 "Summarize" with neutral small bar chart symbol (not a product logo). Text "Materialized views" and stacked exact names "Logs1m", "Requests1m", "Metrics1m".
5 "Explore" with official Azure Managed Grafana icon. Text "KQL functions" and "Overview + drill-down".
Arrow from1to2 label "OTLP / HTTPS"; from2to3 label "Exporter"; from3to4 label "Incremental"; from4to5 label "KQL".
Lower one-third contains TWO wide simple panels:
Left panel titled "Detailed investigation" with text "Log -> Trace ID -> Parent + child spans" and sublabel "Raw retention: 7 days". This panel's mini-flow uses simple document and trace symbols, not extra product logos.
Right panel titled "Operational summaries" with text "Counts / Errors / Approximate P50 and P95" and sublabel "Summary retention: 30 days". Use simple chart marks.
Very bottom footnote "OTLP acknowledgement is not proof of completed ingestion."
Constraints: all cloud-hosted. No application needed. This is a concept diagram, not a fake screenshot or measured benchmark. No price claims. Use only the named product labels. Exact spelling of the three materialized views. Avoid small illegible paragraph text.
```
