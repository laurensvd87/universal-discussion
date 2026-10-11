// Deliberately content-free errors: never include addresses or credentials.
export class AccountError extends Error {
  constructor(code = 'invalid-request') {
    super(code);
    this.name = 'AccountError';
    this.code = code;
  }
}
