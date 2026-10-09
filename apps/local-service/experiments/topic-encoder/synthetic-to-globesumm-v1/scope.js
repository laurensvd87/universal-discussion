import path from 'node:path';

const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

// Arguments are realpath-resolved by the caller before any private file read.
export function privateScopeAllowed(repo, root, file) {
  if (![repo, root, file].every(value => typeof value === 'string' &&
      path.isAbsolute(value))) return false;
  return inside(root, file) && root !== repo && file !== repo &&
    !inside(repo, root) && !inside(root, repo) && !inside(repo, file);
}
