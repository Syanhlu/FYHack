// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DraftCard, Sources } from '../apps/extension/src/components/Results';
import { manualProfile } from '../packages/contracts/src';

afterEach(cleanup);
describe('user-controlled actions', () => {
  it('copies the edited draft only after confirming the current profile', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const current = vi.fn(async () => true);
    render(
      <DraftCard
        draft={{
          id: 'd',
          label: 'Invitation',
          text: 'Original',
          evidenceIds: ['e1'],
          userContextIds: [],
        }}
        beforeCopy={current}
      />,
    );
    fireEvent.change(screen.getByLabelText('Invitation'), { target: { value: 'My own words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('My own words'));
    expect(current).toHaveBeenCalledOnce();
  });
  it('does not copy stale content', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <DraftCard
        draft={{
          id: 'd',
          label: 'Invitation',
          text: 'Original',
          evidenceIds: ['e1'],
          userContextIds: [],
        }}
        beforeCopy={async () => false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('profile changed'),
    );
    expect(writeText).not.toHaveBeenCalled();
  });
  it('renders source text as text, including hostile markup', () => {
    const profile = manualProfile('<script>alert(1)</script> I like books.');
    const { container } = render(<Sources ids={['e1']} evidence={profile.evidence} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });
});
