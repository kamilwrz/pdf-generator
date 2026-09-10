/** Human-readable names for the normalized profile fields shared by review UI. */
export const interviewFields = { '/name': 'Imię i nazwisko', '/title': 'Stanowisko docelowe', '/email': 'E-mail', '/phone': 'Telefon', '/address': 'Miejscowość', '/summary': 'Podsumowanie', '/linkedin': 'LinkedIn', '/github': 'GitHub', '/website': 'Strona internetowa' };

/** Describe evidence without displaying persistence paths to the candidate. */
export function factLabel(fact) {
  if (interviewFields[fact.path]) return interviewFields[fact.path];
  if (fact.path?.startsWith('/experience/')) return 'Doświadczenie zawodowe';
  if (fact.path?.startsWith('/education/')) return 'Edukacja';
  if (fact.path?.startsWith('/custom_sections/')) return 'Sekcja dodatkowa / projekt';
  if (fact.path?.startsWith('/skills/')) return 'Umiejętności';
  if (fact.path?.startsWith('/languages/')) return 'Języki';
  return fact.kind === 'gap' ? 'Brak doświadczenia' : fact.kind === 'framing' ? 'Zatwierdzone sformułowanie' : 'Informacja zawodowa';
}
