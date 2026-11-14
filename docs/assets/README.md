# Diagram assets and provenance

`data-flow.png` and `buffered-architecture.png` are explanatory illustrations generated
using Codex's built-in image generation tool. `architecture-azure.png` was then revised
with the GitHub Copilot CLI image generation tool (gpt-image), first to add the optional AKS
workload and the Fabric Real-Time Dashboard, then to add the Consume side: dashboards and
apps, exploration, alerting, and AI agents with MCP servers, Agent Skills, and the Fabric
data agent. Each revision used the previous image as its layout reference, with
`official/aks-reference-sheet.png` and, for the consumption revision,
`official/consume-reference-sheet.png` as icon references. Four official icons were then
placed deterministically; see [image-prompts.md](image-prompts.md). Product icons from the sources below
were provided as visual references. Generated illustrations are not screenshots of
a deployment. The versioned code and [Mermaid sources](../diagrams/) define the
technical contract.

The final generation prompts are preserved in [image-prompts.md](image-prompts.md).

## Official reference assets

| Asset | Official source |
| --- | --- |
| Container Apps, Kubernetes Services (AKS), Event Hubs, Managed Grafana, managed identity, Log Analytics | [Microsoft Azure architecture icon package V24](https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip), linked by the [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/icons/). |
| Fabric, Eventstream, Eventhouse, KQL database, Real-Time Dashboard, Power BI, KQL queryset, Notebook, OneLake, Copilot, Fabric data agent, Operations agent | [Microsoft Fabric icons v6.1.0](https://github.com/microsoft/fabric-samples/blob/main/docs-samples/Icons.zip), linked by [Fabric documentation](https://learn.microsoft.com/en-us/fabric/fundamentals/icons). |
| OpenTelemetry | [CNCF OpenTelemetry color icon](https://github.com/cncf/artwork/tree/main/projects/opentelemetry/icon/color), linked by the [OpenTelemetry community](https://opentelemetry.io/community/). |
| Model Context Protocol | [`docs/favicon.svg`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/favicon.svg) in the official Model Context Protocol repository. |
| GitHub Copilot | [`copilot-24.svg`](https://github.com/primer/octicons/blob/main/icons/copilot-24.svg) from GitHub Primer Octicons (MIT). |

The selected original SVGs are retained in `official/`. Each reference sheet
(`reference-sheet`, `buffered-reference-sheet`, `aks-reference-sheet`, `consume-reference-sheet`) is an input to generation,
created by placing the unmodified SVGs on a white canvas.
Scaling preserves their aspect ratios and colors. These product assets retain
their owners' usage terms; see [third-party notices](../../THIRD_PARTY_NOTICES.md).
