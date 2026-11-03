/** Track requests across owner epochs: aborting a view never proves a write rolled back. */
export function createCartActivity() {
  const active = new Set<Promise<unknown>>();
  return {
    busy: () => active.size > 0,
    track<T>(task: Promise<T>): Promise<T> {
      active.add(task);
      void task.then(
        () => active.delete(task),
        () => active.delete(task),
      );
      return task;
    },
    async quiesce() {
      // Reset blocks admission first. Network calls already started keep their deadlines.
      while (active.size) await Promise.allSettled([...active]);
    },
  };
}
