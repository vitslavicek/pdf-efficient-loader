# PDF Efficient Loader 📄

Memory-efficient Node.js library for extracting text, counting images and vectors from PDF files with intelligent document type detection.

## ✨ Key Features

- **🚀 Ultra-low RAM usage** - page-by-page processing (< 100MB even for large PDFs with hundreds of images)
- **🤖 Smart PDF type detection** - automatically identifies scans, vector documents, and text-based PDFs
- **📊 Streaming mode** - with progress callbacks for monitoring
- **🎯 Simple API** - just one function call
- **🧹 Automatic memory cleanup** - aggressive garbage collection after each page
- **⚡ Fast processing** - 50-100+ pages/second depending on document type

## 📦 Installation

```bash
npm install pdf-efficient-loader
```

**Note:** The library uses `@napi-rs/canvas` for Node.js compatibility. This provides better performance and easier deployment compared to node-canvas, with no system dependencies required.

## 🎯 Usage

### Smart extraction (recommended)

Automatically detects PDF type and uses the most efficient extraction method:

**ES Modules (Node.js, modern bundlers):**
```javascript
import { extractPdfSmart } from 'pdf-efficient-loader';

// From file path
const result = await extractPdfSmart('./document.pdf', {
  onProgress: (progress) => {
    if (progress.stage === 'extracting') {
      console.log(`Processing: ${progress.currentPage}/${progress.totalPages}`);
    }
  }
});

console.log('Type:', result.pdfType);        // 'scan', 'vector', or 'text'
console.log('Text:', result.text);
console.log('Images:', result.imageCount);
console.log('Vectors:', result.vectorCount);
console.log('Pages:', result.pages);
```

**CommonJS (TypeScript with commonjs, older Node.js):**
```javascript
const { extractPdfSmart } = require('pdf-efficient-loader');

// Usage is the same
const result = await extractPdfSmart('./document.pdf');
```

**Using with Buffer or Uint8Array:**
```javascript
import { extractPdfSmart } from 'pdf-efficient-loader';
import fs from 'fs';

// From buffer (e.g., uploaded file, HTTP response)
const buffer = fs.readFileSync('./document.pdf');
const result = await extractPdfSmart(buffer);

// From Uint8Array
const uint8Array = new Uint8Array(buffer);
const result = await extractPdfSmart(uint8Array);
```

### Analyze PDF type first

```javascript
import { analyzePdfType } from 'pdf-efficient-loader';

const analysis = await analyzePdfType('./document.pdf', { samplePages: 5 });

console.log('Type:', analysis.type);              // 'scan', 'vector', or 'text'
console.log('Confidence:', analysis.confidence);  // 0.0 - 1.0
console.log('Stats:', analysis.stats);
```

### Basic extraction

```javascript
import { extractPdfData } from 'pdf-efficient-loader';

const result = await extractPdfData('./document.pdf');

console.log('Text:', result.text);
console.log('Images:', result.imageCount);
console.log('Vectors:', result.vectorCount);
```

## 📋 API

### `analyzePdfType(pdfSource, options)`

Analyzes PDF document type by sampling pages (very low RAM usage).

**Parameters:**
- `pdfSource` (string | Buffer | Uint8Array) - Path to PDF file, Buffer, or Uint8Array
- `options.samplePages` (number, optional) - Number of pages to sample (default: 5)

**Returns:**
```typescript
Promise<{
  type: 'scan' | 'vector' | 'text',
  confidence: number,  // 0.0 - 1.0
  stats: {
    totalPages: number,
    sampledPages: number,
    avgImagesPerPage: number,
    avgVectorsPerPage: number,
    avgTextItemsPerPage: number,
    largeImageRatio: number,
    estimatedTotalImages: number,
    estimatedTotalVectors: number
  }
}>
```

### `extractPdfSmart(pdfSource, options)`

Intelligent extraction that automatically selects the best method based on PDF type.

**Parameters:**
- `pdfSource` (string | Buffer | Uint8Array) - Path to PDF file, Buffer, or Uint8Array
- `options.onProgress` (function, optional) - Progress callback

