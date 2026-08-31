export function NoteList(store) {
  return store.state.items.map((item) => item.title);
}
