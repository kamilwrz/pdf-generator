"""Synthetic, non-personal inputs shared by latency measurements and tests.

Keep case IDs stable: baseline requests and later quality reviews are joined by
these IDs. No user documents or application database are read by the benchmark.
"""
from copy import deepcopy


SENTENCES = {
    "pl": "Przygotowywałem 4 raporty w Python, ale nie zarządzałem zespołem.",
    "en": "I prepared 4 reports in Python, but did not manage the team.",
    "de": "Ich erstellte 4 Berichte in Python, leitete aber nicht das Team.",
    "fr": "Je préparais 4 rapports en Python, mais je ne dirigeais pas l’équipe.",
    "es": "Preparaba 4 informes en Python, pero no dirigía el equipo.",
    "uk": "Я готував 4 звіти у Python, але не керував командою.",
    "it": "Preparavo 4 rapporti in Python, ma non gestivo il team.",
    "nl": "Ik maakte 4 rapporten in Python, maar leidde het team niet.",
}


def benchmark_cases():
    """Return 24 independent cases spanning every supported content language.

    Long documents exercise list reconstruction. Deliberately ambiguous leaves
    exercise the pre-call full-profile fallback. The Polish case includes an
    inflection error; other short cases exercise unnecessary-edit avoidance.
    Automated checks cannot establish editorial quality.
    """
    from app.services.cv.data import normalize_cv_data

    cases = []
    for language, sentence in SENTENCES.items():
        for variant in ("short", "long", "ambiguous"):
            action = {"short": "grammar", "long": "shorten", "ambiguous": "improve"}[variant]
            profile = normalize_cv_data({
                "name": "Alex Example", "email": "alex@example.test", "language": language,
                "summary": sentence + "  " + sentence if variant == "long" else sentence,
                "experience": [{
                    "title": "Analyst", "company": "Example Company", "period": "2020–2023",
                    "bullets": [sentence if variant == "ambiguous" else
                                f"{sentence} ({index + 1})" for index in range(12 if variant == "long" else 1)],
                }],
            })
            elements = [{"element_id": "summary", "category": "textarea", "content": profile["summary"]}]
            elements += [{"element_id": f"bullet-{index}", "category": "textarea", "bulletList": True,
                          "content": "• " + text}
                         for index, text in enumerate(profile["experience"][0]["bullets"])]
            if variant != "ambiguous":
                elements[0]["cvDataBindings"] = [{"path": ["summary"]}]
                for index, element in enumerate(elements[1:]):
                    element["cvDataBindings"] = [{"path": ["experience", 0, "bullets", index]}]
            cases.append({"id": f"{language}-{variant}", "language": language,
                          "action": action, "cv_data": profile, "elements": elements})
    return deepcopy(cases)
