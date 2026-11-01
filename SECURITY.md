# Security

Do not post credentials, tokens, customer telemetry, or private deployment details
in an issue. To report a suspected vulnerability, use GitHub's **Report a
vulnerability** option in this repository's Security tab if available. Otherwise
contact a repository maintainer privately through their public GitHub profile.

This repository is a learning sample. The cloud receiver accepts synthetic traffic
from the same Container Apps environment. The developer debug receiver binds to
loopback. Review authentication, networking, retention, data
classification, and failure handling before connecting a real workload. The
specific boundaries and hardening steps are in
[security and operations](docs/security-and-operations.md).
