/**
 * Represents an authenticated user attached to the request.
 * Separated into its own file to avoid TS1272 errors with
 * `isolatedModules` + `emitDecoratorMetadata` when used in
 * decorated method parameters.
 */
export class AuthUser {
  id: string;
  email: string;
  name: string;
}
