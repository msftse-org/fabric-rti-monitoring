# Release health

"Is this deploy worse than the last one?" should take two numbers, not an
investigation. Every span already carries `service.version`; release health
turns it into a per-release error-free rate, p95 latency, and the issues each
release introduced.

| Object | What it returns |
| --- | --- |
| `Releases1m` | Materialized view: server-span requests, errors, a latency digest, and first/last seen per minute, service, environment, and version. |
| `ReleaseHealth(lookback, healthy, degraded, minRequests)` | One row per service, environment, and version: `Tier`, `ErrorFreeRate`, requests, errors, `P95Ms`, `NewIssues` (issues first seen in that release), first and last seen. |
| `ReleaseComparison(lookback)` | For each service and environment, the newest release next to the one before it, with deltas and a `Verdict`: `better`, `same`, `worse`, `first release`, or `too few requests`. |

**Tiers** default to the usual error-tracker cut-offs: `healthy` at 99% or more
error-free, `degraded` at 95% or more, `unhealthy` below. Fewer than 50 requests
in the window reads `too few requests`, because a rate over a handful of
requests is noise. Pass other thresholds to suit a workload, for example
`ReleaseHealth(24h, 0.999, 0.99)`.

A **new issue** belongs to the release in which its fingerprint was first seen,
so a release that only inherits old failures shows `NewIssues = 0`.

## Demonstrate a release on the AKS workload

The demo deliberately fails about 7% of requests, so its default mix reads
`unhealthy` against the 99%/95% tiers. Two Helm values drive a release story:

| Value | Effect |
| --- | --- |
| `apps.version` | Reported as `service.version` by every service. |
| `apps.failureMultiplier` | Scales every hop's simulated failure probability (0 to 10). `0` disables simulated failures; `4` roughly quadruples them. |

```bash
# A good release: fewer failures than today.
helm upgrade otel-demo k8s/otel-demo --namespace otel-demo --values k8s/aks.local.yaml \
  --set apps.version=1.3.0 --set apps.failureMultiplier=0.2 --wait

# Later, a bad release.
helm upgrade otel-demo k8s/otel-demo --namespace otel-demo --values k8s/aks.local.yaml \
  --set apps.version=1.4.0 --set apps.failureMultiplier=4 --wait
```

```kusto
ReleaseComparison(2h)
| project Service, Environment, Previous, Current, PreviousErrorFreeRate, CurrentErrorFreeRate, P95DeltaMs, NewIssues, Verdict
```

Pair it with [issue alerts](issues-and-alerts.md): resolve an issue with
`--in-version 1.3.0`, and a later bad release that brings it back raises one
`regression` alert, while pods still draining on an older version do not.
