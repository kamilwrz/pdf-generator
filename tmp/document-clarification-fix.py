from pathlib import Path
import re
root=Path('.')
en=('Clarification loop protection: only a changed scalar explicitly rejected by verification and citing current profile facts can become a question. Technical errors, unknown paths, dependent record rejections and unchanged fields use the confirmed fallback without asking the user to diagnose them. The disputed proposal is always visible and labelled as unconfirmed, beside its section/role label. Clarifications have a separate position/total counter and a cumulative budget of five answered or explicitly deferred questions per session; regeneration cannot reset it. Normalized claim and question fingerprints suppress repeats across field reordering, case and punctuation changes. This is deterministic duplicate detection, not semantic equivalence detection; reworded claims may remain distinct, but the budget still bounds them. Discovery also stops repeated wording under a new topic without an automatic paid retry.\n\n'
    'On owner-authorized `GET /ai/interviews/{id}`, `repair_clarification_state` repairs an active legacy queue, preserves retained question IDs and every saved answer, and persists only changed state using revision compare-and-swap. Repeated reads are stable; a concurrent edit can return 409 and requires reloading. An exhausted queue returns to fact review or the existing confirmed preview. Repair does not touch the career profile, documents or credits. Session JSON adds optional question `record_label` and `dismissed_clarification_keys`; no database migration or new dependency is required. `preview` and `next` reject attempts to restart paid work while clarification is pending. Tests reproduce eight duplicate legacy prompts, owner isolation, free repair, answer replay, budget exhaustion and changed-topic repetition.')
pl=('Ochrona przed pętlą doprecyzowań: pytaniem może zostać tylko zmienione pole tekstowe jawnie zakwestionowane przez weryfikację i odwołujące się do aktualnych faktów profilu. Błędy techniczne, nieznane ścieżki, zależne odrzucenia wpisu oraz niezmienione pola korzystają z potwierdzonej wersji bez proszenia użytkownika o ich diagnozę. Sporna propozycja jest zawsze widoczna, oznaczona jako niepotwierdzona i opisana nazwą sekcji/roli. Doprecyzowania mają osobny licznik pozycji/liczby pytań i łączny budżet pięciu pytań z odpowiedzią lub jawnym pominięciem w sesji; regeneracja go nie resetuje. Znormalizowane odciski treści i pytania blokują powtórki po zmianie kolejności pól, wielkości liter i interpunkcji. To deterministyczne wykrywanie duplikatów, nie równoważności znaczeniowej; przeformułowane twierdzenia mogą pozostać odrębne, ale nadal ogranicza je budżet. Zwykły wywiad również zatrzymuje powtórzone pytanie z nowym identyfikatorem tematu, bez automatycznej płatnej próby.\n\n'
    'Przy uwierzytelnionym odczycie właściciela `GET /ai/interviews/{id}` funkcja `repair_clarification_state` porządkuje aktywną starszą kolejkę, zachowuje ID pozostawionych pytań i wszystkie zapisane odpowiedzi, a zmieniony stan utrwala z kontrolą rewizji. Kolejne odczyty są stabilne; równoległa edycja może zwrócić 409 i wymaga ponownego wczytania. Wyczerpana kolejka przechodzi do przeglądu faktów albo istniejącego potwierdzonego podglądu. Naprawa nie zmienia profilu zawodowego, dokumentów ani kredytów. JSON sesji dodaje opcjonalne `record_label` pytania i `dismissed_clarification_keys`; nie wymaga migracji bazy ani nowej zależności. `preview` i `next` odrzucają próby ponownego uruchomienia płatnej pracy podczas oczekiwania na doprecyzowanie. Testy odtwarzają osiem jednakowych starszych pytań, izolację właścicieli, bezpłatną naprawę, ponowienie odpowiedzi, wyczerpanie limitu i powtórzenie z nowym tematem.')
