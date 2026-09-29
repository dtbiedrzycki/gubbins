export interface SecretComparer {
  compareInConstantTime(a: string, b: string): boolean;
}
