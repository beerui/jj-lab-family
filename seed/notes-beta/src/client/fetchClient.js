export function createApi(memory = new Map([['n1', { id: 'n1', title: 'First note' }]])) {
  return {
    async request(method, url, body) {
      if (method === 'GET') return [...memory.values()];
      const id = String(url).split('/').pop();
      const prev = memory.get(id) || { id };
      memory.set(id, { ...prev, ...body, id });
      return memory.get(id);
    }
  };
}
