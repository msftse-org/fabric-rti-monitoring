# Diagram assets and provenance

`architecture-azure.png`, `data-flow.png`, and `buffered-architecture.png` are explanatory illustrations generated
using Codex's built-in image generation tool. Product icons from the sources below
were provided as visual references. Generated illustrations are not screenshots of
a deployment. The versioned code and [Mermaid sources](../diagrams/) define the
technical contract.

The final generation prompts are preserved in [image-prompts.md](image-prompts.md).

## Official reference assets

| Asset | Official source |
| --- | --- |
| Container Apps, Event Hubs, Managed Grafana, managed identity, Log Analytics | [Microsoft Azure architecture icon package V24](https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip), linked by the [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/icons/). |
| Fabric, Eventstream, Eventhouse, KQL database, Real-Time Dashboard | [Microsoft Fabric icons v6.1.0](https://github.com/microsoft/fabric-samples/blob/main/docs-samples/Icons.zip), linked by [Fabric documentation](https://learn.microsoft.com/en-us/fabric/fundamentals/icons). |
| OpenTelemetry | [CNCF OpenTelemetry color icon](https://github.com/cncf/artwork/tree/main/projects/opentelemetry/icon/color), linked by the [OpenTelemetry community](https://opentelemetry.io/community/). |

The selected original SVGs are retained in `official/`. The reference sheet is an
input to generation, created by placing the unmodified SVGs on a white canvas.
Scaling preserves their aspect ratios and colors. These product assets retain
their owners' usage terms; see [third-party notices](../../THIRD_PARTY_NOTICES.md).
