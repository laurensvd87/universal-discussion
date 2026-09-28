// Project-created examples. These vectors are hand-authored test coordinates,
// not generated embeddings, licensed web content or matching-quality evidence.
const records = [
  ["harbor-overview", "https://maker.example/sensor-s2", "Harbor S2 sensor: product overview", "harbor-s2", [1, 0, 0]],
  ["harbor-review", "https://reviews.example/harbor-s2", "Living with the Harbor S2 for six months", "harbor-s2", [0.9, 0.1, 0]],
  ["harbor-store", "https://shop.example/item?id=harbor-s2", "Harbor S2 specifications and options", "harbor-s2", [0.9, 0, 0.1]],
  ["harbor-successor", "https://maker.example/sensor-s3", "Harbor S3: what changed in the new generation?", "harbor-s3", [0.88, 0.3, 0.05]],
  ["monitoring-guide", "https://guides.example/leak-monitoring", "Choosing a water-leak monitoring setup", null, [0.77, 0.58, 0.1]],
  ["garden-guide", "https://garden.example/seedlings", "Starting seedlings in a community garden", "seedlings", [0, 0, 1]],
];

export const RELATED_SOURCE_FIXTURES = Object.freeze(records.map(
  ([id, url, title, topicId, values]) => Object.freeze({
    id,
    url,
    title,
    topicId,
    embedding: Object.freeze({
      modelId: "hand-authored-demo-vectors/1",
      values: Object.freeze(values),
    }),
  }),
));