**Returns:**
```typescript
Promise<{
  text: string,
  imageCount: number,
  vectorCount: number,
  pages: number,
  pdfType: 'scan' | 'vector' | 'text',
  confidence: number
}>
```

### `extractPdfData(pdfSource)`

Basic extraction from PDF file.

**Parameters:**
- `pdfSource` (string | Buffer | Uint8Array) - Path to PDF file, Buffer, or Uint8Array

**Returns:**
```typescript
Promise<{
  text: string,
  imageCount: number,
  vectorCount: number
}>
```

### `extractPdfStats(pdfSource, options)`

Extraction with statistics and optional text extraction.

**Parameters:**
- `pdfSource` (string | Buffer | Uint8Array) - Path to PDF file, Buffer, or Uint8Array
- `options.extractText` (boolean, optional) - Extract text (default: true)
- `options.onPageProcessed` (function, optional) - Page callback

**Returns:**
```typescript
Promise<{
  text: string,
  imageCount: number,
  vectorCount: number,
  pages: number
}>
```

## 🚀 Running Examples

```bash
# Analyze PDF type only
node example.js path/to/document.pdf

# Analyze and extract data
node --expose-gc example.js path/to/document.pdf --extract

# Or via npm
npm start path/to/document.pdf
```

**Note:** Use `--expose-gc` flag for optimal memory management with large PDFs.

## 📚 PDF Type Classification

### SCAN
- Low text content (< 30 text items per page)
- Contains images (0-100 per page)
- **Use case:** Requires OCR for text extraction

### VECTOR
- Low text content (< 30 text items per page)
- No images (0 per page)
- Contains vector graphics (> 0)
- **Use case:** Requires OCR for text extraction

### TEXT
- High text content (≥ 30 text items per page)
- Or any document that doesn't fit SCAN/VECTOR criteria
- **Use case:** Text can be extracted directly from PDF

## 🎨 What counts as a vector?

Vector objects include:
- Lines and curves
- Rectangles and polygons
- Filled shapes
- Paths and their outlines
- Patterns and shadings

Counts unique vector objects, not individual operations.

## 🖼️ What counts as an image?

Raster images:
- XObject images
- Inline images
- Image masks

## 💡 Memory Optimization Techniques

The library uses several techniques to minimize RAM usage:

1. **Page-by-page processing** - processes one page at a time
2. **Explicit cleanup** - `page.cleanup()` after each page
3. **Aggressive GC** - garbage collection every 5 pages
4. **Direct dictionary access** - reads PDF structure without loading image data
5. **Disabled font loading** - skips unnecessary font data
6. **Document destruction** - `pdf.destroy()` at the end
7. **Operator list cleanup** - explicitly nullifies large objects

### Memory Usage Comparison

| Method | RAM Usage (97 pages, 351 images) | Speed |
|--------|-----------------------------------|-------|
| Standard (with getOperatorList) | ~750 MB | 10 pages/s |
| **Optimized (extractPdfSmart)** | **~50 MB** | **97 pages/s** |

**Result: 93% RAM reduction** 🎉

## 📊 Memory Usage Testing

Monitor memory consumption:

```javascript
import { extractPdfSmart } from './index.js';

const before = process.memoryUsage();
const result = await extractPdfSmart('./large-document.pdf');
const after = process.memoryUsage();

if (global.gc) global.gc();

console.log('Memory usage:');
console.log('Heap:', ((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2), 'MB');
console.log('RSS:', ((after.rss - before.rss) / 1024 / 1024).toFixed(2), 'MB');
```

**Tip:** Run with `node --expose-gc` for accurate measurements.

## 🛠️ Technology Stack

- **pdfjs-dist** - Mozilla PDF.js library
- **Node.js** - ES modules

## 🤝 Use Cases

- **Document processing pipelines** - classify PDFs before OCR
- **Large-scale PDF analysis** - process thousands of PDFs with minimal RAM
- **PDF metadata extraction** - get document statistics without full parsing
- **Smart OCR routing** - send only scans/vectors to OCR, extract text directly from text PDFs

## 📝 License

MIT
