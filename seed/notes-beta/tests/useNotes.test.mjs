import assert from 'node:assert/strict';
import test from 'node:test';
import { createApi } from '../src/client/fetchClient.js';
import { useNotes } from '../src/composables/useNotes.js';

test('REQ-L1-001 get(id) title matches saveTitle', async () => {
  const store = useNotes(createApi());
  await store.load();
  await store.saveTitle('n1', 'Saved');
  assert.equal(store.get('n1').title, 'Saved');
});
