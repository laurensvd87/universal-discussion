export class ServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

export function fail(code, message) {
  throw new ServiceError(code, message);
}
