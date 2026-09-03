"""Generate ``docs/PROMPTS.md`` from current assistant handler functions.

The generator resolves function boundaries and line numbers at runtime so
removing or moving an action cannot leave the prompt reference silently stale.

Usage from the repository root:
    python scripts/generate_prompts_md.py
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "backend" / "app" / "services" / "ai_assistant_service.py"
OUT = ROOT / "docs" / "PROMPTS.md"


@dataclass(frozen=True)
class ActionPrompt:
    action: str
    label: str
    function_name: str
    purpose: str


ACTIONS = (
    ActionPrompt("rating", "Sprawdź CV", "_rate_cv", "ocenia jakość i kompletność treści CV"),
    ActionPrompt("position_rating", "Dopasuj do oferty", "_tailor_cv_to_position", "porównuje CV z ofertą i proponuje potwierdzone poprawki"),
    ActionPrompt("grammar", "Sprawdź błędy", "_fix_grammar", "poprawia gramatykę, ortografię i interpunkcję"),
    ActionPrompt("language", "Popraw język", "_check_style", "ulepsza styl w języku bieżącego CV"),
    ActionPrompt("improve", "Wzmocnij treść", "_improve_content", "wzmacnia opisy bez wymyślania faktów"),
    ActionPrompt("shorten", "Skróć CV", "_shorten_content", "kondensuje treść bez zmiany znaczenia"),
    ActionPrompt("ats_score", "Sprawdź ATS", "_ats_score", "łączy deterministyczny odczyt PDF z oceną struktury"),
    ActionPrompt("translate", "Przetłumacz CV", "_translate_cv", "tłumaczy pełną treść i profil na wybrany język"),
    ActionPrompt("chat", "Czat", "_chat", "odpowiada na pytania o CV i przygotowuje bezpieczne operacje do akceptacji"),
)


def function_block(source: str, function_name: str) -> tuple[int, int, str]:
    """Return one top-level Python function with verified current line numbers."""
    pattern = re.compile(rf"^def {re.escape(function_name)}\(", re.MULTILINE)
    match = pattern.search(source)
    if match is None:
        raise RuntimeError(f"Missing function: {function_name}")
    next_function = re.search(r"^def [A-Za-z_]\w*\(", source[match.end():], re.MULTILINE)
    end_offset = match.end() + next_function.start() if next_function else len(source)
    start_line = source.count("\n", 0, match.start()) + 1
    end_line = source.count("\n", 0, end_offset)
    return start_line, end_line, source[match.start():end_offset].rstrip()


def main() -> None:
    """Write the current action inventory and live handler prompt sources."""
    source = SERVICE.read_text(encoding="utf-8")
    parts = [
        "# PROMPTS.md — prompty AI w CV Studio\n\n",
        "Ten plik jest generowany z aktualnego kodu. Asystent udostępnia cztery cele główne: ",
        "**Sprawdź CV**, **Popraw treść**, **Dopasuj do oferty** i **Przetłumacz CV**. ",
        "Usunięte akcje `design_rating` oraz `layout` nie są częścią interfejsu ani API.\n\n",
        "Po zmianie promptów uruchom:\n\n",
        "```bash\npython scripts/generate_prompts_md.py\n```\n\n",
        "## Mapa akcji\n\n",
        "| Akcja API | Cel UI | Handler | Odpowiedzialność |\n",
        "| --- | --- | --- | --- |\n",
    ]
    blocks: list[tuple[ActionPrompt, int, int, str]] = []
    for item in ACTIONS:
        start, end, block = function_block(source, item.function_name)
        blocks.append((item, start, end, block))
        parts.append(
            f"| `{item.action}` | {item.label} | `{item.function_name}` "
            f"(linie {start}–{end}) | {item.purpose} |\n"
        )

    parts.append(
        "\n`grammar`, `language`, `improve` i `shorten` używają wykrytego lub jawnie "
        "wybranego `cv_language`. Akcja `translate` wymaga `target_language`; rady UI "
        "pozostają po polsku, a proponowana treść jest zwracana w języku docelowym.\n\n"
    )

    for item, start, end, block in blocks:
        parts.extend(
            [
                f"## `{item.action}` — {item.label}\n\n",
                f"Handler `{item.function_name}` w `backend/app/services/ai_assistant_service.py`, "
                f"linie {start}–{end}. Funkcja {item.purpose}.\n\n",
                "```python\n",
                block,
                "\n```\n\n",
            ]
        )

    parts.append("*Wygenerowano przez `scripts/generate_prompts_md.py`.*\n")
    OUT.write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
