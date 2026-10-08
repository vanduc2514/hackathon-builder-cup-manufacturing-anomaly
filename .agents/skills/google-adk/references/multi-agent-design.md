# Multi-Agent Design with ADK 2.x

Sources: https://adk.dev/workflows/, https://adk.dev/workflows/collaboration/,
https://adk.dev/graphs/, https://adk.dev/graphs/dynamic/, https://adk.dev/graphs/human-input/,
https://adk.dev/live/workflows/.

## Pick the orchestration style

| Process shape | Construct |
|---|---|
| Fixed, auditable steps with explicit decisions | Graph `Workflow` (function nodes + agent nodes) |
| Iterative/recursive flow that would bloat the edge list | Dynamic workflow: `@node(rerun_on_resume=True)` + `await ctx.run_node(...)` |
| Open-ended work where an LLM decides who acts next | Coordinator `Agent(sub_agents=[...])` |
| Same worker applied to each item of a list | `node(worker, parallel_worker=True, max_parallel_workers=N)` |

Industrial/regulated processes (incident handling, approvals, quality gates) want the graph:
every transition is visible in code and in the dev UI trace.

## Node roles

Separate three kinds of nodes and keep each one single-purpose:

| Role | Implementation | Does | Never does |
|---|---|---|---|
| Reasoner | `Agent(output_schema=Draft)` | Reads its input, returns a typed draft | Write shared state, pick routes, call other agents |
| Recorder | Function node | Persists a draft to shared/external state, returns the next node's input | Call an LLM |
| Gate | Function node returning `Event(route=...)` | Decides the branch from typed fields and counters | Interpret free text |

The usual chain is `reasoner → recorder → reasoner → … → gate`. A single recorder layer is the
only writer of shared state, which keeps writes ordered and testable.

## Agent contract

- One responsibility per agent; `description` states it precisely.
- `output_schema` is a small pydantic model (e.g. finding / evidence / confidence / citation).
  Clamp or validate numeric fields (confidence ∈ [0, 1]) in the recorder or via `Field` bounds.
- The upstream node's output is the agent's user message; tell the agent what that payload is
  in the instruction.
- Keep a stable identity prefix in each instruction ("You are the <Role> …") — fake models in
  tests route on it.
- Ground claims: give the agent tools or explicit evidence and require a citation field.

## Gates and loops

- Gate on numbers, not prose: confidence thresholds, counts, flags from typed outputs.
- Each back-edge needs a counter in `ctx.state` initialised by the first node, a maximum, and an
  explicit escalation branch when exhausted.
- Re-entered nodes start fresh; loop memory lives in state, not in the node.
- Closing/approval conditions should depend on measured evidence (sensor counts, verification
  results) read from the system of record, never on an LLM's assertion.

## Parallelism

- Fan out independent reasoners, join with `JoinNode`, then record their outputs in a fixed order
  so results are deterministic.
- `single_turn` agents run isolated; they do not see peer outputs until the join.
- Every join predecessor must emit output; give flaky predecessors a `RetryConfig`.

## External boundary

- A thin runner wrapper owns the lifecycle: start (single-flight if only one run may exist),
  cancel via `abort_signal`, reset, and translate exceptions into a visible error state.
- API layers call the wrapper; they never write the workflow's shared state directly.
- Human approval: either graph-native (`RequestInput` node + resumable session) or an explicit
  method on the wrapper after the graph finishes — pick one, never both.

## Live / voice agents

- A `Workflow` can run over one `runner.run_live(...)` connection, but every speaking node needs
  `mode='task'` or `'chat'`, live nodes must be sequential (no fan-out/join), and the model must
  be a Gemini Live model.
- Graphs with parallel `single_turn` nodes therefore keep live sessions outside the graph; the
  graph consumes the session's typed outcome.

## Model portability

- No `model=` on agents; set the default once from configuration.
- Design prompts and schemas so they work on the weakest supported model (short, explicit JSON
  schema, no nested free-form structures).
- Avoid features that only one provider supports (built-in Gemini tools, native
  `output_schema` + `tools`) on paths that must also run locally, or isolate them in their own
  agent.
