# Switch from Noto Sans Myanmar to Padauk Font

## Why Padauk?

Padauk font often works better with jsPDF because:
- Smaller file size (~200KB vs 500KB)
- Better digital rendering
- Designed specifically for screen/PDF use
- Better glyph support for Myanmar script

## Steps to Switch

### Step 1: Download Padauk Font

1. Visit: https://software.sil.org/padauk/download/
2. Click "Download Padauk (version 5.001)"
3. Extract the ZIP file
4. Find the file: **`Padauk-Regular.ttf`**

### Step 2: Convert to Base64

1. Go to: https://products.aspose.app/font/base64
2. Upload `Padauk-Regular.ttf`
3. Click "Convert"
4. Copy the entire base64 string

### Step 3: Update pdfFonts.js

Open: `erp-frontend/src/utils/pdfFonts.js`

#### Change 1: Replace the font data (Line 31)

Find the line that starts with:
```javascript
export const NotoSansMyanmar = 'AAE...
```

Replace it with:
```javascript
export const PadaukFont = 'YOUR_PADAUK_BASE64_STRING_HERE';
```

**Note**: You're replacing:
- Variable name: `NotoSansMyanmar` → `PadaukFont`
- Base64 string: Noto Sans data → Padauk data

#### Change 2: Update the font loading code (Around line 42)

Find:
```javascript
if (typeof NotoSansMyanmar !== 'undefined') {
  doc.addFileToVFS('NotoSansMyanmar-Regular.ttf', NotoSansMyanmar);
  doc.addFont('NotoSansMyanmar-Regular.ttf', 'NotoSansMyanmar', 'normal');
  return true;
}
```

Replace with:
```javascript
if (typeof PadaukFont !== 'undefined') {
  doc.addFileToVFS('Padauk-Regular.ttf', PadaukFont);
  doc.addFont('Padauk-Regular.ttf', 'Padauk', 'normal');
  return true;
}
```

#### Change 3: Update getFontForText function (Around line 74)

Find:
```javascript
export const getFontForText = (text, fontAvailable) => {
  if (containsMyanmarText(text) && fontAvailable) {
    return 'NotoSansMyanmar';
  }
  return 'helvetica';
};
```

Replace with:
```javascript
export const getFontForText = (text, fontAvailable) => {
  if (containsMyanmarText(text) && fontAvailable) {
    return 'Padauk';
  }
  return 'helvetica';
};
```

### Step 4: Update invoiceGenerator.js

Open: `erp-frontend/src/utils/invoiceGenerator.js`

Find line 167:
```javascript
font: myanmarFontLoaded ? 'NotoSansMyanmar' : 'helvetica',
```

Replace with:
```javascript
font: myanmarFontLoaded ? 'Padauk' : 'helvetica',
```

Find line 173:
```javascript
font: myanmarFontLoaded ? 'NotoSansMyanmar' : 'helvetica',
```

Replace with:
```javascript
font: myanmarFontLoaded ? 'Padauk' : 'helvetica',
```

### Step 5: Restart Frontend

1. Stop the frontend (Ctrl+C)
2. Start again: `npm run dev`
3. Test PDF generation

---

## Alternative: Try Myanmar3 Font

If Padauk doesn't work, try **Myanmar3**:
- Download: Search "Myanmar3 font download"
- Follow same steps as above
- Replace font name with 'Myanmar3'

---

## Troubleshooting

### Check Console for Errors

When generating PDF, open browser console (F12):

**✅ Success**: No errors
**❌ Error**: "Invalid font" or "Font not found" → Check font name matches exactly
**❌ Error**: "Failed to load" → Check base64 string is complete

### Font Still Garbled?

1. Verify you copied the ENTIRE base64 string (should be one very long line)
2. Check for any line breaks in the base64 string (should be none)
3. Make sure you're using the Regular weight (not Bold, Italic, etc.)

### PDF Generation is Slow

Large fonts slow down PDF generation:
- Padauk: ~200KB (faster)
- Noto Sans Myanmar: ~500KB (slower)

This is normal and only affects generation time, not viewing speed.

---

## Quick Reference

| What | Noto Sans Myanmar | Padauk |
|------|------------------|---------|
| Variable name | `NotoSansMyanmar` | `PadaukFont` |
| Font file | NotoSansMyanmar-Regular.ttf | Padauk-Regular.ttf |
| Font name in jsPDF | 'NotoSansMyanmar' | 'Padauk' |
| File size | ~500KB | ~200KB |
