/**
 * Myanmar text detection for PDF generation.
 *
 * jsPDF has no complex-script text-shaping engine (no reordering or glyph
 * substitution for stacked/combining Myanmar consonant forms), so Myanmar
 * text drawn directly via doc.text() renders visibly broken no matter which
 * font is registered with it. Myanmar text is instead rasterized via the
 * browser's own (correct) text shaping and embedded as an image - see
 * textRasterizer.js. This file just answers "does this string need that
 * treatment?".
 */

/**
 * Check if text contains Myanmar characters
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export const containsMyanmarText = (text) => {
  if (!text) return false;
  // Myanmar Unicode range: U+1000 to U+109F
  const myanmarRegex = /[က-႟]/;
  return myanmarRegex.test(text);
};

export default {
  containsMyanmarText,
};
