export function createNote(id, title) {
  return { id, title: String(title || '') };
}
