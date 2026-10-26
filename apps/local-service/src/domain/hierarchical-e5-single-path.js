// Separately versioned offline challenger. This wrapper has not been evaluated
// on the locked v1 test set and supplies no production assignment authority.
import { compileHierarchyArtifact, classifyHierarchy, HierarchyMatcherError } from './hierarchical-e5-matcher.js';

export const SINGLE_PATH_ALGORITHM_VERSION = 'hierarchical-e5-single-path/v2';
const handles = new WeakMap();
const invalid = message => { throw new HierarchyMatcherError('invalid-input', message); };

/** Validate and privately copy v1 evidence, then retain only root contrast rules. */
export function compileSinglePathHierarchy(artifact) {
  // The v1 validator rejects proxies, accessors and extra array/record fields.
  // Read root metadata only after this full validation and evidence copy succeeds.
  const compiled = compileHierarchyArtifact(artifact);
  const rules = new Map(artifact.nodeRules.map(rule => [rule.nodeId, rule.minMargin]));
  const rootMargins = new Map(artifact.nodes.filter(node => node.parentId === null)
    .map(node => [node.id, rules.get(node.id)]));
  const parentIds = new Set(artifact.nodes.filter(node => node.parentId !== null).map(node => node.parentId));
  const handle = Object.freeze({});
  handles.set(handle, { compiled, rootMargins, parentIds });
  return handle;
}

/** A single branch must beat every competing root's descendant-union evidence. */
export function classifySinglePathHierarchy(handle, witness) {
  if (arguments.length !== 2) invalid('Single-path classification accepts no options');
  const state = handles.get(handle);
  if (!state) invalid('Expected compiled single-path hierarchy capability');
  const candidate = classifyHierarchy(state.compiled, witness, { multiPath: true });
  const features = new Map(candidate.features.map(feature => [feature.nodeId, feature]));
  const survivors = candidate.paths.filter(path => {
    const margin = features.get(path[0]).siblingMargin;
    return margin === null || (margin > 0 && margin >= state.rootMargins.get(path[0]));
  });
  // Strict positive pairwise root contrast admits at most one candidate root.
  const paths = Object.freeze(survivors.slice(0, 1));
  const primaryNodeId = paths[0]?.at(-1) ?? null;
  // Report the surviving branch's reason even if the v1 primary was different.
  const reason = paths.length
    ? state.parentIds.has(primaryNodeId) ? 'supported-parent-stop' : 'supported-specific-node'
    : candidate.paths.length ? 'ambiguous-root-branches' : candidate.reason;
  return Object.freeze({ ...candidate, algorithmVersion: SINGLE_PATH_ALGORITHM_VERSION,
    productionValidated: false, status: paths.length ? 'assigned' : 'unresolved',
    primaryNodeId, paths, reason });
}
