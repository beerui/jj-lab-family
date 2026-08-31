import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttp } from '../src/api/httpClient.js';
import { createNotesStore } from '../src/store/notes.js';

test('REQ-L1-001 vuex-shaped store persists title', async () => {
  const store = createNotesStore(createHttp());
  await store.actions.load();
  await store.actions.saveTitle('n1', 'Saved');
  assert.equal(store.state.items.find((item) => item.id === 'n1').title, 'Saved');
});
