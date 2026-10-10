// Trusted local composition only. Neither filenames nor weights are HTTP input.
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDiagonalAdapter } from '../domain/diagonal-adapter.js';
import { BODY_METRIC_MAX_BYTES, readBodyTopicMetric } from '../domain/body-topic-metric.js';
import { RIDGE_TOPIC_MAX_BYTES, RIDGE_PARAMETER_SHA256, readRidgeTopicAdapter } from '../domain/ridge-topic-adapter.js';

export const LOCAL_ADAPTER_PATH = fileURLToPath(new URL('../../data/diagonal-adapter-v1.json', import.meta.url));
export const LOCAL_BODY_METRIC_PATH = fileURLToPath(new URL('../../data/body-topic-metric-v1.json', import.meta.url));
export const LOCAL_RIDGE_ADAPTER_PATH = fileURLToPath(new URL('../../data/ridge1-topic-adapter-v1.json', import.meta.url));
const unavailable = () => ({ alternateAdapter: null, alternateBodyMetric: null, alternateRidgeAdapter: null });
const invalid = () => { throw new TypeError('Invalid installed Topic configuration'); };
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

function boundedArtifact(filename, limit, parse) {
  const target = path.resolve(filename);
  const initial = lstatSync(target);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.size < 1 || initial.size > limit ||
      !samePath(path.resolve(realpathSync(target)), target)) invalid();
  const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== initial.dev || opened.ino !== initial.ino || opened.size !== initial.size ||
        !samePath(path.resolve(realpathSync(target)), target)) invalid();
    const bytes = Buffer.alloc(limit + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = readSync(fd, bytes, used, bytes.length - used, used);
      if (!count) break;
      used += count;
    }
    const final = fstatSync(fd);
    if (used !== initial.size || used > limit || final.size !== opened.size || final.mtimeMs !== opened.mtimeMs ||
        final.ctimeMs !== opened.ctimeMs) invalid();
    return parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used))));
  } finally { closeSync(fd); }
}

export function readInstalledOwnerTopicConfiguration({ useLegacyE5 = false, useBodyMetric = false,
  ridgePath = LOCAL_RIDGE_ADAPTER_PATH, bodyPath = LOCAL_BODY_METRIC_PATH,
  adapterPath = LOCAL_ADAPTER_PATH } = {}) {
  if (useLegacyE5 !== true) {
    try { return { alternateAdapter: null, alternateBodyMetric: null,
      alternateRidgeAdapter: boundedArtifact(ridgePath, RIDGE_TOPIC_MAX_BYTES,
        value => readRidgeTopicAdapter(value, { expectedParameterSha256: RIDGE_PARAMETER_SHA256 })) }; }
    catch { return unavailable(); }
  }
  // The measured radius policy failed adjacent-story safety checks. Installation
  // alone must not activate it; explicit research composition can still inspect it.
  if (useBodyMetric !== true) {
    try { return { alternateAdapter: boundedArtifact(adapterPath, 16_384, readDiagonalAdapter), alternateBodyMetric: null,
      alternateRidgeAdapter: null }; }
    catch { return unavailable(); }
  }
  // Missing BODY permits the older diagonal experiment. A present but corrupt
  // BODY disables New; it must not silently change the selected geometry.
  try { lstatSync(bodyPath); }
  catch (error) {
    if (error.code !== 'ENOENT') return unavailable();
    try { return { alternateAdapter: boundedArtifact(adapterPath, 16_384, readDiagonalAdapter), alternateBodyMetric: null,
      alternateRidgeAdapter: null }; }
    catch { return unavailable(); }
  }
  try { return { alternateAdapter: null, alternateBodyMetric: boundedArtifact(bodyPath, BODY_METRIC_MAX_BYTES, readBodyTopicMetric),
    alternateRidgeAdapter: null }; }
  catch { return unavailable(); }
}
