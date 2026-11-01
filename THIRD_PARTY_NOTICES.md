# Third-party notices

## OpenTelemetry

The table column contract in `fabric/schema.kql` follows the documented Azure
Data Explorer exporter in OpenTelemetry Collector Contrib v0.141.0. The collector
container and exporter are distributed separately by the OpenTelemetry project
under the Apache License 2.0:

- [Exporter source and schema](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.141.0/exporter/azuredataexplorerexporter)
- [Upstream license](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.141.0/LICENSE)
- [Upstream notices](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.141.0/NOTICE)

OpenTelemetry is a Cloud Native Computing Foundation project. Its logo is a
project mark, supplied through [CNCF artwork](https://github.com/cncf/artwork/tree/main/projects/opentelemetry),
and remains subject to the [Linux Foundation trademark policy](https://www.linuxfoundation.org/legal/trademark-usage).

## Microsoft product icons

Microsoft product icons are included for architecture documentation under the
usage terms published with the [Azure architecture icons](https://learn.microsoft.com/en-us/azure/architecture/icons/)
and [Fabric icons](https://learn.microsoft.com/en-us/fabric/fundamentals/icons).
They are not relicensed under the sample's MIT license. Microsoft retains all
other rights. Product marks identify the products used in the architecture and
do not represent a new product or an endorsement of this sample.

See [asset provenance](docs/assets/README.md) for exact download sources. The
Azure Managed Grafana icon is from Microsoft's Azure architecture icon package.

## Runtime images

The sample references the separately distributed OpenTelemetry Collector Contrib
and official Python container images. Their upstream licenses and dependencies
remain applicable. This repository does not redistribute those image layers.
