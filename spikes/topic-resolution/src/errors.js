export class ResolutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ResolutionError";
    this.code = code;
  }
}

export function fail(code, message) {
  throw new ResolutionError(code, message);
}
