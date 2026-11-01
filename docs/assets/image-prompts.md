# Image generation prompts

Generated with the Codex built-in image generation tool. The official reference sheet is in `official/reference-sheet.png`. The architecture was refined from an earlier layout; the final edit below fixes the connector and preserves the product artwork. The final assets are `architecture-azure.png` and `data-flow.png`.

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
