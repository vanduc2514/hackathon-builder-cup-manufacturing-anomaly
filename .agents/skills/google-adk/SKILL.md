---
name: google-adk
metadata:
  version: "2.1.0"
  category: AgentFramework
description: >-
  Principles and best practices for building multi-agent systems on google-adk 2.x (Python):
  graph Workflows, function nodes, LlmAgent nodes with output_schema, Event routes, JoinNode,
  state, tools, model providers (Gemini, LiteLLM/Ollama), runners, testing, evaluation and
  debugging. Use when designing, writing, reviewing or debugging ADK agents and workflows.
---

# Google ADK 2.x — Principles & Best Practices

Verified against `google-adk 2.11`. Official docs: https://adk.dev (plain text:
https://adk.dev/llms.txt).

## References

| Topic | File |
|---|---|
| Designing a multi-agent system: graph vs LLM orchestration, agent contracts, gates, loops | [references/multi-agent-design.md](references/multi-agent-design.md) |
| Graph Workflow API: edges, routes, joins, data passing, state, retries, run/cancel, HITL | [references/workflow-patterns.md](references/workflow-patterns.md) |
| Function tools, toolsets, guardrails | [references/tool-authoring.md](references/tool-authoring.md) |
| Fake-model tests, `adk eval`, dev UI/CLI, logging, callbacks/plugins | [references/testing-and-debugging.md](references/testing-and-debugging.md) |

## Imports (2.x)

```python
from google.adk import Agent, Context, Event, Workflow
from google.adk.agents import LlmAgent
from google.adk.workflow import DEFAULT_ROUTE, JoinNode, RetryConfig, node
from google.adk.events import RequestInput
from google.adk.runners import InMemoryRunner
from google.adk.apps import App
from google.adk.tools import ToolContext      # alias of Context
from google.genai import types
```

## Principles

1. **Code decides, LLMs reason.** Deterministic control flow (routing, thresholds, loop bounds,
   closing conditions) lives in graph edges and function nodes. LLM nodes produce typed content;
   they never choose the route or mutate shared state.
2. **Typed contracts everywhere.** Every node input/output is a pydantic model from one schema
   module. LLM nodes use `output_schema`; field meaning goes in `Field(description=...)`.
3. **Agents are pure.** An agent node receives its input, returns a draft. Side effects (writing
   shared/external state) happen in dedicated function nodes — ideally a single writer layer.
4. **Every cycle is bounded.** Graph loops have no built-in limit: keep a counter in `ctx.state`
   and route to an explicit escalation/terminal node when exhausted.
5. **Fail loudly, retry deliberately.** Let exceptions propagate; opt into `RetryConfig` /
   `timeout` per node. Never swallow errors in nodes or tools.
6. **One model default, injectable.** Set `LlmAgent.set_default_model(...)` once at startup;
   agents omit `model=` so tests can swap in a fake model.
7. **Local parity.** The same graph runs on a local model (LiteLLM/Ollama), a hosted model
   (Gemini) and a fake model in tests, selected by configuration only.
8. **Graph is the 2.0 way.** Prefer `Workflow` over `SequentialAgent`/`ParallelAgent`/
   `LoopAgent`; `_run_async_impl` overrides are ignored by the 2.0 engine.

## Core rules

**Graph**
- Chain `("START", a, b)`; branch `(gate, {"ROUTE": dst, DEFAULT_ROUTE: other})`; fan-out
  `(a, (x, y))`; fan-in `((x, y), JoinNode(name="j"), z)` — join output is a dict keyed by
  predecessor `name`.
- Function node signature: `async def n(ctx: Context, node_input: Model)`. Any other parameter is
  **bound from session state by name**.
- `Event(route=..., output=model.model_dump())` — a pydantic model passed as `output` of a routed
  event is not auto-dumped.
- One `output` per node run; non-terminal nodes must return non-None; progress goes in
  `Event(message=...)`.
- A node object used twice in a graph shares its edges; create a distinct instance per position.
- `Workflow(...)` validates at construction: importing the module is the first check.

**LLM agents**
- `Agent(name=, description=, instruction=, output_schema=Model)`; unique `name`.
- As a graph node an agent runs `mode='single_turn'`: input = upstream output, no chat history,
  no transfers. Do not set `mode='task'` in graphs; never set `mode` on the root.
- `instruction` is templated: `{identifier}` → state lookup (KeyError if missing), `{key?}`
  optional. Never write literal `{word}`; use an `InstructionProvider` callable to skip templating.
- `output_schema` + `tools` is native only on Gemini 3.x; elsewhere it falls back to an unreliable
  `set_model_response` tool → split into a tool agent followed by a schema agent/node.
- Low `temperature` via `generate_content_config` for repeatable structured output.

**Models**
- Gemini: model string (`gemini-...`) + `GOOGLE_API_KEY`/`GEMINI_API_KEY` or Vertex ADC.
- Ollama via LiteLLM: `ollama_chat/<model>` (never `ollama/`: tool-call loops, lost context) +
  env `OLLAMA_API_BASE`. Give tools only to models whose `ollama show` lists `tools`.
- A string default is re-resolved on each call; pass a `LiteLlm(...)` instance to configure it.

**Runtime**
- `InMemoryRunner(node=workflow, app_name=...)` (or `app=App(...)` for plugins/resumability);
  create the session before `run_async(user_id=, session_id=, new_message=, abort_signal=)`.
- `abort_signal.set()` (an `asyncio.Event`) ends the run without raising.
- Node exceptions re-raise from `run_async`; map them to a visible error state.
- Write state only through the provided `Context`; state values must be JSON-serializable.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `KeyError: Context variable not found` | `{word}` in an instruction | Remove braces, `{key?}`, or an `InstructionProvider` |
| `ValidationError ... dict_type` in next node | `Event(output=model)` | `output=model.model_dump()` |
| `ValidationError ... json_invalid` from an agent node | Model replied with non-JSON | Stronger model, clearer schema, or `node(agent, retry_config=...)` |
| Join node missing a key | A predecessor produced no output | Every join predecessor returns non-None |
| Function param has a surprising value | Bound from `ctx.state` by name | Only `ctx` and `node_input`; read state explicitly |
| Agent loops calling tools on Ollama | `ollama/` prefix or template forcing calls | `ollama_chat/`; check model capabilities |
| Structured output flaky after adding tools | `set_model_response` fallback | Split tool agent + schema agent/node |
| One transient LLM failure kills the run | Retries off by default | `node(x, retry_config=RetryConfig(...), timeout=...)` |
| Graph never terminates | Unbounded back-edge | Counter in `ctx.state` + escalation route |
| Stale sessions in dev UI | CLI persists to `<agent_dir>/.adk/session.db` | Delete `.adk/`, `adk web --no_use_local_storage`, `adk run --in_memory` |
