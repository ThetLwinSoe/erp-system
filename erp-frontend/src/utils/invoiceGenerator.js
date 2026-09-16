import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './currency';
import { containsMyanmarText } from './pdfFonts';
import { renderMyanmarTextToImage } from './textRasterizer';

/**
 * Generate and download invoice PDF
 * @param {Object} options - Invoice options
 * @param {string} options.type - 'sale' or 'purchase'
 * @param {Object} options.order - Order data (sale or purchase)
 * @param {Object} options.company - Company data with logo and name
 */
export const generateInvoicePDF = async ({ type, order, company }) => {
  // A5 size in mm: 148 x 210
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  let yPos = 15;

  // Draws one line of text. jsPDF has no complex-script text-shaping engine,
  // so Myanmar text is rasterized via the browser's own (correct) shaping
  // instead of being drawn directly - see textRasterizer.js. Everything else
  // stays real vector PDF text, same as before.
  const addText = async (text, x, y, options = {}) => {
    const { fontSize = 10, fontStyle = 'normal', align = 'left' } = options;
    const str = String(text || '');
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

  // Splits `str` into lines that fit `maxWidthMM`, each with the line's own
  // measured height (Myanmar only - null for plain text, see below). Plain
  // text is measured by jsPDF directly; Myanmar text can't be measured that
  // way anymore (it's no longer registered as a jsPDF font), so it's wrapped
  // by rasterizing candidate substrings word-by-word against the available
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

  // Company header with logo and name side by side
  let logoWidth = 0;
  let logoHeight = 0;
  const logoSize = 20; // Logo size in mm
  let hasLogo = false;

  // Load and add company logo if available
  if (company?.logo) {
    try {
      const img = await loadImage(company.logo);
      if (img) {
        // Calculate logo dimensions (small square logo)
        const ratio = Math.min(logoSize / img.width, logoSize / img.height);
        logoWidth = img.width * ratio;
        logoHeight = img.height * ratio;

        doc.addImage(img.data, 'PNG', margin, yPos - 2, logoWidth, logoHeight);
        hasLogo = true;
      } else {
        // Logo failed to load (e.g. CORS misconfiguration on the image host) -
        // fall back to a placeholder badge instead of silently leaving a gap.
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

  // Company name, address and contact (positioned after logo if exists).
  // Each is wrapped to the available width so long text doesn't run past the
  // page edge - draws the given text as one or more lines and returns the Y
  // position just after the last line, so the next block can start there.
  const nameX = hasLogo ? margin + logoWidth + 3 : margin;
  const headerMaxWidth = pageWidth - nameX - margin;
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

  let contactY = yPos + 8;
  if (company?.name) {
    contactY = await addWrappedText(company.name, nameX, yPos + 3, { fontSize: 14, fontStyle: 'bold', lineHeight: 5 });
  }
  if (company?.address) {
    contactY = await addWrappedText(company.address, nameX, contactY, { fontSize: 8, lineHeight: 3 });
  }
  if (company?.phone || company?.email) {
    const contactInfo = [company?.phone, company?.email].filter(Boolean).join(' | ');
    contactY = await addWrappedText(contactInfo, nameX, contactY, { fontSize: 8, lineHeight: 3 });
  }

  // Move yPos to after the header section with spacing
  yPos = Math.max(yPos + logoHeight + 3, contactY + 2);
  yPos += 8; // Add spacing between company info and invoice title

  // Invoice title
  const invoiceTitle = type === 'sale' ? 'SALES INVOICE' : 'PURCHASE ORDER';
  await addText(invoiceTitle, pageWidth / 2, yPos, { fontSize: 14, fontStyle: 'bold', align: 'center' });
  yPos += 8;

  // Order info section
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 5;

  // Two column layout for order info
  const col1X = margin;
  const col2X = pageWidth / 2 + 5;

  // Left column - Order details
  await addText(`Order #: ${order.orderNumber || 'N/A'}`, col1X, yPos, { fontSize: 9, fontStyle: 'bold' });
  await addText(`Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}`, col2X, yPos, { fontSize: 9 });
  yPos += 5;

  await addText(`Status: ${(order.status || 'N/A').toUpperCase()}`, col1X, yPos, { fontSize: 9 });
  yPos += 8;

  // Customer/Supplier info
  const partyLabel = type === 'sale' ? 'Bill To:' : 'Supplier:';
  const party = type === 'sale' ? order.customer : order.supplier;
  const partyCode = type === 'sale' ? party?.customerCode : party?.supplierCode;

  await addText(partyLabel, col1X, yPos, { fontSize: 9, fontStyle: 'bold' });
  yPos += 4;
  await addText(partyCode ? `${party?.name || 'N/A'} (${partyCode})` : (party?.name || 'N/A'), col1X, yPos, { fontSize: 9 });
  yPos += 4;
  if (party?.email) {
    await addText(party.email, col1X, yPos, { fontSize: 8 });
    yPos += 3;
  }
  if (party?.phone) {
    await addText(party.phone, col1X, yPos, { fontSize: 8 });
    yPos += 3;
  }
  if (party?.address || party?.city) {
    const address = [party?.address, party?.city, party?.country].filter(Boolean).join(', ');
    await addText(address, col1X, yPos, { fontSize: 8 });
  }

  yPos += 10;

  // Check if any item has a discount for sales type, or a FOC quantity (either type)
  const hasItemDiscounts = type === 'sale' && (order.items || []).some(item => item.discountPercent > 0);
  const hasFocQty = (order.items || []).some(item => item.focQuantity > 0);

  // Items table - column labels and widths are built from the same list, in
  // the same conditional order as the row values below (Qty, [FOC], [Recv],
  // Price, [Disc %], Total), so header/row/width can never drift out of sync
  // regardless of which optional columns (FOC, Recv, Disc %) are present.
  // Product uses a fixed (not 'auto') width - Myanmar product names are
  // drawn as an image overlay (see didDrawCell below) rather than as cell
  // text, so autotable can't auto-size the column from that cell's content.
  const itemColumns = [
    { label: '#', width: 8 },
    { label: 'SKU', width: 18 },
    { label: 'Product', width: null }, // resolved below
    { label: 'Qty', width: 10, halign: 'center' },
  ];
  const PRODUCT_COLUMN_INDEX = 2;
  if (hasFocQty) {
    itemColumns.push({ label: 'FOC', width: 10, halign: 'center' });
  }
  if (type === 'purchase') {
    itemColumns.push({ label: 'Recv', width: 10, halign: 'center' });
  }
  itemColumns.push({ label: 'Price', width: 18, halign: 'right' });
  if (type === 'sale' && hasItemDiscounts) {
    itemColumns.push({ label: 'Disc %', width: 12, halign: 'center' });
  }
  itemColumns.push({ label: 'Total', width: 20, halign: 'right' });

  const fixedColumnsWidth = itemColumns.reduce((sum, col) => sum + (col.width || 0), 0);
  itemColumns[PRODUCT_COLUMN_INDEX].width = pageWidth - margin * 2 - fixedColumnsWidth;

  const tableColumns = itemColumns.map((col) => col.label);
  const columnStyles = itemColumns.reduce((styles, col, index) => {
    styles[index] = { cellWidth: col.width, ...(col.halign && { halign: col.halign }) };
    return styles;
  }, {});

  // Product names containing Myanmar text are rasterized up front (autotable
  // itself is synchronous and can't await inside its draw hooks) and drawn
  // via didDrawCell below; the cell's own text is left blank for those rows.
  const productImages = {};
  const tableData = await Promise.all((order.items || []).map(async (item, index) => {
    const productName = item.product?.name || 'Unknown';
    let displayName = productName;
    if (containsMyanmarText(productName)) {
      productImages[index] = await renderMyanmarTextToImage(productName, { fontSizePt: 8, fontStyle: 'normal' });
      displayName = '';
    }

    const row = [
      index + 1,
      item.product?.sku || '-',
      displayName,
      item.quantity || 0,
    ];

    if (hasFocQty) {
      row.push(item.focQuantity || 0);
    }

    if (type === 'purchase') {
      row.push(item.receivedQuantity || 0);
    }

    row.push(formatCurrency(item.unitPrice, company?.currency));

    // Add discount column for sales if any item has discount
    if (type === 'sale' && hasItemDiscounts) {
      row.push(item.discountPercent > 0 ? `${item.discountPercent}` : '-');
    }

    row.push(formatCurrency(item.total, company?.currency));

    return row;
  }));

  // Use autoTable function directly
  autoTable(doc, {
    startY: yPos,
    head: [tableColumns],
    body: tableData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      font: 'helvetica',
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [66, 66, 66],
      textColor: 255,
      fontStyle: 'bold',
      font: 'helvetica',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles,
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

  // Get the final Y position after the table
  yPos = doc.lastAutoTable.finalY + 8;

  const pageHeight = doc.internal.pageSize.getHeight();
  const FOOTER_HEIGHT = 15; // matches the footer's own layout below (line at pageHeight-15, text through pageHeight-6)

  // Starts a new page (resetting yPos to the top margin) if the next block of
  // `neededHeight` wouldn't fit above the footer's reserved zone - without this,
  // longer orders push Totals/Notes down far enough to overlap the footer,
  // which is drawn at a fixed offset from the page bottom regardless of yPos.
  const ensureSpace = (neededHeight) => {
    if (yPos + neededHeight > pageHeight - FOOTER_HEIGHT) {
      doc.addPage();
      yPos = 15;
    }
  };

  // Totals section
  const totalsX = pageWidth - margin - 55;

  // Actual height of the block about to be drawn: Subtotal + Tax [+ Discount]
  // lines, the separator gap, and a small buffer for the TOTAL line's own
  // text height (not the full trailing spacing after it, which is just
  // breathing room for a Notes section that may not exist).
  const totalsLines = 2 + (type === 'sale' && order.discountPercent > 0 ? 1 : 0);
  ensureSpace(totalsLines * 5 + 4 + 3);

  await addText('Subtotal:', totalsX, yPos, { fontSize: 9 });
  await addText(formatCurrency(order.subtotal, company?.currency), pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
  yPos += 5;

  // Add order discount if applicable (for sales)
  if (type === 'sale' && order.discountPercent > 0) {
    await addText(`Order Discount % (${order.discountPercent}):`, totalsX, yPos, { fontSize: 9 });
    await addText(`-${formatCurrency(order.discountAmount, company?.currency)}`, pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
    yPos += 5;
  }

  await addText('Tax:', totalsX, yPos, { fontSize: 9 });
  await addText(formatCurrency(order.tax, company?.currency), pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
  yPos += 5;

  doc.setLineWidth(0.3);
  doc.line(totalsX, yPos, pageWidth - margin, yPos);
  yPos += 4;

  await addText('TOTAL:', totalsX, yPos, { fontSize: 10, fontStyle: 'bold' });
  await addText(formatCurrency(order.total, company?.currency), pageWidth - margin, yPos, { fontSize: 10, fontStyle: 'bold', align: 'right' });
  yPos += 10;

  // Notes section
  if (order.notes) {
    const splitNotes = await wrapText(String(order.notes), pageWidth - 2 * margin, 8, 'normal');
    ensureSpace(4 + splitNotes.length * 3.5);

    await addText('Notes:', margin, yPos, { fontSize: 9, fontStyle: 'bold' });
    yPos += 4;

    let notesY = yPos;
    for (const line of splitNotes) {
      await addText(line.text, margin, notesY, { fontSize: 8 });
      notesY += Math.max(3.5, line.heightMM || 0);
    }
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(200);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  await addText('Thank you for your business!', pageWidth / 2, footerY, { fontSize: 8, align: 'center' });
  await addText(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, footerY + 4, { fontSize: 7, align: 'center' });

  // Download the PDF
  const fileName = `${type === 'sale' ? 'Invoice' : 'PurchaseOrder'}_${order.orderNumber || 'unknown'}.pdf`;
  doc.save(fileName);
};

/**
 * Load image from URL and convert to base64
 * @param {string} url - Image URL
 * @returns {Promise<{data: string, width: number, height: number} | null>}
 */
const IMAGE_LOAD_TIMEOUT_MS = 8000;

export const loadImage = (url) => {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`Timed out loading logo image after ${IMAGE_LOAD_TIMEOUT_MS}ms:`, url);
      controller.abort();
    }, IMAGE_LOAD_TIMEOUT_MS);

    // Fetch with the browser HTTP cache bypassed and read via a same-origin
    // blob: URL - the app's own <img> tags (Navbar, Companies list, etc.) load
    // this same URL in no-cors mode and can leave a cached opaque response that
    // a later crossOrigin="anonymous" <img> load can't safely reuse, causing the
    // canvas read to silently fail (taint error or onerror). blob: URLs sidestep
    // this: they're always same-origin, so the browser cache mode of the
    // original request no longer matters once we have the bytes locally.
    fetch(url, { cache: 'reload', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve({
              data: canvas.toDataURL('image/png'),
              width: img.width,
              height: img.height,
            });
          } catch (error) {
            console.error(`Failed to read logo image data: ${url}`, error);
            resolve(null);
          } finally {
            URL.revokeObjectURL(objectUrl);
            clearTimeout(timeoutId);
          }
        };
        img.onerror = () => {
          console.error(`Failed to decode logo image: ${url}`);
          URL.revokeObjectURL(objectUrl);
          clearTimeout(timeoutId);
          resolve(null);
        };
        img.src = objectUrl;
      })
      .catch((error) => {
        console.error(`Failed to fetch logo image: ${url}`, error);
        clearTimeout(timeoutId);
        resolve(null);
      });
  });
};

/**
 * Draw a placeholder logo badge (filled circle + first initial) when the real
 * logo image can't be loaded - never depends on network/CORS, so it can't fail.
 */
export const drawLogoPlaceholder = (doc, name, x, y, size) => {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const centerX = x + size / 2;
  const centerY = y + size / 2;

  doc.setFillColor(200, 200, 200);
  doc.circle(centerX, centerY, size / 2, 'F');

  doc.setFontSize(size * 1.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(90, 90, 90);
  doc.text(initial, centerX, centerY, { align: 'center', baseline: 'middle' });
  doc.setTextColor(0, 0, 0);
};

export default generateInvoicePDF;
