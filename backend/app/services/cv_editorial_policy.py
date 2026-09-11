"""Shared factual-preservation policy for scoped and interview style editing."""

STYLE_INSTRUCTION = (
    "Popraw składnię, profesjonalny styl, czytelność i spójność. "
    "Nie zmieniaj znaczenia ani zakresu odpowiedzialności."
)
FACT_PRESERVATION = """Zachowaj wszystkie fakty, negacje, liczby, nazwy technologii,
poziomy umiejętności, stopień odpowiedzialności i czas zgodny z okresem pracy.
Nie zamieniaj wsparcia na kierowanie. Nie przenoś faktów pomiędzy fragmentami lub
rekordami. Nie dodawaj placeholderów do poprawek. Jeśli brakuje dowodów, pozostaw tekst lub
popraw jedynie styl."""
