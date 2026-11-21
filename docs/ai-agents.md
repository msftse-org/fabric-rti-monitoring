# AI agent tracing

Agent runs are traces like any other request, but the questions differ: which
agents ran, which models and tools they called, how many tokens they used, and
where a run failed or slowed down. This sample reads the
[OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
from ordinary spans, so any SDK or framework that emits them fits.

## The synthetic assistant

The AKS workload includes an `assistant` service. The load generator sends 10%
of requests (`loadgen.assistRatio`) through the gateway to it as an `assist`
conversation:

| Span | Kind | Key attributes |
| --- | --- | --- |
| `invoke_agent support-agent` | internal | `gen_ai.operation.name=invoke_agent`, `gen_ai.agent.name`, `gen_ai.request.model` |
| `chat demo-chat-small` | client | `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons` |
| `execute_tool lookup_order` | internal | `gen_ai.tool.name`, `gen_ai.tool.type` |
| `invoke_agent refunds-agent` | internal | A handoff in about 30% of runs, with its own model and tool calls |

**No model is called.** The provider is `demo`, the models are `demo-chat-small`
and `demo-chat-large`, and token counts are random. About 2% of model calls fail
with `RateLimitError` and 5% of tool calls with `ToolExecutionError`
(scaled by `apps.failureMultiplier`); those failures appear as
[issues](issues-and-alerts.md) too.

## Contract

The collector accepts span names `invoke_agent`, `chat`, or `execute_tool`
followed by one name token, and keeps only GenAI **metadata**: operation,
provider, request and response model, input and output tokens, finish reasons,
agent name, tool name, and tool type. Prompts, completions, system
instructions, and tool arguments or results (`gen_ai.input.messages`,
`gen_ai.output.messages`, `gen_ai.tool.call.arguments`, and so on) are dropped,
because they routinely contain personal and confidential data. Review this before
connecting a real agent, and keep content capture off in its SDK.

## Queries

| Function | Returns |
| --- | --- |
| `AgentSpans(lookback)` | GenAI spans with operation, agent, model, tool, tokens, duration, and failure flag. |
| `AgentRuns(lookback)` | One row per run (trace): entry agent, every agent involved, handoff flag, models, tools, call counts, tokens, duration, outcome. |
| `AgentOverview(lookback)` | Runs, failed runs, handoffs, tokens, and approximate p50/p95 run duration per minute. |
| `AgentModels(lookback)` | Calls, errors, input/output tokens, and p95 latency per model. |
| `AgentTools(lookback)` | Calls, errors, and p95 latency per tool and agent. |
| `AgentRun(traceId)` | Every model call, tool call, and handoff in one run, in order, with offsets for a waterfall. |

```kusto
AgentRuns(1h)
| where Failed
| project Start, TraceID, EntryAgent, Agents, Tools, InputTokens, OutputTokens, DurationMs

AgentRun("<trace id from AgentRuns>")
```

There is deliberately **no cost column**. Per-model prices change faster than a
dashboard, and a stale price is worse than none; multiply the exact token counts
by your current price list when you need cost.
