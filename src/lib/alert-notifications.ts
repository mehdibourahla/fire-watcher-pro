export type PersonalNotification = { id: string; title: string; body: string };

export function startAlertNotifications(deps: {
  onUser: (callback: (id: string | null) => void) => () => void;
  subscribe: (
    id: string,
    callback: (row: PersonalNotification) => Promise<void>,
  ) => () => void;
  pushEnabled: (id: string) => Promise<boolean>;
  refresh: () => void;
  show: (row: PersonalNotification) => void;
}) {
  let current: string | null = null;
  let generation = 0;
  let detach: (() => void) | undefined;
  const unsubscribe = deps.onUser((id) => {
    if (id === current) return;
    current = id;
    const version = ++generation;
    detach?.();
    detach = undefined;
    if (!id) return;
    detach = deps.subscribe(id, async (row) => {
      if (version !== generation) return;
      deps.refresh();
      if ((await deps.pushEnabled(id)) && version === generation)
        deps.show(row);
    });
  });
  return () => {
    ++generation;
    unsubscribe();
    detach?.();
  };
}
