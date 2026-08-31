export function createHttp(memory = new Map([['n1', { id: 'n1', title: 'First note' }]])) {
  return {
    async get() {
      return [...memory.values()];
    },
    async put(url, body) {
      const id = String(url).split('/').pop();
      const prev = memory.get(id) || { id };
      memory.set(id, { ...prev, ...body, id });
      return memory.get(id);
    }
  };
}
