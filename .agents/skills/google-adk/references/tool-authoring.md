# ADK Tool Authoring

Sources: https://adk.dev/tools-custom/function-tools/, https://adk.dev/tools-custom/performance/,
https://adk.dev/tools/limitations/, https://adk.dev/agents/llm-agents/,
https://adk.dev/agents/models/ollama/, https://adk.dev/integrations/bigquery/,
https://adk.dev/safety/.

## Principles

- Tools are stateless lookups and calculations. They do not call other agents, do not drive the
  workflow, and do not mutate the system of record unless that is their explicit, guarded purpose.
- Deterministic math the workflow depends on (limits, counters, scores) belongs in a **function
  node** that calls the function directly — not behind an LLM tool call.
- Tools must work locally (emulator or local data) when cloud credentials are absent.

## Function tool rules

A plain function in `tools=[...]` is wrapped as `FunctionTool`; the LLM sees a schema built from
the function name, type hints, defaults and docstring.

- **Name**: `verb_noun`, describes the action.
- **Parameters**: type-hint every one with JSON primitives (`str`, `int`, `float`, `bool`,
  `list[str]`, ...). No default = required; defaults only for values the model may omit.
  No custom classes, `*args`, `**kwargs` (invisible to the model).
- **Return** a `dict` with a `status` key (`"success"` / `"error"`) plus data, or
  `error_message` on failure. Non-dict returns are wrapped as `{"result": value}`. Build data from
  a pydantic model and return `model.model_dump()`.
- **Docstring**: purpose, when to call it, each argument, returned keys and status values. Do not
  document the `ToolContext` parameter.
- **`ToolContext`** (alias of `Context`): a parameter annotated `ToolContext` gives
  `tool_context.state` (use `temp:` keys to pass data between tools in one invocation),
  `actions`, artifacts and memory. Detected by type, hidden from the model.
- **Async**: `async def` tools run concurrently when the model emits several calls in one turn;
  one sync tool blocks the batch. Wrap blocking SDKs in `await asyncio.to_thread(...)`; never
  `time.sleep` in a tool.
- **Errors**: expected failures (no rows, unknown id) → `{"status": "error", ...}` so the model
  can react. Unexpected failures raise; a node `RetryConfig` handles transients.

```python
async def get_lot_summary(lot_id: str, since_iso: str) -> dict:
    """Summarises units produced from a lot since a timestamp.

    Call once per lot before drawing conclusions about material.

    Args:
        lot_id: Material lot identifier.
        since_iso: ISO-8601 start of the time window.

    Returns:
        {"status": "success", "summary": {...}} or {"status": "error", "error_message": str}.
    """
    rows = await asyncio.to_thread(fetch_rows, lot_id, since_iso)
    if not rows:
        return {"status": "error", "error_message": f"No units for {lot_id} since {since_iso}"}
    return {"status": "success", "summary": LotSummary.from_rows(rows).model_dump()}
```

## Wiring tools into agents

- In the instruction, name each tool, say when to call it, the order, and what to do on
  `status: error`. Ask explicitly for parallel calls when lookups are independent.
- `output_schema` + `tools` together work natively only on Gemini 3.x. Other models (LiteLLM,
  Ollama) fall back to an injected `set_model_response` tool that is unreliable. Portable shape:

```python
investigator = Agent(name="investigator", instruction="... call get_lot_summary ...",
                     tools=[get_lot_summary])
formatter = Agent(name="formatter", instruction="Turn the notes into one finding ...",
                  output_schema=Finding)
# edges: (..., investigator, formatter, ...)
```

- Ollama: model string `ollama_chat/<model>`; `ollama show <model>` must list `tools`. Models
  whose chat template forces a function call loop forever.
- `tool_context.actions.skip_summarization = True` returns the tool result without a follow-up
  LLM summary.

## Prebuilt tools and toolsets

- Custom toolset: subclass `BaseToolset` (`async get_tools(readonly_context=None)`,
  `async close()`).
- BigQuery: `BigQueryToolset(credentials_config=BigQueryCredentialsConfig(credentials=creds),
  bigquery_tool_config=BigQueryToolConfig(write_mode=WriteMode.BLOCKED))` from
  `google.adk.integrations.bigquery` (+ `.config`). Use `WriteMode.BLOCKED` for analysis agents.
  Requires real credentials (ADC / service account / OAuth) — keep a local fallback path.
- `AgentTool(agent=...)` runs an agent as a tool; in a graph, prefer an explicit edge.
- `LongRunningFunctionTool(func=...)` starts external work (ticket, approval) and pauses the run
  until a `FunctionResponse` with the same id arrives. It does not do the long work itself. Use
  one approval mechanism per system.
- Gemini built-ins (`google_search`, `VertexAiSearchTool`, `BuiltInCodeExecutor`) are
  Gemini-only, have mixing limits and are not allowed in sub-agents (search tools excepted); put
  them in a dedicated agent or wrap in `AgentTool`.

## Guardrails

- Policy (allowed resources, row limits, read-only) comes from code, config or state set by the
  workflow — never from model-provided arguments.
- `before_tool_callback(tool, args, tool_context)` returning a `dict` blocks the call; validate
  arguments there. Cross-agent policy belongs in a plugin on `App`.
- Least-privilege identity for tools that reach cloud services.
- Treat tool output and model text shown in a UI as untrusted; escape it.

## Testing tools

Test the plain function directly with local data: return shape, `status` on empty/invalid input,
boundary values. No network, no cloud credentials.
