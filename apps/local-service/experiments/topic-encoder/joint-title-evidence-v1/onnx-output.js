// Minimal bounded protobuf adaptation: expose the existing joint CLS tensor.
// No graph operation, initializer, weight, input or original output is changed.
const failure = () => { throw new TypeError('ONNX_GRAPH'); };
function varint(value) {
  const out = [];
  do { const byte = value % 128; value = Math.floor(value / 128); out.push(byte | (value ? 128 : 0)); } while (value);
  return Buffer.from(out);
}
function message(field, bytes) {
  return Buffer.concat([varint(field * 8 + 2), varint(bytes.length), bytes]);
}
function integer(field, value) { return Buffer.concat([varint(field * 8), varint(value)]); }
function fields(bytes) {
  let position = 0;
  const result = [];
  function number() {
    let value = 0, multiplier = 1;
    for (let i = 0; i < 10; i++) {
      if (position >= bytes.length) failure();
      const byte = bytes[position++]; value += (byte & 127) * multiplier;
      if (!(byte & 128)) { if (!Number.isSafeInteger(value)) failure(); return value; }
      multiplier *= 128;
    }
    failure();
  }
  while (position < bytes.length) {
    const start = position, tag = number(), wire = tag & 7, field = Math.floor(tag / 8);
    if (!field) failure();
    let value;
    if (wire === 2) { const length = number(); value = bytes.subarray(position, position + length); position += length; }
    else if (wire === 0) { number(); }
    else if (wire === 1) position += 8;
    else if (wire === 5) position += 4;
    else failure();
    if (position > bytes.length) failure();
    result.push({ field, wire, value, start, end: position });
  }
  return result;
}
export const CLS_OUTPUT = '/classifier/Gather_output_0';
export function exposeJointCls(model) {
  if (!Buffer.isBuffer(model) || !model.length || model.length > 125 * 1024 * 1024) failure();
  const top = fields(model), graphs = top.filter(item => item.field === 7 && item.wire === 2);
  if (graphs.length !== 1) failure();
  const graph = graphs[0], entries = fields(graph.value);
  const nodes = entries.filter(item => item.field === 1).map(item => fields(item.value));
  const producers = nodes.filter(node => node.some(item => item.field === 2 && item.value?.toString() === CLS_OUTPUT));
  if (producers.length !== 1 || producers[0].find(item => item.field === 4)?.value?.toString() !== 'Gather') failure();
  const outputs = entries.filter(item => item.field === 12).map(item => fields(item.value)
    .find(value => value.field === 1)?.value?.toString());
  if (outputs.join() !== 'logits') failure();
  const shape = Buffer.concat([
    message(1, message(2, Buffer.from('batch'))),
    message(1, integer(1, 384)),
  ]);
  const tensorType = Buffer.concat([integer(1, 1), message(2, shape)]);
  const valueInfo = Buffer.concat([message(1, Buffer.from(CLS_OUTPUT)), message(2, message(1, tensorType))]);
  const extendedGraph = Buffer.concat([graph.value, message(12, valueInfo)]);
  return Buffer.concat([model.subarray(0, graph.start), message(7, extendedGraph), model.subarray(graph.end)]);
}
