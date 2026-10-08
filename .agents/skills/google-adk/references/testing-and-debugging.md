# Testing, Evaluation and Debugging

Sources: https://adk.dev/evaluate/, https://adk.dev/evaluate/criteria/,
https://adk.dev/callbacks/, https://adk.dev/callbacks/design-patterns-and-best-practices/,
https://adk.dev/plugins/, https://adk.dev/observability/logging/,
https://adk.dev/runtime/command-line/, https://adk.dev/runtime/web-interface/.

## Two layers of verification

| Layer | Goal | Model | Runs in CI |
|---|---|---|---|
| Workflow tests | Graph logic: routes, gates, loop bounds, error handling | Fake `BaseLlm` | Yes |
| Quality evals | Prompt/model quality, grounding, tool use | Real model + judge | No (on demand) |

## Workflow tests with a fake model

Run the real graph; replace only the model. No network, no API key.

```python
class FakeLlm(BaseLlm):
    model: str = "fake"

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False):
        system = str(llm_request.config.system_instruction)
        confidence = 0.4 if "You are the Reviewer" in system else 0.9
        payload = {"summary": "s", "confidence": confidence}   # superset of all output_schemas
        yield LlmResponse(content=types.Content(
            role="model", parts=[types.Part(text=json.dumps(payload))]))


@pytest.fixture(autouse=True)
def restore_default_model():
    saved = LlmAgent._default_model
    yield
    LlmAgent._default_model = saved


def test_low_confidence_escalates():
    LlmAgent.set_default_model(FakeLlm())
    result = asyncio.run(run_workflow(request))
    assert result.status == "escalated"
```

- Inject via `LlmAgent.set_default_model`; agents without `model=` pick it up even after the
  workflow was constructed.
- Route per agent on a stable system-instruction prefix. ADK's sequential `MockModel` cannot
  target specific agents under parallel fan-out.
- One payload that is a superset of every `output_schema` works for all agents (extra keys are
  dropped by validation).
- Script sequences (e.g. low → high confidence) to exercise loops and their bounds; make the fake
  raise to test error handling.
- Remove real waits through injected config/state, not by patching `asyncio.sleep`.
- Without `pytest-asyncio`, write sync tests around `asyncio.run(...)`.
- Assert outcomes a consumer sees (final status, ordering, counters, error reason) — not prompt
  text or call counts.
- Alternative stub: a `before_model_callback` returning an `LlmResponse` skips the model call for
  one agent while others use a real model.

## Quality evaluation

- Files: `*.test.json` (single session, unit-style) or `*.evalset.json` (multi-session), plus
  `test_config.json` with `{"criteria": {...}}` in the same folder.
- Run: `adk eval <agent_dir> <file>[:case1,case2] --print_detailed_results`; the Eval tab in
  `adk web` ("Add current session" → Run); or
  `await AgentEvaluator.evaluate(agent_module=..., eval_dataset_file_path_or_dir=..., num_runs=...)`
  from `google.adk.evaluation.agent_evaluator`.
- Choosing criteria:
  - `tool_trajectory_avg_score` (`EXACT` / `IN_ORDER` / `ANY_ORDER`) — tool-using agents.
  - `response_match_score` (ROUGE-1, default 0.8) — free text only; brittle on JSON output.
  - `final_response_match_v2`, `rubric_based_final_response_quality_v1`,
    `rubric_based_tool_use_quality_v1` — semantic/rubric checks, good for structured output.
  - `hallucinations_v1` — grounding against tool output.
  - `safety_v1`, `multi_turn_*` — need Vertex (`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`).
  - `tool_call_count_v1`, `token_usage_v1`, `invocation_duration_v1` — informational; a threshold
    on them is an error.
- Judge-based criteria call Gemini; they do not run on a local-only model setup.

## Dev UI and CLI

```bash
adk web <agents_dir> --port 8001 --reload --log_level debug
adk web <agents_dir> --no_use_local_storage        # no persisted sessions
adk run <agent_dir> '<first message>' --in_memory
adk api_server <agents_dir>                         # REST: /run, /run_sse, /apps/.../sessions
```

- Loader looks for `app` (an `App`) first, then `root_agent`, in `<dir>/agent.py`,
  `<dir>/__init__.py` or `root_agent.yaml`. If `agents_dir` itself contains `agent.py`, it runs
  in single-agent mode.
- Keep the runner's `app_name` equal to the agent directory name to avoid "App name mismatch".
- Trace tab shows per-node Event / Request / Response / Graph — first stop for routing bugs.
- CLI sessions persist to `<agent_dir>/.adk/session.db` by default; gitignore `.adk/`.
- The CLI runs the bare agent/workflow, not any wrapper the application puts around the runner.
- `--default_llm_model` sets the default model for CLI runs.
- Telemetry is off by default (`adk telemetry status|disable`).

## Logging and tracing

- ADK loggers live under `google_adk`; DEBUG logs full prompts — dev only.
- LiteLLM request dump: `import litellm; litellm._turn_on_debug()`.
- `LoggingPlugin` / `DebugLoggingPlugin(output_path="adk_debug.yaml", include_session_state=True)`
  from `google.adk.plugins`, registered on `App(plugins=[...])` or via
  `adk web --extra_plugins=<dotted.Class>`. The dump contains prompts and state: never commit it.
- OpenTelemetry: `google.adk.telemetry.setup.maybe_set_otel_providers()` with OTLP env vars;
  Cloud Trace via `get_gcp_exporters` (`google.adk.telemetry.google_cloud`) or
  `adk web --otel_to_cloud`. Prompt content is redacted unless
  `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` is set.

## Callbacks and plugins

Keyword names are fixed (ADK passes by keyword). Return `None` to continue.

| Hook | Params | Non-None return |
|---|---|---|
| `before_agent_callback` | `callback_context` | `Content` skips the agent |
| `after_agent_callback` | `callback_context` | `Content` appends an event (does not replace) |
| `before_model_callback` | `callback_context, llm_request` | `LlmResponse` skips the model |
| `after_model_callback` | `callback_context, llm_response` | `LlmResponse` replaces the response |
| `on_model_error_callback` | `callback_context, llm_request, error` | `LlmResponse` suppresses the error |
| `before_tool_callback` | `tool, args, tool_context` | `dict` skips the tool |
| `after_tool_callback` | `tool, args, tool_context, tool_response` | `dict` replaces the result |
| `on_tool_error_callback` | `tool, args, tool_context, error` | `dict` suppresses the error |

- A list of callbacks runs in order; before/after hooks stop at the first truthy return.
- Agent-specific logic → agent callbacks. Cross-cutting policy (logging, guardrails, metrics,
  model-error fallback) → `BasePlugin` subclass on `App`; plugin hooks run first and can
  short-circuit agent callbacks.
- Callbacks run inline: no blocking I/O, one job each, idempotent side effects, catch their own
  exceptions.
- Callbacks are for observation and policy, not for workflow state transitions — those belong in
  graph nodes.
- Model, tool and agent callbacks exist on agents only; function nodes have no hooks.
