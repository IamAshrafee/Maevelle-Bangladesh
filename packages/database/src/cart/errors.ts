export class CartDomainError extends Error {
  public constructor(
    public readonly code:
      | 'MERGE_STALE'
      | 'MERGE_REVIEW_REQUIRED'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'VALIDATION_FAILED'
      | 'STALE_VERSION'
      | 'UNAVAILABLE'
      | 'UNPRICED'
      | 'OWNER_CHANGED'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INTENT_EXPIRED'
      | 'LIMIT_EXCEEDED'
      | 'INVALID_CONFIGURATION',
    message: string,
    public readonly currentVersion?: number,
  ) {
    super(message);
    this.name = 'CartDomainError';
  }
}
