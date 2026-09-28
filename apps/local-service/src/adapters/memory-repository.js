import { clone, frozenClone } from "../domain/validation.js";
import { assertExpected, assertTransition, serializeSnapshot } from "../domain/repository-contract.js";

export function createMemoryRepository(initialState) {
  serializeSnapshot(initialState);
  let state = clone(initialState);
  function write(expected, nextState, reset) {
    assertExpected(state, expected);
    serializeSnapshot(nextState);
    assertTransition(state, nextState, reset);
    state = clone(nextState);
    return frozenClone(state);
  }
  return Object.freeze({
    load() { return frozenClone(state); },
    save(expected, nextState) { return write(expected, nextState, false); },
    replace(expected, nextState) { return write(expected, nextState, true); },
  });
}
