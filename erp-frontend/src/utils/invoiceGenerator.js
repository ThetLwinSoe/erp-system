import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // Helper function to add text
  const addText = (text, x, y, options = {}) => {
    const { fontSize = 10, fontStyle = 'normal', align = 'left' } = options;
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', fontStyle);
    doc.text(String(text || ''), x, y, { align });
  };

  // Company header with logo and name side by side
  let logoWidth = 0;
  let logoHeight = 0;
  const logoSize = 12; // Small logo size in mm
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
      }
    } catch (error) {
      console.error('Failed to load company logo:', error);
    }
  }

  // Company name (positioned after logo if exists)
  const nameX = hasLogo ? margin + logoWidth + 3 : margin;
  if (company?.name) {
    addText(company.name, nameX, yPos + 3, { fontSize: 14, fontStyle: 'bold' });
  }

  // Company address and contact (below name, aligned with name)
  let contactY = yPos + 8;
  if (company?.address) {
    addText(company.address, nameX, contactY, { fontSize: 8 });
    contactY += 3;
  }
  if (company?.phone || company?.email) {
    const contactInfo = [company?.phone, company?.email].filter(Boolean).join(' | ');
    addText(contactInfo, nameX, contactY, { fontSize: 8 });
    contactY += 3;
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

  addText(partyLabel, col1X, yPos, { fontSize: 9, fontStyle: 'bold' });
  yPos += 4;
  addText(party?.name || 'N/A', col1X, yPos, { fontSize: 9 });
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

  // Items table
  const tableColumns = type === 'sale'
    ? ['#', 'Product', 'Qty', 'Price', 'Total']
    : ['#', 'Product', 'Qty', 'Recv', 'Price', 'Total'];

  const tableData = (order.items || []).map((item, index) => {
    const row = [
      index + 1,
      item.product?.name || 'Unknown',
      item.quantity || 0,
    ];

    if (type === 'purchase') {
      row.push(item.receivedQuantity || 0);
    }

    row.push(`$${parseFloat(item.unitPrice || 0).toFixed(2)}`);
    row.push(`$${parseFloat(item.total || 0).toFixed(2)}`);

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
    },
    headStyles: {
      fillColor: [66, 66, 66],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: type === 'sale' ? {
      0: { cellWidth: 8 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
    } : {
      0: { cellWidth: 8 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
    },
  });

  // Get the final Y position after the table
  yPos = doc.lastAutoTable.finalY + 8;

  // Totals section
  const totalsX = pageWidth - margin - 50;

  addText('Subtotal:', totalsX, yPos, { fontSize: 9 });
  addText(`$${parseFloat(order.subtotal || 0).toFixed(2)}`, pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
  yPos += 5;

  addText('Tax:', totalsX, yPos, { fontSize: 9 });
  addText(`$${parseFloat(order.tax || 0).toFixed(2)}`, pageWidth - margin, yPos, { fontSize: 9, align: 'right' });
  yPos += 5;

  doc.setLineWidth(0.3);
  doc.line(totalsX, yPos, pageWidth - margin, yPos);
  yPos += 4;

  addText('TOTAL:', totalsX, yPos, { fontSize: 10, fontStyle: 'bold' });
  addText(`$${parseFloat(order.total || 0).toFixed(2)}`, pageWidth - margin, yPos, { fontSize: 10, fontStyle: 'bold', align: 'right' });
  yPos += 10;

  // Notes section
  if (order.notes) {
    addText('Notes:', margin, yPos, { fontSize: 9, fontStyle: 'bold' });
    yPos += 4;

    const splitNotes = doc.splitTextToSize(String(order.notes), pageWidth - 2 * margin);
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
const loadImage = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const dataUrl = canvas.toDataURL('image/png');
        resolve({
          data: dataUrl,
          width: img.width,
          height: img.height,
        });
      } catch (error) {
        console.error('Error converting image:', error);
        resolve(null);
      }
    };

    img.onerror = () => {
      console.error('Failed to load image:', url);
      resolve(null);
    };

    img.src = url;
  });
};

export default generateInvoicePDF;
