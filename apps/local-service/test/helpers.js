import { createMemoryDemoService } from "../src/application/create-demo-service.js";

export function deterministicDependencies() {
  let id = 0;
  let tick = 0;
  const nextId = (prefix) => `${prefix}-${++id}`;
  const now = () => new Date(Date.UTC(2026, 8, 28, 12, 0, tick++)).toISOString();
  return { nextId, now };
}

export function demoService() {
  return createMemoryDemoService(deterministicDependencies());
}
