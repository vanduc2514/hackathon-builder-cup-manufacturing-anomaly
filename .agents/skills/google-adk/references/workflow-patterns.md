# ADK 2.x Graph Workflow Patterns

Python, `google-adk 2.11`. Sources: https://adk.dev/2.0/, https://adk.dev/graphs/,
https://adk.dev/graphs/data-handling/, https://adk.dev/graphs/routes/,
https://adk.dev/graphs/human-input/, https://adk.dev/graphs/dynamic/,
https://adk.dev/sessions/state/, https://adk.dev/runtime/event-loop/, https://adk.dev/apps/.

Choosing between graph, dynamic workflow and coordinator agents:
[multi-agent-design.md](multi-agent-design.md).

`SequentialAgent` / `ParallelAgent` / `LoopAgent` and `_run_async_impl` overrides are 1.x
patterns; the 2.0 engine ignores `_run_async_impl` silently. Use graph nodes or
`before_/after_agent_callback`. https://adk.dev/workflows/patterns/ still shows 1.x material.

## Edges

```python
workflow = Workflow(
    name="my_workflow",
    edges=[
        ("START", a, b, c),                            # chain
        (c, {"OK": d, "RETRY": b, DEFAULT_ROUTE: e}),  # branch; back-edge = loop
        (d, (x, y)),                                    # fan-out
        ((x, y), JoinNode(name="join"), z),             # fan-in → {"x": ..., "y": ...}
    ],
)
```

- Node types: function, `Agent`, nested `Workflow`, `JoinNode`, `node(...)`-wrapped object, tool.
- `Workflow(...)` validates at construction → importing the module is the cheapest check.
- A node object placed twice shares its edges; use separate instances per graph position.
- A node re-entered through a back-edge starts a fresh lifecycle; loop memory lives in `ctx.state`.
- Nested `Workflow` output = output of its final leaf node(s); inner events bubble up for tracing.

## Routing

```python
async def gate(ctx: Context, node_input: Draft) -> Event:
    if node_input.confidence >= THRESHOLD:
        return Event(route="ACCEPT", output=node_input.model_dump())
    if ctx.state["rounds"] < MAX_ROUNDS:
        ctx.state["rounds"] += 1
        return Event(route="RETRY", output=node_input.model_dump())
    return Event(route="ESCALATE", output="confidence below threshold after max rounds")
```

- `route` may be `str | int | bool` or a list (fans out to every match); `DEFAULT_ROUTE` is the
  catch-all key.
- `route` and `output` are independent: one event picks the branch and carries the payload.
- **Always `.model_dump()`** pydantic outputs on `Event(...)` — plain returns are auto-dumped,
  `Event(output=model)` is not, and a downstream `node_input: dict` then fails.
- Routes come from code over typed fields; never let an LLM emit the route string.

## Data passing

| Channel | Goes to | Use for |
|---|---|---|
| `output` (return value or `Event(output=)`) | Next node's `node_input` | The node's result |
| `Event(message=...)` | User / UI only | Progress text |
| `ctx.state[...]` / `Event(state={...})` | Every later node in the session | Counters, run trigger, small config |
| External store / artifacts | Outside the run | Large or durable data |

- Function node signature: `async def n(ctx: Context, node_input: Model) -> Model | Event`.
  `node_input` is coerced to its annotation. **Other parameter names are filled from
  `ctx.state`** (`parameter_binding='state'` default) — never add them by accident.
- One `output` per node run (a second raises). Non-terminal nodes must return non-None.
- State values must be JSON-serializable (`.model_dump()` first) and small.
- State prefixes: none = session; `user:` = all sessions of a user; `app:` = all users;
  `temp:` = this invocation only (not for counters that must survive pause/resume).
- Write state only through the provided `Context` (becomes `state_delta` on the next event).
  Never mutate `session.state` fetched from the session service.
- Seed state with `create_session(..., state={...})` or `run_async(state_delta=...)`.
- If only the next node needs a value, pass it as `output`, not state.
- `Agent(input_schema=Model)` lets an instruction reference `{field}` of its input, or
  `<Model.field from node_name>` for a named predecessor. Otherwise the agent sees the upstream
  output as JSON in its user message.