for filename in ('README.md','docs/INTERVIEWS.md'):
    p=root/filename
    s=p.read_text(encoding='utf-8')
    if filename=='README.md':
        marker='Uncertain AI proposals now lead to clarification before the final preview.'
        markerpl='Przed końcowym podglądem' # Locate the Polish clarification paragraph by its module reference.
        lines=s.splitlines()
        enindex=next(i for i,line in enumerate(lines) if line.startswith(marker))
        plboundary=lines.index('# Polski')
        plindex=next(i for i,line in enumerate(lines) if i>plboundary and '`interview_clarification.py`' in line and '|' not in line and len(line)>300)
        lines[enindex]+='\n\n'+en
        lines[plindex]+='\n\n'+pl
        s='\n'.join(lines)+'\n'
        s=s.replace('eight creation/enrichment questions (including clarifications)', 'eight creation/enrichment questions (including discovery follow-ups)')
        s=s.replace('osiem przy tworzeniu/uzupełnianiu (łącznie z doprecyzowaniami)', 'osiem przy tworzeniu/uzupełnianiu (łącznie z dopytaniem w rozmowie)')
    else:
        s=s.replace('### Transactions, idempotency and recovery', '### Transactions, idempotency and recovery')
        # Insert before the provider/evidence discussion; keep complete EN/PL parity.
        paragraphs=s.split('\n\n')
        for i in range(len(paragraphs)-1,-1,-1):
            if paragraphs[i].startswith('Before the final preview, unresolved proposals'):
                paragraphs.insert(i+1,en)
            elif paragraphs[i].startswith('Przed końcowym podglądem nierozstrzygnięte propozycje'):
                paragraphs.insert(i+1,pl)
        s='\n\n'.join(paragraphs)
        s=s.replace('including follow-up questions', 'including discovery follow-up questions')
        s=s.replace('łącznie z doprecyzowaniami.', 'łącznie z dopytaniem w rozmowie.')
        enref='- [WAI form labels](https://www.w3.org/WAI/tutorials/forms/labels/) — visible labels and instructions that explain what an answer field expects.\n'
        plref='- [Etykiety formularzy WAI](https://www.w3.org/WAI/tutorials/forms/labels/) — widoczne etykiety i instrukcje wyjaśniające oczekiwaną odpowiedź.\n'
        halves=s.split('# Polski',1)
        for n,ref in enumerate((enref,plref)):
            halves[n]=halves[n].replace('- [FastAPI request bodies]',ref+'- [FastAPI request bodies]')
        s='# Polski'.join(halves)
    p.write_text(s,encoding='utf-8')
p=root/'DESIGN.md'
s=p.read_text(encoding='utf-8')
s=s.replace('- Uncertain AI proposals must lead to a clarification step before final preview.', '- Specific unresolved factual proposals lead to a clarification step before final preview; technical failures and collateral rejections use the confirmed fallback without a user question.')
s=s.replace('Show one question at a time; label any quoted AI proposal as unconfirmed.', 'Show one question at a time, a separate clarification position/total counter and the disputed proposal in an always-visible labelled quote. Never hide essential question context in a disclosure or use “Treść CV” as its subject. The cumulative clarification budget is five answered or explicitly deferred questions per session; regeneration cannot reset it. Deduplicate question wording and claims across path changes, and repair resumed legacy queues without deleting saved answers or charging credits.')
s=s.replace('Show one Polish question with its reason and an honest answered/maximum counter: five questions for tailoring, eight for creation/enrichment, including clarifications.', 'Show one Polish question with its reason and an honest saved-answer count: initial discovery allows five questions for tailoring and eight for creation/enrichment, including discovery follow-ups. Verification clarifications use their separate counter and cumulative cap above.')
p.write_text(s,encoding='utf-8')
# Verify and synchronize complete-module references for every changed module.
p=root/'README.md'
s=p.read_text(encoding='utf-8')
paths=['backend/app/services/interview_clarification.py','backend/app/services/interview_service.py','backend/app/api/routes/interviews.py','backend/tests/test_interviews.py','backend/tests/test_interview_recovery.py','frontend/src/components/ai/Interview/InterviewFlow.jsx','frontend/src/components/ai/Interview/Interview.module.css','frontend/src/components/ai/Interview/Interview.runtime.test.jsx','frontend/e2e/interviews.spec.js']
for path in paths:
    count=len((root/path).read_text(encoding='utf-8-sig').splitlines())
    s=re.sub(r'(`'+re.escape(path)+r'`[^\n]*?1[–-])\d+',lambda m:m[1]+str(count),s)
s=s.replace('clarification_queue, start_clarifications, finish_clarification_answer','clarification_queue, repair_clarification_state, start_clarifications, finish_clarification_answer')
p.write_text(s,encoding='utf-8')
