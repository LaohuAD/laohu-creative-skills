// Content adapter for the pinned GrainDissolve composition.
// The source logo, identity and promo copy are not carried into local production.
// Only its display font stack is retained; the name always comes from the caller.
export const GRAIN_DISSOLVE_BRAND_FONT_FAMILY =
  '"Avenir Next", Avenir, Inter, "Helvetica Neue", "PingFang SC", Arial, sans-serif';

export function adaptGrainDissolveContent(brandName: string) {
  if (typeof brandName !== 'string' || !brandName.trim()) {
    throw new Error('brandName is required for GrainDissolve content');
  }
  if (/[\r\n\u2028\u2029]/.test(brandName)) {
    throw new Error('brandName must be one line for GrainDissolve');
  }
  return {
    intro: '{ ' + brandName + '. Now Live }',
    lockup: brandName,
  };
}
