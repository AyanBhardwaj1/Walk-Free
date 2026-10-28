export class ServiceError extends Error {
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
