// Synthetic only: run the actual public projection worker, then hold its exact
// prepared response without any open repository transaction or main-thread CPU.
import '../concurrency-only-capabilities.js';
import { parentPort, workerData } from 'node:worker_threads';

const send = parentPort.postMessage.bind(parentPort);
const gate = new Int32Array(workerData.syntheticProjectionGate);
parentPort.postMessage = (message, ...arguments_) => {
  if (message?.ok === true && message.plan && Atomics.load(gate, 1) === 1) {
    send({ syntheticProjectionHeld: true, id: message.id });
    Atomics.wait(gate, 0, 0, 10000);
  }
  return send(message, ...arguments_);
};
await import('../../src/application/canonical-read-worker.js');
