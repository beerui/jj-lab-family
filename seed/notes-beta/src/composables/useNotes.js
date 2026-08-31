export function createNotesStore(api) {
  const state = { items: [] };
  async function load() {
    state.items = await api.request('GET', '/notes');
  }
  async function saveTitle(id, title) {
    await api.request('PUT', `/notes/${id}`, { title });
    const note = state.items.find((item) => item.id === id);
    if (note) note.title = title;
  }
  function get(id) {
    return state.items.find((item) => item.id === id) || null;
  }
  return { state, load, saveTitle, get };
}

export function useNotes(api) {
  return createNotesStore(api);
}
