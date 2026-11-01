# Contributing

Keep this sample small enough to explain in one customer session. Prefer an
optional extension over making Kubernetes, an application, or another backend
part of the baseline.

1. Explain the scenario and expected behavior in an issue or pull request.
2. Update the implementation and corresponding documentation together.
3. Run the checks in [validation](docs/validation.md). Never include credentials,
   tenant exports, actual customer telemetry, or deployment output in a change.
4. Describe local and cloud verification separately. Include the collector version
   when changing configuration, exporter schema, or dashboard queries.

Use only synthetic fixtures and public documentation in issues. Report a security
issue privately using the process in [SECURITY.md](SECURITY.md).