## Agent nodes

- `mode` defaults to `single_turn` as a node: no history beyond its input, no user interaction,
  parallel-safe. Avoid `mode='task'` in graphs (disabled in Python 2.0); never set `mode` on the
  root.
- `output_schema` output is validated with pydantic (`Field` constraints enforced). Invalid JSON
  raises `ValidationError` from the node → the run fails unless the node has a `RetryConfig`.
- `generate_content_config=types.GenerateContentConfig(temperature=0.2)` for repeatable
  structured output.
- `instruction` may be a callable `InstructionProvider(ReadonlyContext) -> str`; it skips state
  templating (call `google.adk.utils.instructions_utils.inject_session_state` if needed).
- `include_contents='none'` sends only instruction + current input (stateless nodes).

## Failure handling

```python
from google.adk.workflow import RetryConfig, node

reasoner = node(
    my_agent,
    retry_config=RetryConfig(max_attempts=3, exceptions=[TimeoutError]),  # first attempt counts
    timeout=60,                                                           # NodeTimeoutError
)
```

- Retries are **off** unless `retry_config` is set. Default backoff 1s ×2 up to 60s with jitter;
  `exceptions=None` retries everything. `node(...)` wraps functions and agents alike.
- Let exceptions propagate. A broad `except Exception` in a node or tool hides the failure and
  disables retries. Never catch `BaseException` (traps `NodeInterruptedError`, breaks HITL).
- Unhandled errors re-raise from `runner.run_async`; the caller maps them to an error state.

## Running and cancelling

```python
runner = InMemoryRunner(node=workflow, app_name=APP_NAME)
session = await runner.session_service.create_session(app_name=APP_NAME, user_id=USER_ID)
async for event in runner.run_async(
    user_id=USER_ID,
    session_id=session.id,
    new_message=types.Content(role="user", parts=[types.Part(text=request.model_dump_json())]),
    abort_signal=abort,  # asyncio.Event
):
    ...
```

- The session must exist before `run_async` (`SessionNotFoundError`).
- The first node annotated `node_input: Model` receives the START text JSON-parsed.
- `abort.set()` ends the generator without raising; committed events stay, queued ones drop.
  Python `abort_signal` is not documented on adk.dev (TS only); behaviour is from the runner
  source.
- `event.is_final_response()` picks final events; check `event.actions.state_delta` before
  reading it.
- Call `await runner.close()` on shutdown when plugins/toolsets hold resources.

## App, plugins, resumability

```python
app = App(name="my_app", root_agent=workflow, plugins=[...],
          resumability_config=ResumabilityConfig(is_resumable=True))
runner = InMemoryRunner(app=app)
```

- Expose it as `app` (not `root_agent`) in the CLI entry module so `adk web`/`adk run` and the
  server use the same object.
- `App.name`: letters, digits, `_`, `-`; starts with a letter; not `user`.
- Resume: `run_async(user_id=, session_id=, invocation_id=...)` without `new_message`. Nodes and
  tools may run again, so side effects must be idempotent. Do not change the graph between stop
  and resume. Resume of `Workflow`/`JoinNode` graphs is thinly documented — test before relying
  on it. In-memory sessions do not survive a restart.

## Human input (graph-native)

```python
def ask_approval(node_input: dict):
    yield RequestInput(message="Approve?", payload=node_input, response_schema=Decision)
```

- `rerun_on_resume=False` (leaf default): the reply becomes this node's output.
- `rerun_on_resume=True` reruns the body; required for nodes calling `ctx.run_node`.
- `response_schema` does not reshape the reply; the client must send matching JSON.

## Dynamic workflows

```python
@node(rerun_on_resume=True)
async def flow(ctx: Context, node_input: str):
    plan = await ctx.run_node(planner, node_input)
    results = await asyncio.gather(*[ctx.run_node(worker, item) for item in plan["items"]])
    yield Event(output=results)
```

- Child runs get deterministic IDs in call order; on resume finished children are skipped.
  Start parallel children in a plain loop/comprehension so IDs stay stable.
- Custom `run_id=` must contain a non-numeric character.
- Loops are bounded by your own code.
