"""MIMORI Python SDK."""

from mimori.client import MIMORIClient
from mimori.handler import MIMORIHandler
from mimori.manual import log_event
from mimori.guardrail import (
    MIMORIGuardrail,
    SecurityViolation,
    GuardrailVerdict,
    LayaClassifier,
)
from mimori.semantic import OllamaSecurityReviewer
from mimori.laya_security import LayaSecurityReviewer, LayeredSecurityReviewer
from mimori.capabilities import ToolCapabilityPolicy

__version__ = "1.1.0"

__all__ = [
    "MIMORIClient",
    "MIMORIHandler",
    "MIMORIGuardrail",
    "SecurityViolation",
    "GuardrailVerdict",
    "LayaClassifier",
    "OllamaSecurityReviewer",
    "LayaSecurityReviewer",
    "LayeredSecurityReviewer",
    "ToolCapabilityPolicy",
    "__version__",
    "log_event",
    "MIMORICrewAIHandler",
    "MIMORIAutoGenHandler",
    "MIMORILlamaIndexHandler",
    "MIMORIDSPyHandler",
    "MIMORIOpenAIAgentsHandler",
    "MIMORISmolagentsHandler",
    "MIMORIPydanticAIHandler",
    "MIMORILangGraphHandler",
    "MIMORIGoogleADKHandler",
    "MIMORISemanticKernelHandler",
    "MIMORIHaystackHandler",
    "MIMORIMetaGPTHandler",
    "MIMORIAgnoHandler",
    "MIMORIComposioHandler",
    "MIMORIAnthropicHandler",
]

# Framework handlers — imported conditionally so the base SDK
# stays lightweight. Users install the handler they need via
# `pip install mimori-sdk[<extra>]` and import it directly.


def __getattr__(name: str):
    _lazy = {
        "MIMORICrewAIHandler": ("mimori.crewai_handler", "MIMORICrewAIHandler"),
        "MIMORIAutoGenHandler": ("mimori.autogen_handler", "MIMORIAutoGenHandler"),
        "MIMORILlamaIndexHandler": (
            "mimori.llamaindex_handler",
            "MIMORILlamaIndexHandler",
        ),
        "MIMORIDSPyHandler": ("mimori.dspy_handler", "MIMORIDSPyHandler"),
        "MIMORIOpenAIAgentsHandler": (
            "mimori.openai_agents_handler",
            "MIMORIOpenAIAgentsHandler",
        ),
        "MIMORISmolagentsHandler": (
            "mimori.smolagents_handler",
            "MIMORISmolagentsHandler",
        ),
        "MIMORIPydanticAIHandler": (
            "mimori.pydantic_ai_handler",
            "MIMORIPydanticAIHandler",
        ),
        "MIMORILangGraphHandler": (
            "mimori.langgraph_handler",
            "MIMORILangGraphHandler",
        ),
        "MIMORIGoogleADKHandler": (
            "mimori.google_adk_handler",
            "MIMORIGoogleADKHandler",
        ),
        "MIMORISemanticKernelHandler": (
            "mimori.semantic_kernel_handler",
            "MIMORISemanticKernelHandler",
        ),
        "MIMORIHaystackHandler": ("mimori.haystack_handler", "MIMORIHaystackHandler"),
        "MIMORIMetaGPTHandler": ("mimori.metagpt_handler", "MIMORIMetaGPTHandler"),
        "MIMORIAgnoHandler": ("mimori.agno_handler", "MIMORIAgnoHandler"),
        "MIMORIComposioHandler": ("mimori.composio_handler", "MIMORIComposioHandler"),
        "MIMORIAnthropicHandler": (
            "mimori.anthropic_handler",
            "MIMORIAnthropicHandler",
        ),
    }
    if name in _lazy:
        module_path, attr = _lazy[name]
        import importlib

        mod = importlib.import_module(module_path)
        return getattr(mod, attr)
    raise AttributeError(f"module 'mimori' has no attribute {name!r}")
