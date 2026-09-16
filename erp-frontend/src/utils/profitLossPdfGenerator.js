import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './currency';
import { containsMyanmarText } from './pdfFonts';
import { renderMyanmarTextToImage } from './textRasterizer';
import { loadImage, drawLogoPlaceholder } from './invoiceGenerator';

/**
 * Generate and download a Profit & Loss report PDF.
 * @param {Object} options
 * @param {Object} options.company - Company data (name, logo, address, phone, email, currency)
 * @param {Object} options.summary - Summary figures from reportsAPI.getProfitLossReport
 * @param {Array} options.products - Per-product breakdown rows
 * @param {string} [options.startDate]
 * @param {string} [options.endDate]
 */
export const generateProfitLossPDF = async ({ company, summary, products, startDate, endDate }) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let yPos = 18;
  const currency = company?.currency;

  // Draws one line of text. jsPDF has no complex-script text-shaping engine,
  // so Myanmar text is rasterized via the browser's own (correct) shaping
  // instead of being drawn directly - see textRasterizer.js. Everything else
  // stays real vector PDF text, same as before.
  const addText = async (text, x, y, options = {}) => {
    const { fontSize = 10, fontStyle = 'normal', align = 'left' } = options;
    const str = String(text ?? '');
    if (!str) return;

    if (containsMyanmarText(str)) {
      const { dataUri, widthMM, heightMM, baselineFromTopMM } = renderMyanmarTextToImage(str, { fontSizePt: fontSize, fontStyle });
      let drawX = x;
      if (align === 'center') drawX -= widthMM / 2;
      else if (align === 'right') drawX -= widthMM;
      // doc.text()'s y is a baseline; addImage's y is a top-left corner -
      // baselineFromTopMM is the exact (measured, not approximated) distance
      // from the image top to where the text's own baseline sits.
      doc.addImage(dataUri, 'PNG', drawX, y - baselineFromTopMM, widthMM, heightMM);
      return;
    }

    doc.setFontSize(fontSize);
    doc.setFont('helvetica', fontStyle);
    doc.text(str, x, y, { align });
  };

  // Header: logo (if any) with company name/address/contact wrapped next to
  // it, mirroring invoiceGenerator.js's header so both PDFs look consistent.
  let logoWidth = 0;
  let logoHeight = 0;
  const logoSize = 20; // mm
  let hasLogo = false;

  if (company?.logo) {
    try {
      const img = await loadImage(company.logo);
      if (img) {
        const ratio = Math.min(logoSize / img.width, logoSize / img.height);
        logoWidth = img.width * ratio;
        logoHeight = img.height * ratio;
        doc.addImage(img.data, 'PNG', margin, yPos - 2, logoWidth, logoHeight);
        hasLogo = true;
      } else {
        drawLogoPlaceholder(doc, company.name, margin, yPos - 2, logoSize);
        logoWidth = logoSize;
        logoHeight = logoSize;
        hasLogo = true;
      }
    } catch (error) {
      console.error('Failed to load company logo:', error);
      drawLogoPlaceholder(doc, company.name, margin, yPos - 2, logoSize);
      logoWidth = logoSize;
      logoHeight = logoSize;
      hasLogo = true;
    }
  }

  const nameX = hasLogo ? margin + logoWidth + 3 : margin;
  const headerMaxWidth = pageWidth - nameX - margin;

  // Splits `str` into lines that fit `maxWidthMM`, each with the line's own
  // measured height (Myanmar only - null for plain text, see below). Plain
  // text is measured by jsPDF directly; Myanmar text can't be measured that
  // way (it's no longer registered as a jsPDF font), so it's wrapped by
  // rasterizing candidate substrings word-by-word against the available
  // width instead - which also gives each line's real rendered height for
  // free, needed so addWrappedText can space rasterized lines correctly
  // (their real ink can be taller than a generic fixed line-height guess).
  const wrapText = async (str, maxWidthMM, fontSize, fontStyle) => {
    if (!containsMyanmarText(str)) {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', fontStyle);
      return doc.splitTextToSize(str, maxWidthMM).map((text) => ({ text, heightMM: null }));
    }
    const words = str.split(' ');
    const lines = [];
    let currentLine = '';
    let currentImg = null;
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const img = renderMyanmarTextToImage(candidate, { fontSizePt: fontSize, fontStyle });
      if (currentLine && img.widthMM > maxWidthMM) {
        lines.push({ text: currentLine, heightMM: currentImg.heightMM });
        currentLine = word;
        currentImg = renderMyanmarTextToImage(word, { fontSizePt: fontSize, fontStyle });
      } else {
        currentLine = candidate;
        currentImg = img;
      }
    }
    if (currentLine) lines.push({ text: currentLine, heightMM: currentImg.heightMM });
    return lines;
  };

  const addWrappedText = async (text, x, y, { fontSize, fontStyle = 'normal', lineHeight }) => {
    const str = String(text || '');
    if (!str) return y;
    const lines = await wrapText(str, headerMaxWidth, fontSize, fontStyle);
    let cursorY = y;
    for (const line of lines) {
      await addText(line.text, x, cursorY, { fontSize, fontStyle });
      // A rasterized Myanmar line's real ink can be taller than the fixed
      // lineHeight - advance by whichever is larger so consecutive wrapped
      // lines never overlap. Plain text has no measured height (null), so
      // this is a no-op there - identical spacing to before.
      cursorY += Math.max(lineHeight, line.heightMM || 0);
    }
    return cursorY;
  };

  let textBottom = yPos + 3;
  if (company?.name) {
    textBottom = await addWrappedText(company.name, nameX, textBottom, { fontSize: 14, fontStyle: 'bold', lineHeight: 5 });
  }
  if (company?.address) {
    textBottom = await addWrappedText(company.address, nameX, textBottom, { fontSize: 8, lineHeight: 3.5 });
  }
  const phoneEmail = [company?.phone, company?.email].filter(Boolean).join(' | ');
  if (phoneEmail) {
    textBottom = await addWrappedText(phoneEmail, nameX, textBottom, { fontSize: 8, lineHeight: 3.5 });
  }

  yPos = Math.max(yPos + logoHeight + 3, textBottom + 2) + 5;

  await addText('PROFIT & LOSS REPORT', pageWidth / 2, yPos, { fontSize: 13, fontStyle: 'bold', align: 'center' });
  yPos += 7;

  await addText(`Period: ${startDate || 'All time'} to ${endDate || 'All time'}`, margin, yPos, { fontSize: 9 });
  await addText(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
  yPos += 4;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;

  // Summary table
  const fmt = (n) => formatCurrency(n, currency);
  const summaryRows = [
    ['Net Revenue', fmt(summary.netRevenue)],
    ['Cost of Goods Sold', fmt(summary.cogs)],
    ['Gross Profit', fmt(summary.grossProfit)],
    ['Gross Margin %', `${(summary.grossMarginPercent || 0).toFixed(2)}%`],
    ['Inventory Adjustment Gain/(Loss)', fmt(summary.inventoryAdjustmentGainLoss)],
    ['Net Profit', fmt(summary.netProfit)],
    ['Tax Collected on Sales', fmt(summary.taxCollected)],
    ['Tax Paid on Purchases', fmt(summary.taxPaid)],
  ];

  autoTable(doc, {
    startY: yPos,
    body: summaryRows,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 1.5, textColor: [0, 0, 0] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 90 },
      1: { halign: 'right' },
    },
    didParseCell: (data) => {
      // Highlight the two headline rows
      if (data.row.index === 2 || data.row.index === 5) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 11;
      }
    },
  });

  yPos = doc.lastAutoTable.finalY + 8;

  // Product breakdown
  await addText('Product Breakdown', margin, yPos, { fontSize: 11, fontStyle: 'bold' });
  yPos += 3;

  // Fixed widths for every column (not 'auto') - Myanmar product names are
  // drawn as an image overlay (see didDrawCell below) rather than as cell
  // text, so autotable can't auto-size the Product column from that cell's
  // content; the other columns are fixed too for a predictable layout.
  const PRODUCT_COLUMN_INDEX = 1;
  const otherColumnWidths = { sku: 25, qty: 20, revenue: 25, cogs: 25, grossProfit: 25, margin: 20 };
  const fixedColumnsWidth = Object.values(otherColumnWidths).reduce((sum, w) => sum + w, 0);
  const productColumnWidth = pageWidth - margin * 2 - fixedColumnsWidth;

  const productColumns = ['SKU', 'Product', 'Qty Sold', 'Revenue', 'COGS', 'Gross Profit', 'Margin %'];

  // Product names containing Myanmar text are rasterized up front (autotable
  // itself is synchronous and can't await inside its draw hooks) and drawn
  // via didDrawCell below; the cell's own text is left blank for those rows.
  const productImages = {};
  const productRows = (products || []).map((p, index) => {
    const name = p.name || '-';
    let displayName = name;
    if (containsMyanmarText(name)) {
      // Rasterization itself is async but productImages is populated via the
      // .map() side effect below through a follow-up Promise.all pass.
      displayName = '';
    }
    return {
      row: [
        p.sku || '-',
        displayName,
        p.qtySold,
        fmt(p.revenue),
        fmt(p.cogs),
        fmt(p.grossProfit),
        `${(p.marginPercent || 0).toFixed(2)}%`,
      ],
      index,
      name,
      needsRaster: name !== displayName,
    };
  });

  await Promise.all(
    productRows
      .filter((r) => r.needsRaster)
      .map(async (r) => {
        productImages[r.index] = await renderMyanmarTextToImage(r.name, { fontSizePt: 8, fontStyle: 'normal' });
      })
  );

  autoTable(doc, {
    startY: yPos,
    head: [productColumns],
    body: productRows.map((r) => r.row),
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [0, 0, 0],
      font: 'helvetica',
    },
    headStyles: {
      fillColor: [51, 51, 51],
      textColor: 255,
      fontStyle: 'bold',
      font: 'helvetica',
    },
    columnStyles: {
      0: { cellWidth: otherColumnWidths.sku },
      1: { cellWidth: productColumnWidth },
      2: { cellWidth: otherColumnWidths.qty, halign: 'right' },
      3: { cellWidth: otherColumnWidths.revenue, halign: 'right' },
      4: { cellWidth: otherColumnWidths.cogs, halign: 'right' },
      5: { cellWidth: otherColumnWidths.grossProfit, halign: 'right' },
      6: { cellWidth: otherColumnWidths.margin, halign: 'right' },
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== PRODUCT_COLUMN_INDEX) return;
      const img = productImages[data.row.index];
      if (!img) return;

      const padX = 2;
      let { widthMM, heightMM } = img;
      const maxWidth = data.cell.width - padX * 2;
      if (widthMM > maxWidth) {
        const scale = maxWidth / widthMM;
        widthMM *= scale;
        heightMM *= scale;
      }
      const imgY = data.cell.y + (data.cell.height - heightMM) / 2;
      doc.addImage(img.dataUri, 'PNG', data.cell.x + padX, imgY, widthMM, heightMM);
    },
  });

  const fileName = `ProfitLoss_${startDate || 'all'}_to_${endDate || 'all'}.pdf`;
  doc.save(fileName);
};

export default generateProfitLossPDF;
