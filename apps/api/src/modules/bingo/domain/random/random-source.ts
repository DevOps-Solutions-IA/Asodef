export interface RandomSource {
  /** Returns an integer in the half-open interval [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}
