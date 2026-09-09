import { AsyncLocalStorage } from "node:async_hooks";

export type SourceArchiveContext = {
  jobId: string;
  attempt: number;
  contractVersion: number;
  parserVersion?: string;
};
const archiveContext = new AsyncLocalStorage<SourceArchiveContext>();

export function withSourceArchiveContext<T>(
  context: SourceArchiveContext,
  fn: () => T,
): T {
  return archiveContext.run(context, fn);
}

export function getSourceArchiveContext(): SourceArchiveContext | undefined {
  return archiveContext.getStore();
}
