export class StateGraphError extends Error {
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, code = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DatabaseError extends StateGraphError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', details);
  }
}

export class ValidationError extends StateGraphError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
  }
}
