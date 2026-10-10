// Fictional-vector cost check, without E5 loading, corpus access or weight output.
import { DIM, metricVector, unit } from './core.js';

const lower = new Float64Array(DIM * DIM), mean = new Float64Array(DIM);
for (let i = 0; i < DIM; i++) for (let j = 0; j <= i; j++)
  lower[i * DIM + j] = i === j ? 1 : .001 * Math.sin(i + j);
const metric = { mean, lower };
const vector = unit(Float64Array.from({ length: DIM }, (_, i) => Math.sin(i + 1)));
for (let i = 0; i < 100; i++) metricVector(vector, metric);
const at = performance.now();
for (let i = 0; i < 1000; i++) metricVector(vector, metric);
process.stdout.write(`${JSON.stringify({ fictionalVectors: 1000, dimensions: DIM,
  totalTransformMs: Math.round(performance.now() - at),
  packedFloat64ParameterBytes: (DIM * (DIM + 1) / 2 + DIM) * 8 })}\n`);
