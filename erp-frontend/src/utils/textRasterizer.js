/**
 * Renders Myanmar text as a small raster image (via the browser's own text
 * shaping engine) for embedding into a jsPDF document. jsPDF has no
 * complex-script shaping (no reordering/glyph substitution for stacked
 * consonants etc.), so drawing Myanmar text directly with doc.text() renders
 * it visibly broken even with a Myanmar-capable font embedded - the browser
 * (which DOES shape it correctly) is used instead, and only these specific
 * text runs become images; everything else stays real vector PDF text.
 *
 * Draws directly onto a <canvas> via fillText() rather than rasterizing a
 * hidden DOM element (the original approach, via html2canvas): Canvas 2D
 * text rendering goes through the same shaping engine as normal DOM text
 * (verified), and crucially, measureText()'s actualBoundingBoxAscent/Descent
 * give the *real* ink extent for a specific string - which for Myanmar can
 * extend well past the font's nominal line-height metrics (measured: a font
 * with a 10px nominal descent needed 19px of real descent for text with
 * below-base combining marks). Sizing the canvas from a generic line-height
 * guess (the html2canvas approach) clipped that extra ink; sizing it from
 * the actual measured bounding box does not, and also gives an exact,
 * non-approximated baseline position for callers to align against.
 *
 * Uses the browser's normal system font stack (the same one every other
 * Myanmar-capable string already renders through elsewhere in this app),
 * not a font we embed ourselves - see git history for why (an embedded
 * NotoSansMyanmar TTF was tried and its shaping of certain combining
 * sequences was actually wrong, even in plain DOM/canvas rendering).
 */

const PT_TO_PX = 4 / 3; // 1pt = 4/3 CSS px at the standard 96dpi/72pt reference
const RASTER_SCALE = 3; // renders at 3x for crisp print quality
const MM_PER_PX = 25.4 / 96;
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif';
const PADDING_PX = 2; // small safety margin around the measured ink box

/**
 * Renders `text` to a data URI plus its size in PDF mm (for doc.addImage),
 * along with the exact distance from the image's top edge to the text's own
 * baseline (also in mm) so callers can position it precisely instead of
 * approximating. Caller is responsible for containsMyanmarText() gating -
 * this always rasterizes whatever text it's given.
 *
 * @param {string} text
 * @param {{ fontSizePt: number, fontStyle?: 'normal' | 'bold' }} options
 * @returns {{ dataUri: string, widthMM: number, heightMM: number, baselineFromTopMM: number }}
 */
export const renderMyanmarTextToImage = (text, { fontSizePt, fontStyle = 'normal' } = {}) => {
  const fontSizePx = fontSizePt * PT_TO_PX;
  const fontSpec = `${fontStyle === 'bold' ? 'bold ' : ''}${fontSizePx}px ${FONT_STACK}`;

  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = fontSpec;
  const metrics = measureCtx.measureText(text);

  const ascent = Math.ceil(metrics.actualBoundingBoxAscent) + PADDING_PX;
  const descent = Math.ceil(metrics.actualBoundingBoxDescent) + PADDING_PX;
  const width = Math.ceil(metrics.width) + PADDING_PX * 2;
  const height = ascent + descent;

  const canvas = document.createElement('canvas');
  canvas.width = width * RASTER_SCALE;
  canvas.height = height * RASTER_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(RASTER_SCALE, RASTER_SCALE);
  ctx.font = fontSpec;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, PADDING_PX, ascent);

  return {
    dataUri: canvas.toDataURL('image/png'),
    widthMM: width * MM_PER_PX,
    heightMM: height * MM_PER_PX,
    baselineFromTopMM: ascent * MM_PER_PX,
  };
};

export default { renderMyanmarTextToImage };
