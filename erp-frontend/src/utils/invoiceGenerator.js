import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './currency';
import { setupMyanmarFont, getFontForText, containsMyanmarText } from './pdfFonts';

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

  // Try to load Myanmar font for Unicode support
  const myanmarFontLoaded = setupMyanmarFont(doc);

  // Show warning if Myanmar text detected but font not available
  if (!myanmarFontLoaded) {
    const hasMyanmar =
      containsMyanmarText(company?.name) ||
      containsMyanmarText(company?.address) ||
      containsMyanmarText(order.customer?.name || order.supplier?.name) ||
      (order.items || []).some(item => containsMyanmarText(item.product?.name));

    if (hasMyanmar) {
      console.warn('Myanmar text detected but Myanmar font not loaded. Text may not display correctly.');
      console.warn('See pdfFonts.js for instructions on adding Myanmar font support.');
    }
  }

  // Helper function to add text with automatic font selection
  const addText = (text, x, y, options = {}) => {
    const { fontSize = 10, fontStyle = 'normal', align = 'left' } = options;
    doc.setFontSize(fontSize);

    // Use Myanmar font if available and text contains Myanmar characters
    const fontName = getFontForText(text, myanmarFontLoaded);

    // Myanmar font only has 'normal' style - use normal even for bold requests
    const actualFontStyle = fontName === 'NotoSansMyanmar' ? 'normal' : fontStyle;
    doc.setFont(fontName, actualFontStyle);

    doc.text(String(text || ''), x, y, { align });
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
  const addWrappedText = (text, x, y, { fontSize, fontStyle = 'normal', lineHeight }) => {
    const fontName = getFontForText(text, myanmarFontLoaded);
    // Myanmar font only has 'normal' style - use normal even for bold requests
    const actualFontStyle = fontName === 'NotoSansMyanmar' ? 'normal' : fontStyle;
    doc.setFontSize(fontSize);
    doc.setFont(fontName, actualFontStyle);
    const lines = doc.splitTextToSize(text, headerMaxWidth);
    lines.forEach((line, i) => {
      addText(line, x, y + i * lineHeight, { fontSize, fontStyle });
    });
    return y + lines.length * lineHeight;
  };

  let contactY = yPos + 8;
  if (company?.name) {
    contactY = addWrappedText(company.name, nameX, yPos + 3, { fontSize: 14, fontStyle: 'bold', lineHeight: 5 });
  }
  if (company?.address) {
    contactY = addWrappedText(company.address, nameX, contactY, { fontSize: 8, lineHeight: 3 });
  }
  if (company?.phone || company?.email) {
    const contactInfo = [company?.phone, company?.email].filter(Boolean).join(' | ');
    contactY = addWrappedText(contactInfo, nameX, contactY, { fontSize: 8, lineHeight: 3 });
  }

  // Move yPos to after the header section with spacing
  yPos = Math.max(yPos + logoHeight + 3, contactY + 2);
  yPos += 8; // Add spacing between company info and invoice title

  // Invoice title
  const invoiceTitle = type === 'sale' ? 'SALES INVOICE' : 'PURCHASE ORDER';
  addText(invoiceTitle, pageWidth / 2, yPos, { fontSize: 14, fontStyle: 'bold', align: 'center' });
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
  addText(`Order #: ${order.orderNumber || 'N/A'}`, col1X, yPos, { fontSize: 9, fontStyle: 'bold' });
  addText(`Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}`, col2X, yPos, { fontSize: 9 });
  yPos += 5;

  addText(`Status: ${(order.status || 'N/A').toUpperCase()}`, col1X, yPos, { fontSize: 9 });
  yPos += 8;

  // Customer/Supplier info
  const partyLabel = type === 'sale' ? 'Bill To:' : 'Supplier:';
  const party = type === 'sale' ? order.customer : order.supplier;
  const partyCode = type === 'sale' ? party?.customerCode : party?.supplierCode;

  addText(partyLabel, col1X, yPos, { fontSize: 9, fontStyle: 'bold' });
  yPos += 4;
  addText(partyCode ? `${party?.name || 'N/A'} (${partyCode})` : (party?.name || 'N/A'), col1X, yPos, { fontSize: 9 });
  yPos += 4;
  if (party?.email) {
    addText(party.email, col1X, yPos, { fontSize: 8 });
    yPos += 3;
  }
  if (party?.phone) {
    addText(party.phone, col1X, yPos, { fontSize: 8 });
    yPos += 3;
  }
  if (party?.address || party?.city) {
    const address = [party?.address, party?.city, party?.country].filter(Boolean).join(', ');
    addText(address, col1X, yPos, { fontSize: 8 });
  }

  yPos += 10;

  // Check if any item has a discount for sales type, or a FOC quantity (either type)
  const hasItemDiscounts = type === 'sale' && (order.items || []).some(item => item.discountPercent > 0);
  const hasFocQty = (order.items || []).some(item => item.focQuantity > 0);

  // Items table - column labels and widths are built from the same list, in
  // the same conditional order as the row values below (Qty, [FOC], [Recv],
  // Price, [Disc %], Total), so header/row/width can never drift out of sync
  // regardless of which optional columns (FOC, Recv, Disc %) are present.
  const itemColumns = [
    { label: '#', width: 8 },
    { label: 'SKU', width: 18 },
    { label: 'Product', width: 'auto' },
    { label: 'Qty', width: 10, halign: 'center' },
  ];
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

  const tableColumns = itemColumns.map((col) => col.label);
  const columnStyles = itemColumns.reduce((styles, col, index) => {
    styles[index] = { cellWidth: col.width, ...(col.halign && { halign: col.halign }) };
    return styles;
  }, {});

  const tableData = (order.items || []).map((item, index) => {
    const row = [
      index + 1,
      item.product?.sku || '-',
      item.product?.name || 'Unknown',
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
  });

  // Use autoTable function directly
  autoTable(doc, {
    startY: yPos,
    head: [tableColumns],
    body: tableData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      font: myanmarFontLoaded ? 'NotoSansMyanmar' : 'helvetica',
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [66, 66, 66],
      textColor: 255,
      // Myanmar font only has 'normal' style, use normal for headers too
      fontStyle: myanmarFontLoaded ? 'normal' : 'bold',
      font: myanmarFontLoaded ? 'NotoSansMyanmar' : 'helvetica',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles,
  });

  // Get the final Y position after the table
  yPos = doc.lastAutoTable.finalY + 8;

  const pageHeight = doc.internal.pageSize.getHeight();
  const FOOTER_HEIGHT = 20; // matches the footer's own layout below (line at pageHeight-20, text through pageHeight-11)

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

  // Worst case: subtotal + discount + tax + separator/gap + TOTAL line
  ensureSpace(5 + 5 + 5 + 4 + 10);

  addText('Subtotal:', totalsX, yPos, { fontSize: 9 });
  addText(formatCurrency(order.subtotal, company?.currency), pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
  yPos += 5;

  // Add order discount if applicable (for sales)
  if (type === 'sale' && order.discountPercent > 0) {
    addText(`Order Discount % (${order.discountPercent}):`, totalsX, yPos, { fontSize: 9 });
    addText(`-${formatCurrency(order.discountAmount, company?.currency)}`, pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
    yPos += 5;
  }

  addText('Tax:', totalsX, yPos, { fontSize: 9 });
  addText(formatCurrency(order.tax, company?.currency), pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
  yPos += 5;

  doc.setLineWidth(0.3);
  doc.line(totalsX, yPos, pageWidth - margin, yPos);
  yPos += 4;

  addText('TOTAL:', totalsX, yPos, { fontSize: 10, fontStyle: 'bold' });
  addText(formatCurrency(order.total, company?.currency), pageWidth - margin, yPos, { fontSize: 10, fontStyle: 'bold', align: 'right' });
  yPos += 10;

  // Notes section
  if (order.notes) {
    const splitNotes = doc.splitTextToSize(String(order.notes), pageWidth - 2 * margin);
    ensureSpace(4 + splitNotes.length * 3.5);

    addText('Notes:', margin, yPos, { fontSize: 9, fontStyle: 'bold' });
    yPos += 4;

    doc.setFontSize(8);
    doc.text(splitNotes, margin, yPos);
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setDrawColor(200);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  addText('Thank you for your business!', pageWidth / 2, footerY, { fontSize: 8, align: 'center' });
  addText(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, footerY + 4, { fontSize: 7, align: 'center' });

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

const loadImage = (url) => {
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
const drawLogoPlaceholder = (doc, name, x, y, size) => {
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
