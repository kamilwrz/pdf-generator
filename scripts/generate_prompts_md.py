"""Generate ``docs/PROMPTS.md`` from current CV editorial policies and handlers.

The generator resolves function boundaries and line numbers at runtime so
removing or moving an action cannot leave the prompt reference silently stale.

Usage from the repository root:
    python scripts/generate_prompts_md.py
"""
from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "backend" / "app" / "services" / "ai_assistant_service.py"
MATCHING_POLICY = ROOT / "backend" / "app" / "services" / "job_matching_policy.py"
EDITORIAL_POLICY = ROOT / "backend" / "app" / "services" / "cv_editorial_policy.py"
AUDIT_POLICY = ROOT / "backend" / "app" / "services" / "cv_audit.py"
SCOPED_SERVICE = ROOT / "backend" / "app" / "services" / "scoped_ai.py"
INTERVIEW_EDITORIAL = ROOT / "backend" / "app" / "services" / "interview_editorial.py"
OUT = ROOT / "docs" / "PROMPTS.md"


@dataclass(frozen=True)
class ActionPrompt:
    action: str
    label: str
    function_name: str
    purpose: str


ACTIONS = (
    ActionPrompt("rating", "Sprawdź CV", "_rate_cv", "przeprowadza audyt 12 kategorii treści z dowodami, licznikami i kolejnymi akcjami; ATS i oferta pozostają osobnymi badaniami"),
    ActionPrompt("position_rating", "Dopasuj do oferty", "_tailor_cv_to_position", "analizuje CV wobec oferty; dopasowaną treść przygotowuje wywiad"),
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
    # Python syntax boundaries exclude constants and comments belonging to the
    # next handler, even with multiline signatures or decorators.
    for node in ast.parse(source).body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function_name:
            start_line = min([node.lineno, *(item.lineno for item in node.decorator_list)])
            end_line = node.end_lineno
            if end_line is None:
                raise RuntimeError(f"Missing function end: {function_name}")
            block = "\n".join(source.splitlines()[start_line - 1:end_line])
            return start_line, end_line, block
    raise RuntimeError(f"Missing function: {function_name}")


def module_section(path: Path, title: str, description: str) -> str:
    """Render a complete policy module with its verified repository-relative path."""
    source = path.read_text(encoding="utf-8").rstrip()
    return (
        f"## {title}\n\n"
        f"Plik `{path.relative_to(ROOT).as_posix()}`, linie 1–{len(source.splitlines())}. "
        f"{description}\n\n```python\n{source}\n```\n\n"
    )


def handler_section(path: Path, name: str, title: str, description: str) -> str:
    """Render a scope-specific handler without importing application dependencies."""
    start, end, block = function_block(path.read_text(encoding="utf-8"), name)
    return (
        f"## {title}\n\n"
        f"Handler `{name}` w `{path.relative_to(ROOT).as_posix()}`, linie {start}–{end}. "
        f"{description}\n\n```python\n{block}\n```\n\n"
    )


def main() -> None:
    """Write action adapters and shared policies using only the standard library."""
    source = SERVICE.read_text(encoding="utf-8")
    parts = [
        "# PROMPTS.md — prompty AI w CV Studio\n\n",
        "Ten plik jest generowany z aktualnego kodu. Asystent udostępnia cztery cele główne: ",
        "**Sprawdź CV**, **Popraw treść**, **Dopasuj do oferty** i **Przetłumacz CV**. ",
        "Usunięte akcje `design_rating` oraz `layout` nie są częścią interfejsu ani API.\n\n",
        "Po zmianie promptów uruchom:\n\n",
        "```bash\npython scripts/generate_prompts_md.py\n```\n\n",
        "Końcowa polityka `ui_language_policy()` w `app/core/localisation.py` jest dołączana w `_gpt`: pytania, rady i uzasadnienia używają języka UI; treść poprawek zachowuje język CV. Ta polityka ma pierwszeństwo przed historycznymi instrukcjami polskiego języka w poniższych promptach.\n\n",
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
        "używają języka żądania (PL lub EN), a proponowana treść jest zwracana w języku docelowym.\n\n"
        "Powyższa mapa wskazuje klasyczne handlery płótna. Dla dokumentu z `cv_data` "
        "akcje treści korzystają z `_rewrite_profile_content`; obecność `scoped_content` "
        "kieruje obsługiwane akcje do `review_scoped_content`. Wywiad dodaje etap "
        "`EDITORIAL_TASK` przed niezależną weryfikacją. Pełne źródła tych adapterów "
        "i wspólnych zasad znajdują się poniżej.\n\n"
    )

    parts.append(module_section(
        AUDIT_POLICY, "Audyt CV: rubryka, dowody i liczniki",
        "`CV_AUDIT_POLICY` i `CV_AUDIT_RESPONSE_SCHEMA` określają diagnozę bez zmian dokumentu. "
        "`build_cv_audit_result` sprawdza cytaty względem płótna, usuwa duplikaty, oblicza liczniki "
        "oraz zachowuje kategorie nieocenione. Zalecenia kierują do wyspecjalizowanych funkcji; "
        "brakujące fakty wymagają pytań. Audyt nie zwraca procentowej oceny ani poprawek.",
    ))
    parts.append(module_section(
        EDITORIAL_POLICY,
        "Wspólny standard jakości języka CV",
        "`STYLE_REVIEW_POLICY` łączy `STYLE_INSTRUCTION`, `STYLE_EXAMPLES` i `FACT_PRESERVATION`. "
        "Cały asystent, zaznaczone fragmenty oraz redakcja po wywiadzie stosują ten sam standard. "
        "`IMPROVE_INSTRUCTION` dodatkowo podkreśla potwierdzony wkład. Skracanie zachowuje własny "
        "zakres redukcji; globalne skracanie pomija przykłady, aby ograniczyć koszt wejścia. "
        "Gramatyka i tłumaczenie pozostają osobnymi, węższymi zadaniami. "
        "Wspólna polityka nie poszerza dozwolonych pól ani nie zmienia formatów odpowiedzi.",
    ))

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

    parts.append(handler_section(
        SERVICE, "_rewrite_profile_content", "Redakcja kanonicznego profilu CV",
        "Przy istniejącym `cv_data` zwraca kompletny `updated_cv_data` i poprawki płótna "
        "do akceptacji. Wspólny standard jest dołączany zależnie od wybranej akcji; "
        "jej reguły nadal określają język, zakres i dozwolone zmiany struktury.",
    ))
    parts.append(handler_section(
        SCOPED_SERVICE, "review_scoped_content", "Redakcja wybranego zakresu",
        "Wysyła wyłącznie wybrane fragmenty oraz kontekst tylko do odczytu. "
        "Walidacja zachowuje identyfikatory, liczby, rozpoznane narzędzia i pojedyncze umiejętności. "
        "`improve` może osobno zwrócić `achievement_templates` z pytaniami; "
        "niepotwierdzone uzupełnienia nie trafiają do gotowych poprawek.",
    ))
    parts.append(module_section(
        INTERVIEW_EDITORIAL, "Redakcja i wersjonowanie generowania po wywiadzie",
        "`EDITORIAL_TASK` stosuje wspólny standard wyłącznie do edytowalnej prozy. "
        "Zwraca pełne `path/value`, zachowuje dowody i zaakceptowane `framing`; "
        "po walidacji następuje niezależna weryfikacja faktów. Wersja procesu unieważnia "
        "ponowne użycie etapów starszej polityki, bez blokowania odczytu zapisanych podglądów.",
    ))
    # Include imported policies as well as handlers so readers can inspect the
    # actual shared instructions instead of seeing only interpolation names.
    parts.append(module_section(
        MATCHING_POLICY, "Wspólna polityka dopasowania i redakcji CV",
        "Analiza asystenta i analiza w wywiadzie korzystają z tych samych reguł wymagań i dowodów. "
        "Wywiad w trybie `tailor` dodaje osobne instrukcje przygotowania oraz redakcji treści; "
        "niezależna weryfikacja nadal sprawdza wynik względem potwierdzonych faktów.",
    ))
    parts.append("*Wygenerowano przez `scripts/generate_prompts_md.py`.*\n")
    OUT.write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
