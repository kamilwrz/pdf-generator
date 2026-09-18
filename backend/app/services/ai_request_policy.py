"""Select inference effort without changing billing action or provider model.

Interview operations must not inherit the editor's ``improve`` setting: that
same billing action also represents independent factual verification.
"""
import re


_EDITOR_ACTIONS = frozenset({"grammar", "language", "improve", "shorten", "translate",
                             "rating", "position_rating", "ats_score", "chat"})
_INTERVIEW_OPERATIONS = frozenset({"analysis", "next", "preview", "editorial", "verify",
                                  "answer-help", "answer-help-verify", "fit-shorten", "fit-verify"})
_GPT56_EFFORTS = frozenset({"none", "low", "medium", "high", "xhigh", "max"})


def task_name(action: str = "", *, workflow: str = "assistant", operation: str = "") -> str:
    """Return a bounded, privacy-safe task label; discard arbitrary input text.

    Fit attempt numbers belong to recovery keys, not metric cardinality.
    Unknown tasks deliberately retain the conservative high setting.
    """
    if workflow == "interview":
        operation = re.sub(r"^(fit-(?:shorten|verify))-\d+$", r"\1", operation)
        return f"interview:{operation if operation in _INTERVIEW_OPERATIONS else 'unknown'}"
    if workflow == "scoped":
        return f"scoped:{action if action in {'language', 'shorten', 'improve'} else 'unknown'}"
    return f"assistant:{action if action in _EDITOR_ACTIONS else 'unknown'}"


def reasoning_effort(model: str, action: str, *, task: str | None = None, override: str = "") -> str | None:
    """Resolve and validate effort before provider I/O, raising on bad config.

    An explicit override wins, including verification. GPT-4 models cannot
    receive reasoning_effort. Unknown families fail locally rather than spend
    a request on guessed capabilities; add verified capabilities here when
    introducing a model. Snapshots share their family's contract.
    """
    selected_task = task or task_name(action)
    if selected_task in {"assistant:grammar", "scoped:language"}:
        default = "low"
    elif selected_task in {
        "assistant:language", "assistant:improve", "assistant:shorten", "assistant:translate",
        "scoped:shorten", "scoped:improve", "interview:next", "interview:answer-help",
        "interview:editorial", "interview:fit-shorten",
    }:
        default = "medium"
    else:
        default = "high"
    requested = override.strip().lower()
    if model.startswith(("gpt-4o", "gpt-4.1")):
        if requested:
            raise ValueError("The configured model does not support reasoning effort")
        return None
    if model.startswith(("gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol")):
        allowed = _GPT56_EFFORTS
    elif model.startswith(("gpt-5.4", "gpt-5.2")):
        allowed = _GPT56_EFFORTS - {"max"}
    elif model.startswith("gpt-5.1"):
        allowed = {"none", "low", "medium", "high"}
    elif model == "gpt-5" or model.startswith(("gpt-5-mini", "gpt-5-nano", "gpt-5-20")):
        allowed = {"minimal", "low", "medium", "high"}
    else:
        raise ValueError("No verified reasoning policy for the configured model")
    selected = requested or default
    if selected not in allowed:
        raise ValueError("Unsupported reasoning effort for the configured model")
    return selected
