import { fail } from "../domain/errors.js";
import { clone, frozenClone } from "../domain/validation.js";

export function createMemoryRepository(initialState) {
  let state = clone(initialState);
  return Object.freeze({
    load() { return frozenClone(state); },
    save(expected, nextState) {
      if (state.generation !== expected.generation || state.revision !== expected.revision) {
        fail("conflict", "State changed");
      }
      state = clone(nextState);
      return frozenClone(state);
    },
    replace(expected, nextState) {
      if (state.generation !== expected.generation || state.revision !== expected.revision) {
        fail("conflict", "State changed");
      }
      state = clone(nextState);
      return frozenClone(state);
    },
  });
}
