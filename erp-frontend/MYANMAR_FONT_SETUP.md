# Myanmar/Burmese Font Support for PDF Exports

## Current Status

✅ **CSV Exports**: Fully support Myanmar/Unicode text (fixed with UTF-8 BOM)
⚠️ **PDF Exports**: Myanmar text will show as garbled characters until font is added

## Why PDF Shows Garbled Text

jsPDF's default fonts (Helvetica, Times, Courier) only support basic Latin characters. They don't include Myanmar Unicode glyphs, which causes Myanmar text to display incorrectly.

## Solution: Add Myanmar Font to jsPDF

Follow these steps to enable Myanmar font support in PDF exports:

### Step 1: Download Myanmar Font

1. Visit [Google Fonts - Noto Sans Myanmar](https://fonts.google.com/noto/specimen/Noto+Sans+Myanmar)
2. Click **"Get font"** or **"Download family"**
3. Extract the ZIP file
4. Find the file: `NotoSansMyanmar-Regular.ttf`

### Step 2: Convert Font to Base64

1. Go to [Aspose Font to Base64 Converter](https://products.aspose.app/font/base64)
2. Upload `NotoSansMyanmar-Regular.ttf`
3. Click **"Convert"**
4. Copy the entire base64 string (it will be very long, 500KB+)

### Step 3: Add Font to Your Project

Open the file: `erp-frontend/src/utils/pdfFonts.js`

Find this line:
```javascript
// export const NotoSansMyanmar = 'PASTE_BASE64_FONT_DATA_HERE';
```

Replace it with:
```javascript
export const NotoSansMyanmar = 'YOUR_COPIED_BASE64_STRING_HERE';
```

### Step 4: Enable the Font

In the same `pdfFonts.js` file, find this commented section:
```javascript
/*
if (typeof NotoSansMyanmar !== 'undefined') {
  doc.addFileToVFS('NotoSansMyanmar-Regular.ttf', NotoSansMyanmar);
  doc.addFont('NotoSansMyanmar-Regular.ttf', 'NotoSansMyanmar', 'normal');
  return true;
}
*/
```

Uncomment it (remove `/*` and `*/`):
```javascript
if (typeof NotoSansMyanmar !== 'undefined') {
  doc.addFileToVFS('NotoSansMyanmar-Regular.ttf', NotoSansMyanmar);
  doc.addFont('NotoSansMyanmar-Regular.ttf', 'NotoSansMyanmar', 'normal');
  return true;
}
```

### Step 5: Test

1. Restart your frontend server
2. Create an invoice with Myanmar text (customer name, product name, etc.)
3. Generate PDF
4. Myanmar text should now display correctly! 🎉

## Alternative Solutions (If Above Doesn't Work)

### Option A: Backend PDF Generation

Generate PDFs on the backend using Node.js libraries that have better Unicode support:

```bash
npm install pdfkit
```

Backend libraries handle fonts better and support Myanmar out of the box.

### Option B: Use Puppeteer

Generate PDFs by rendering HTML with Puppeteer (uses Chrome's PDF engine):

```bash
npm install puppeteer
```

This gives you full browser font rendering capabilities.

### Option C: Print to PDF

Add a "Print" button that opens a printer-friendly page. Users can use browser's "Print to PDF" which fully supports Myanmar fonts.

## Troubleshooting

**Q: PDF file size is huge after adding font**
A: Myanmar fonts are large (500KB-1MB). This is normal. Each PDF will embed the font.

**Q: Font still shows as boxes**
A: Make sure you uncommented ALL the code in Step 4 and the base64 string is complete (no line breaks).

**Q: Console shows "Failed to load Myanmar font"**
A: Check that the font name matches exactly: `NotoSansMyanmar` (case-sensitive).

## Technical Details

- **Modified Files**:
  - `erp-frontend/src/pages/SalesReport.jsx` - Added UTF-8 BOM to CSV export
  - `erp-frontend/src/pages/PurchasesReport.jsx` - Added UTF-8 BOM to CSV export
  - `erp-frontend/src/utils/invoiceGenerator.js` - Added Myanmar font support
  - `erp-frontend/src/utils/pdfFonts.js` - Font configuration (NEW)

- **Myanmar Unicode Range**: U+1000 to U+109F
- **Font Detection**: Automatic detection of Myanmar characters
- **Font Fallback**: Falls back to Helvetica if Myanmar font not loaded

---

**Need Help?** Check the console for warning messages when generating PDFs with Myanmar text.
