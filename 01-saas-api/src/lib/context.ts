import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  correlationId: string;
  userId?: string;
  tenantId?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}
