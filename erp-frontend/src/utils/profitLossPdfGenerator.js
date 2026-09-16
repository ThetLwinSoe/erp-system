import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './currency';
import { setupMyanmarFont, getFontForText, containsMyanmarText } from './pdfFonts';
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

  const myanmarFontLoaded = setupMyanmarFont(doc);
  if (!myanmarFontLoaded && containsMyanmarText(company?.name)) {
    console.warn('Myanmar text detected but Myanmar font not loaded. Text may not display correctly.');
  }

  const addText = (text, x, y, options = {}) => {
    const { fontSize = 10, fontStyle = 'normal', align = 'left' } = options;
    doc.setFontSize(fontSize);
    const fontName = getFontForText(text, myanmarFontLoaded);
    const actualFontStyle = fontName === 'NotoSansMyanmar' ? 'normal' : fontStyle;
    doc.setFont(fontName, actualFontStyle);
    doc.text(String(text ?? ''), x, y, { align });
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
  const addWrappedText = (text, x, y, { fontSize, fontStyle = 'normal', lineHeight }) => {
    const fontName = getFontForText(text, myanmarFontLoaded);
    const actualFontStyle = fontName === 'NotoSansMyanmar' ? 'normal' : fontStyle;
    doc.setFontSize(fontSize);
    doc.setFont(fontName, actualFontStyle);
    const lines = doc.splitTextToSize(text, headerMaxWidth);
    lines.forEach((line, i) => {
      addText(line, x, y + i * lineHeight, { fontSize, fontStyle });
    });
    return y + lines.length * lineHeight;
  };

  let textBottom = yPos + 3;
  if (company?.name) {
    textBottom = addWrappedText(company.name, nameX, textBottom, { fontSize: 14, fontStyle: 'bold', lineHeight: 5 });
  }
  if (company?.address) {
    textBottom = addWrappedText(company.address, nameX, textBottom, { fontSize: 8, lineHeight: 3.5 });
  }
  const phoneEmail = [company?.phone, company?.email].filter(Boolean).join(' | ');
  if (phoneEmail) {
    textBottom = addWrappedText(phoneEmail, nameX, textBottom, { fontSize: 8, lineHeight: 3.5 });
  }

  yPos = Math.max(yPos + logoHeight + 3, textBottom + 2) + 5;

  addText('PROFIT & LOSS REPORT', pageWidth / 2, yPos, { fontSize: 13, fontStyle: 'bold', align: 'center' });
  yPos += 7;

  addText(`Period: ${startDate || 'All time'} to ${endDate || 'All time'}`, margin, yPos, { fontSize: 9 });
  addText(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
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
  addText('Product Breakdown', margin, yPos, { fontSize: 11, fontStyle: 'bold' });
  yPos += 3;

  const productColumns = ['SKU', 'Product', 'Qty Sold', 'Revenue', 'COGS', 'Gross Profit', 'Margin %'];
  const productRows = (products || []).map((p) => [
    p.sku || '-',
    p.name || '-',
    p.qtySold,
    fmt(p.revenue),
    fmt(p.cogs),
    fmt(p.grossProfit),
    `${(p.marginPercent || 0).toFixed(2)}%`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [productColumns],
    body: productRows,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [0, 0, 0],
      font: myanmarFontLoaded ? 'NotoSansMyanmar' : 'helvetica',
    },
    headStyles: {
      fillColor: [51, 51, 51],
      textColor: 255,
      // Myanmar font only has 'normal' style, use normal for headers too
      fontStyle: myanmarFontLoaded ? 'normal' : 'bold',
      font: myanmarFontLoaded ? 'NotoSansMyanmar' : 'helvetica',
    },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
  });

  const fileName = `ProfitLoss_${startDate || 'all'}_to_${endDate || 'all'}.pdf`;
  doc.save(fileName);
};

export default generateProfitLossPDF;
