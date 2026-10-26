import { parentPort, workerData } from 'node:worker_threads';
import { buildTopicSpaceHierarchy } from '../domain/topic-space-grouping.js';
import { RIDGE_PARAMETER_SHA256, readRidgeTopicAdapter, createRidgeTopicTransform } from '../domain/ridge-topic-adapter.js';
try {
  const transform = workerData.topicAdapter ? createRidgeTopicTransform(readRidgeTopicAdapter(workerData.topicAdapter,
    { expectedParameterSha256: RIDGE_PARAMETER_SHA256 })) : null;
  const entries = workerData.entries.map(entry => ({ ...entry,
    vector: entry.vector && transform ? Array.from(transform(entry.vector)) : entry.vector }));
  parentPort.postMessage({ ok: true, hierarchy: buildTopicSpaceHierarchy(entries,
  { generation: workerData.generation }) }); }
catch (error) { parentPort.postMessage({ ok: false, capacity: error?.code === 'TOPIC_SPACE_CAPACITY' }); }
