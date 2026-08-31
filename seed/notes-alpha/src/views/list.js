export function renderList(store) {
  return store.state.items.map((item) => item.title);
}
