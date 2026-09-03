export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  constructor(protected ctx?: any, protected env?: any) {}
}

export interface WorkflowEvent<T = unknown> {
  payload: T;
  instanceId?: string;
  timestamp?: Date;
}

export interface WorkflowStep {
  do: <T>(name: string, fn: () => Promise<T> | T) => Promise<T>;
  sleep: (name: string, duration: number | string) => Promise<void>;
  sleepUntil: (name: string, timestamp: number | Date) => Promise<void>;
  waitForEvent: <T>(name: string, options: { type: string; timeout?: number | string }) => Promise<T>;
}
