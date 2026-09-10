import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UsageMetric } from './SitePrimitives';

afterEach(cleanup);

describe('account usage presentation', () => {
  it('keeps real over-limit usage visible while bounding the accessible meter', () => {
    render(<dl><UsageMetric label="Kredyty AI" used={230} limit={200} /></dl>);
    expect(screen.getByText('230')).toBeVisible();
    const meter = screen.getByRole('meter', { name: 'Kredyty AI: wykorzystano 230 z 200' });
    expect(meter).toHaveAttribute('value', '200');
    expect(meter).toHaveAttribute('max', '200');
  });

  it.each([
    [null, 'Bez ograniczeń w Twoim planie'],
    [0, 'Niedostępne w Twoim planie'],
    [undefined, 'Limit niedostępny'],
  ])('does not invent percentages for limit %s', (limit, message) => {
    render(<dl><UsageMetric label="Projekty CV" used={5} limit={limit} /></dl>);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.getByText(message)).toBeVisible();
  });
});
