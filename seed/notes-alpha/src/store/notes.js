export function createNotesStore(http) {
  const state = { items: [] };
  const mutations = {
    setItems(items) {
      state.items = items;
    },
    setTitle(id, title) {
      const note = state.items.find((item) => item.id === id);
      if (note) note.title = title;
    }
  };
  const actions = {
    async load() {
      const items = await http.get('/notes');
      mutations.setItems(items);
    },
    async saveTitle(id, title) {
      await http.put(`/notes/${id}`, { title });
      mutations.setTitle(id, title);
    }
  };
  return { state, mutations, actions };
}
