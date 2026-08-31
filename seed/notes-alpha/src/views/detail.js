export function renderDetail(store, id) {
  return store.state.items.find((item) => item.id === id) || null;
}
