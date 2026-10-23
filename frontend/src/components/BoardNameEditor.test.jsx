import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ModalsProvider } from '@mantine/modals';
import BoardNameEditor from './BoardNameEditor';
import { makeStore, renderWithApp } from '../test/render';

const NAMING = {
  template: '[{tag}] {category} {tier}',
  tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'TE', D: 'TZ', TODO: '(**TODO**)' },
};
const pl = (id, title) => ({ id, title, itemCount: 1 });

describe('BoardNameEditor', () => {
  it('focuses the rename button in the confirm dialog, so Enter confirms', async () => {
    const store = makeStore({ playlists: [pl('s', '[G] Rock T1'), pl('todo', '[G] Rock (**TODO**)')], naming: NAMING });
    renderWithApp(
      <ModalsProvider>
        <BoardNameEditor category="Rock" onRenamed={() => {}} />
      </ModalsProvider>,
      { store }
    );
    const input = screen.getByLabelText('Board name - click to rename');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Metal' } });
    fireEvent.blur(input);
    const confirm = await screen.findByRole('button', { name: 'Rename 2 on YouTube' });
    await waitFor(() => expect(confirm).toHaveFocus());
  });
});
