import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readPresentationSourceSync as readFileSync } from "../../../scripts/read-presentation-source.mjs";

const policy = readFileSync(new URL('./PrivacyPage.jsx', import.meta.url), 'utf8');
const account = readFileSync(new URL('./AccountPage.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');

describe('privacy surfaces', () => {
  it('publishes controller, contact, processors, transfers, retention, and rights', () => {
    for (const text of ['Kamil Wrzochalski', 'kwrzochalski@gmail.com', 'Render Services', 'Amazon Web Services', 'Cloudflare', 'OpenAI', 'Google', 'Resend', 'Stripe', 'home.pl', 'Przekazywanie poza EOG', 'Jak długo przechowujemy dane', 'Twoje prawa', '18 lat']) {
      assert.match(policy, new RegExp(text.replace('.', '\\.')));
    }
  });

  it('keeps the policy routed and adds accessible self-service controls', () => {
    assert.match(app, /import\('\.\/pages\/Site\/PrivacyPage'\)/);
    assert.match(app, /localStorage\.removeItem\('cvstudio\.guest\.events'\)/);
    assert.match(account, /Pobierz moje dane/);
    assert.match(account, /Usuń konto trwale/);
    assert.match(account, /role="alertdialog"/);
    assert.match(account, /confirmation !== username/);
  });
});
