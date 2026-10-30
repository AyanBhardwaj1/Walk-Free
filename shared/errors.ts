export class ServiceError extends Error {
  /** A provider's own explanation, read only when a caller asks for it. */
  providerReason?: string;
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public details?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
