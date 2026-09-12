export interface SecretComparer {
  constantTimeEqual(a: string, b: string): boolean;
}
