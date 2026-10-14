"""Tool-use guards for agent nodes: a per-turn tool-call budget and argument errors as results."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext

logger = logging.getLogger(__name__)

MAX_TOOL_CALLS = 3
BUDGET_SPENT_INSTRUCTION = (
    "Your tool-call budget for this turn is spent. Do not call any tool again; "
    "answer now with the final JSON built from the tool results you already have."
)

BeforeModelCallback = Callable[[CallbackContext, LlmRequest], LlmResponse | None]


def limit_tool_calls(
    *tools: Callable[..., Any], max_calls: int = MAX_TOOL_CALLS
) -> BeforeModelCallback:
    """Builds a before_model_callback that hides `tools` after `max_calls` results this turn.

    Workflow agent nodes run with ``include_contents='none'``, so the request only
    carries the current turn: every function response in it was produced by this
    run. Once the budget is spent the tool declarations are dropped and the model
    can only answer; ADK's own ``set_model_response`` tool (output schema on
    non-Vertex backends) is not in `tools` and stays available.
    """
    names = {tool.__name__ for tool in tools}

    def before_model(
        callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        used = sum(
            1
            for content in llm_request.contents
            for part in content.parts or []
            if part.function_response and part.function_response.name in names
        )
        if used < max_calls or not llm_request.config.tools:
            return None
        kept = []
        for tool in llm_request.config.tools:
            if tool.function_declarations:
                decls = [d for d in tool.function_declarations if d.name not in names]
                if not decls:
                    continue
                tool = tool.model_copy(update={"function_declarations": decls})
            kept.append(tool)
        llm_request.config.tools = kept or None
        llm_request.append_instructions([BUDGET_SPENT_INSTRUCTION])
        logger.warning(
            "%s used %d tool calls (budget %d); tools withdrawn",
            callback_context.agent_name,
            used,
            max_calls,
        )
        return None

    return before_model


def return_argument_errors(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext, error: Exception
) -> dict[str, Any] | None:
    """on_tool_error_callback: a ValueError (rejected LLM arguments) becomes the tool result.

    The model can then retry with fixed arguments, within the budget, the same way ADK
    reports missing mandatory parameters. Any other error (BigQuery/Search outage)
    still fails the node and lands on the Blackboard as `error`.
    """
    if not isinstance(error, ValueError):
        return None
    logger.warning("%s rejected arguments %s: %s", tool.name, args, error)
    return {"error": f"Invalid arguments: {error}. Fix the arguments or answer without this tool."}
