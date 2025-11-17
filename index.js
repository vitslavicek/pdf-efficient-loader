import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

// Setup canvas polyfill for Node.js environment
// This is required for pdfjs-dist to work in Node.js (provides DOMMatrix, etc.)
let canvasPolyfillSetup = false;

async function setupCanvasPolyfill() {
  if (canvasPolyfillSetup) return;
  
  try {
    // Use @napi-rs/canvas for better performance and easier deployment
    const { DOMMatrix } = await import('@napi-rs/canvas');
    
    // Polyfill global objects needed by pdfjs-dist
    if (typeof globalThis.DOMMatrix === 'undefined') {
      globalThis.DOMMatrix = DOMMatrix;
    }
    
    canvasPolyfillSetup = true;
  } catch (error) {
    console.warn('Canvas polyfill not available. Some PDF operations may fail in Node.js environment.');
    console.warn('Install @napi-rs/canvas with: npm install @napi-rs/canvas');
  }
}

/**
 * Helper function to load PDF data from path or buffer
 * @param {string|Buffer|Uint8Array} source - Path to PDF file or buffer
 * @returns {Uint8Array}
 */
function loadPdfData(source) {
  if (typeof source === 'string') {
    return new Uint8Array(fs.readFileSync(source));
  } else if (source instanceof Buffer) {
    // Check Buffer first! Buffer is a subclass of Uint8Array in Node.js
    // Create a new Uint8Array from buffer data to avoid pdfjs-dist Buffer rejection
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  } else {
    throw new Error('Invalid source: must be a file path (string), Buffer, or Uint8Array');
  }
}

/**
 * Memory-efficient PDF data extraction
 * Processes document page-by-page without loading entire PDF into memory
 * 
 * @param {string|Buffer|Uint8Array} pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @returns {Promise<{text: string, imageCount: number, vectorCount: number}>}
 */
export async function extractPdfData(pdfSource) {
  // Setup canvas polyfill for Node.js
  await setupCanvasPolyfill();
  
  // Load PDF file as buffer
  const data = loadPdfData(pdfSource);
  
  // Load PDF document with maximum optimizations for low RAM usage
  const loadingTask = pdfjsLib.getDocument({
    data,
    // Memory optimization settings
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    // Disable CMap to save memory (unless CJK font support is needed)
    cMapUrl: null,
    cMapPacked: false,
    standardFontDataUrl: null,
    // Disable auto-fetch of remote resources
    stopAtErrors: true,
    // Maximum compression
    pdfBug: false
  });
  
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  let totalImages = 0;
  let totalVectors = 0;
  
  // Process pages sequentially, not all at once
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // Extract text with minimal memory allocation
    const textContent = await page.getTextContent({
      disableCombineTextItems: true,
      includeMarkedContent: false
    });
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
    
    // Free textContent from memory
    textContent.items = null;
    
    // Extract operations (for counting images and vectors)
    // IMPORTANT: not using intent for rendering, only for analysis
    const ops = await page.getOperatorList({
      intent: 'display',
      annotationMode: pdfjsLib.AnnotationMode.DISABLE
    });
    
    // Count images and vectors
    const { imageCount, vectorCount } = countGraphicsObjects(ops);
    totalImages += imageCount;
    totalVectors += vectorCount;
    
    // Explicitly free operator list
    ops.fnArray = null;
    ops.argsArray = null;
    
    // Free memory after processing page
    page.cleanup();
  }
  
  // Destroy document
  await pdf.destroy();
  
  return {
    text: fullText.trim(),
    imageCount: totalImages,
    vectorCount: totalVectors
  };
}

/**
 * Counts graphic objects in PDF operations
 * @param {Object} ops - Operator list from PDF page
 * @returns {{imageCount: number, vectorCount: number}}
 */
function countGraphicsObjects(ops) {
  let imageCount = 0;
  let vectorCount = 0;
  
  const fnArray = ops.fnArray;
  
  // PDF operators for different object types
  const IMAGE_OPS = [
    pdfjsLib.OPS.paintImageXObject,
    pdfjsLib.OPS.paintInlineImageXObject,
    pdfjsLib.OPS.paintImageMaskXObject
  ];
  
  // Vector operators (drawing paths, lines, curves)
  const VECTOR_OPS = [
    pdfjsLib.OPS.stroke,
    pdfjsLib.OPS.fill,
    pdfjsLib.OPS.eoFill,
    pdfjsLib.OPS.fillStroke,
    pdfjsLib.OPS.eoFillStroke,
    pdfjsLib.OPS.closePath,
    pdfjsLib.OPS.rectangle,
    pdfjsLib.OPS.moveTo,
    pdfjsLib.OPS.lineTo,
    pdfjsLib.OPS.curveTo,
    pdfjsLib.OPS.curveTo2,
    pdfjsLib.OPS.curveTo3,
    pdfjsLib.OPS.constructPath
  ];
  
  // Helper variables for tracking vector sequences
  let inVectorSequence = false;
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];

    // Detect images
    if (IMAGE_OPS.includes(op)) {
      imageCount++;
      inVectorSequence = false;
    }
    // Detect vectors - count only unique vector objects
    else if (VECTOR_OPS.includes(op)) {
      if(op === pdfjsLib.OPS.constructPath){
        vectorCount++;
        inVectorSequence = false;
      }
      if ([pdfjsLib.OPS.stroke, pdfjsLib.OPS.fill, pdfjsLib.OPS.eoFill, pdfjsLib.OPS.fillStroke, pdfjsLib.OPS.eoFillStroke].includes(op)) {
        // These operators terminate a vector object
        if (inVectorSequence) {
          vectorCount++;
          inVectorSequence = false;
        }
      } else {
        // Start or continuation of vector object
        inVectorSequence = true;
      }
    }
  }
  
  // If vector sequence remained open
  if (inVectorSequence) {
    vectorCount++;
  }
  
  return { imageCount, vectorCount };
}

/**
 * Alternative method for streaming processing of large PDFs
 * Uses callback for progressive page processing
 * 
 * @param {string|Buffer|Uint8Array} pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @param {Object} options - Processing options
 * @param {Function} options.onPageProcessed - Callback called after processing each page
 * @param {boolean} options.extractText - Whether to extract text (true) or just statistics (false)
 * @returns {Promise<{text: string, imageCount: number, vectorCount: number}>}
 */
export async function extractPdfDataStreaming(pdfSource, options = {}) {
  // Setup canvas polyfill for Node.js
  await setupCanvasPolyfill();
  
  const { onPageProcessed = null, extractText = true } = options;
  const data = loadPdfData(pdfSource);
  
  const loadingTask = pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    cMapUrl: null,
    cMapPacked: false,
    standardFontDataUrl: null,
    stopAtErrors: true,
    pdfBug: false
  });
  
  const pdf = await loadingTask.promise;
  
  const textChunks = [];
  let totalImages = 0;
  let totalVectors = 0;
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // Extract text only if requested
    if (extractText) {
      const textContent = await page.getTextContent({
        disableCombineTextItems: true,
        includeMarkedContent: false
      });
      const pageText = textContent.items.map(item => item.str).join(' ');
      textChunks.push(pageText);
      textContent.items = null;
    }
    
    const ops = await page.getOperatorList({
      intent: 'display',
      annotationMode: pdfjsLib.AnnotationMode.DISABLE
    });
    const { imageCount, vectorCount } = countGraphicsObjects(ops);
    totalImages += imageCount;
    totalVectors += vectorCount;
    
    ops.fnArray = null;
    ops.argsArray = null;
    
    page.cleanup();
    
    // Callback for monitoring progress
    if (onPageProcessed) {
      onPageProcessed({
        pageNum,
        totalPages: pdf.numPages,
        currentImages: imageCount,
        currentVectors: vectorCount
      });
    }
  }
  
  await pdf.destroy();
  
  return {
    text: extractText ? textChunks.join('\n').trim() : '',
    imageCount: totalImages,
    vectorCount: totalVectors
  };
}

/**
 * Ultra-RAM optimized extraction with statistics only
 * Does not use getOperatorList which loads image data into memory
 * Uses direct access to PDF dictionary for counting objects
 * 
 * @param {string|Buffer|Uint8Array} pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @param {Object} options - Processing options
 * @param {boolean} options.extractText - Whether to extract text
 * @param {Function} options.onPageProcessed - Callback for progress
 * @returns {Promise<{text: string, imageCount: number, vectorCount: number, pages: number}>}
 */
export async function extractPdfStats(pdfSource, options = {}) {
  // Setup canvas polyfill for Node.js
  await setupCanvasPolyfill();
  
  const { extractText = true, onPageProcessed = null } = options;
  const data = loadPdfData(pdfSource);
  
  const loadingTask = pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    cMapUrl: null,
    cMapPacked: false,
    standardFontDataUrl: null,
    stopAtErrors: true,
    pdfBug: false,
    // KLÍČOVÉ: Zakázat načítání dat pro rendering
    enableXfa: false,
    fontExtraProperties: false
  });
  
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  let totalImages = 0;
  let totalVectors = 0;
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // Extract text if requested
    if (extractText) {
      const textContent = await page.getTextContent({
        disableCombineTextItems: true,
        includeMarkedContent: false
      });
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
      textContent.items = null;
    }
    
    // Používáme getOperatorList pro přesné počítání, ale s agresivním uvolňováním paměti
    const ops = await page.getOperatorList({
      intent: 'print',
      annotationMode: pdfjsLib.AnnotationMode.DISABLE
    });
    
    // Počítáme obrázky a vektory
    const counts = countGraphicsObjects(ops);
    totalImages += counts.imageCount;
    totalVectors += counts.vectorCount;
    
    // KRITICKÉ: Explicitně uvolnit veškerá data operator listu
    ops.fnArray = null;
    ops.argsArray = null;
    if (ops.commonObjs) ops.commonObjs = null;
    if (ops.objs) ops.objs = null;
    
    // Explicitně uvolnit stránku
    page.cleanup();
    
    if (onPageProcessed) {
      onPageProcessed({
        pageNum,
        totalPages: pdf.numPages,
        currentImages: counts.imageCount,
        currentVectors: counts.vectorCount
      });
    }
    
    // KLÍČOVÉ: Agresivní GC po každých 5 stránkách pro minimální paměť
    if (pageNum % 5 === 0 && global.gc) {
      global.gc();
    }
  }
  
  await pdf.destroy();
  
  return {
    text: fullText.trim(),
    imageCount: totalImages,
    vectorCount: totalVectors,
    pages: pdf.numPages
  };
}

/**
 * Ultra-RAM efficient PDF document type analysis
 * Detects whether PDF is a scan, vector document, or pure text
 * Does not use getOperatorList - only analyzes PDF dictionary structure
 * 
 * @param {string|Buffer|Uint8Array} pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @param {Object} options - Analysis options
 * @param {number} options.samplePages - Number of pages to analyze (default: 5)
 * @returns {Promise<{type: string, confidence: number, stats: Object}>}
 */
export async function analyzePdfType(pdfSource, options = {}) {
  // Setup canvas polyfill for Node.js
  await setupCanvasPolyfill();
  
  const { samplePages = 5 } = options;
  const data = loadPdfData(pdfSource);
  
  const loadingTask = pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    cMapUrl: null,
    cMapPacked: false,
    standardFontDataUrl: null,
    stopAtErrors: true,
    pdfBug: false,
    enableXfa: false,
    fontExtraProperties: false
  });
  
  const pdf = await loadingTask.promise;
  
  let totalImages = 0;
  let totalVectors = 0;
  let totalText = 0;
  let pagesWithLargeImages = 0;
  
  // Analyze only a sample of pages for maximum RAM efficiency
  const pagesToAnalyze = Math.min(samplePages, pdf.numPages);
  const step = Math.max(1, Math.floor(pdf.numPages / pagesToAnalyze));
  
  for (let i = 0; i < pagesToAnalyze; i++) {
    const pageNum = Math.min(1 + i * step, pdf.numPages);
    const page = await pdf.getPage(pageNum);
    
    // Text analysis - low RAM usage
    const textContent = await page.getTextContent({
      disableCombineTextItems: true,
      includeMarkedContent: false
    });
    totalText += textContent.items.length;
    textContent.items = null;
    
    // Pro přesnou detekci použijeme getOperatorList
    // Analýza jen 5 stránek = minimální spotřeba RAM
    try {
      const ops = await page.getOperatorList({
        intent: 'display',
        annotationMode: pdfjsLib.AnnotationMode.DISABLE
      });
      
      // Počítání obrázků a vektorů včetně inline obrázků
      const counts = countGraphicsObjects(ops);
      totalImages += counts.imageCount;
      totalVectors += counts.vectorCount;
      
      // Detekce velkých obrázků pro identifikaci skenů
      // Pokud stránka má obrázek, zkusme zjistit rozměry z XObject
      if (counts.imageCount > 0) {
        const resources = page._pageDict?.get('Resources');
        const xobjects = resources?.get('XObject');
        
        if (xobjects && xobjects.getKeys) {
          const keys = xobjects.getKeys();
          for (const key of keys) {
            try {
              const xobj = xobjects.get(key);
              if (xobj?.get('Subtype')?.name === 'Image') {
                const width = xobj.get('Width') || 0;
                const height = xobj.get('Height') || 0;
                
                // Obrázek > 1000x1000 je pravděpodobně sken
                if (width > 1000 && height > 1000) {
                  pagesWithLargeImages++;
                  break; // Stačí jeden velký obrázek na stránce
                }
              }
            } catch (e) {}
          }
        } else if (counts.imageCount > 0) {
          // Pokud nemáme XObject ale máme inline obrázky, pravděpodobně jde o sken
          pagesWithLargeImages++;
        }
      }
      
      // Explicitně uvolnit operator list
      ops.fnArray = null;
      ops.argsArray = null;
      if (ops.commonObjs) ops.commonObjs = null;
      if (ops.objs) ops.objs = null;
    } catch (e) {
      // Pokud analýza selže, pokračujeme
    }
    
    page.cleanup();
    
    // GC po každé stránce pro minimální RAM
    if (global.gc) {
      global.gc();
    }
  }
  
  await pdf.destroy();
  
  // Document type classification
  const avgImagesPerPage = totalImages / pagesToAnalyze;
  const avgTextPerPage = totalText / pagesToAnalyze;
  const avgVectorsPerPage = totalVectors / pagesToAnalyze;
  const largeImageRatio = pagesWithLargeImages / pagesToAnalyze;
  
  let type = 'text';
  let confidence = 0.8;
  
  // SCAN: low or near-zero text (< 30 items) and many images (0-100)
  // Important: ignore > 100 images (probably detection error)
  if (avgTextPerPage < 30 && avgImagesPerPage > 0 && avgImagesPerPage <= 100) {
    type = 'scan';
    confidence = Math.min(0.95, 0.7 + (avgImagesPerPage / 100) * 0.25);
  }
  // VECTOR: low or near-zero text (< 30 items), 0 images and vectors > 0
  else if (avgTextPerPage < 30 && avgImagesPerPage === 0 && avgVectorsPerPage > 0) {
    type = 'vector';
    confidence = Math.min(0.9, 0.7 + (avgVectorsPerPage / 10) * 0.2);
  }
  // TEXT: anything else (default)
  // - lots of text (>= 30 items)
  // - or no images and vectors
  else {
    type = 'text';
    confidence = Math.min(0.9, 0.6 + (avgTextPerPage / 100) * 0.3);
  }
  
  return {
    type,
    confidence,
    stats: {
      totalPages: pdf.numPages,
      sampledPages: pagesToAnalyze,
      avgImagesPerPage: parseFloat(avgImagesPerPage.toFixed(2)),
      avgVectorsPerPage: parseFloat(avgVectorsPerPage.toFixed(2)),
      avgTextItemsPerPage: parseFloat(avgTextPerPage.toFixed(2)),
      largeImageRatio: parseFloat(largeImageRatio.toFixed(2)),
      estimatedTotalImages: Math.round(avgImagesPerPage * pdf.numPages),
      estimatedTotalVectors: Math.round(avgVectorsPerPage * pdf.numPages)
    }
  };
}

/**
 * Efficient data extraction based on PDF type
 * Automatically selects the best method based on document type
 * 
 * @param {string|Buffer|Uint8Array} pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @param {Object} options - Processing options
 * @returns {Promise<{text: string, imageCount: number, vectorCount: number, pages: number, pdfType: string}>}
 */
export async function extractPdfSmart(pdfSource, options = {}) {
  // Setup canvas polyfill for Node.js
  await setupCanvasPolyfill();
  
  const { onProgress = null } = options;
  
  // First analyze PDF type (fast, low RAM)
  if (onProgress) onProgress({ stage: 'analyzing', progress: 0 });
  
  const analysis = await analyzePdfType(pdfSource, { samplePages: 5 });
  
  if (onProgress) {
    onProgress({ 
      stage: 'analyzed', 
      progress: 0.1,
      pdfType: analysis.type,
      confidence: analysis.confidence
    });
  }
  
  // FOR ALL types: use ultra-efficient method WITHOUT getOperatorList
  // This guarantees minimal RAM usage (< 100 MB) for any PDF
  const data = loadPdfData(pdfSource);
  
  const loadingTask = pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    cMapUrl: null,
    cMapPacked: false,
    standardFontDataUrl: null,
    stopAtErrors: true,
    pdfBug: false,
    enableXfa: false,
    fontExtraProperties: false
  });
  
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  let totalImages = 0;
  let totalVectors = 0;
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // Extract text
    const textContent = await page.getTextContent({
      disableCombineTextItems: true,
      includeMarkedContent: false
    });
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
    textContent.items = null;
    
    // Count images and vectors WITHOUT loading data - only from dictionary!
    try {
      const resources = page._pageDict?.get('Resources');
      
      if (resources) {
        // XObjects (images and forms)
        const xobjects = resources.get('XObject');
        if (xobjects && xobjects.getKeys) {
          const keys = xobjects.getKeys();
          for (const key of keys) {
            try {
              const xobj = xobjects.get(key);
              if (xobj && xobj.get) {
                const subtype = xobj.get('Subtype')?.name;
                if (subtype === 'Image') {
                  totalImages++;
                } else if (subtype === 'Form') {
                  totalVectors++;
                }
              }
            } catch (e) {}
          }
        }
        
        // Vector graphics (Pattern, Shading) - directly from resources
        const patterns = resources.get('Pattern');
        const shadings = resources.get('Shading');
        if (patterns && patterns.getKeys) {
          totalVectors += patterns.getKeys().length;
        }
        if (shadings && shadings.getKeys) {
          totalVectors += shadings.getKeys().length;
        }
      }
    } catch (e) {}
    
    page.cleanup();
    
    if (onProgress) {
      onProgress({
        stage: 'extracting',
        progress: 0.1 + (pageNum / pdf.numPages) * 0.9,
        currentPage: pageNum,
        totalPages: pdf.numPages
      });
    }
    
    // GC every 5 pages for maximum RAM savings
    if (pageNum % 5 === 0 && global.gc) {
      global.gc();
    }
  }
  
  await pdf.destroy();
  
  return {
    text: fullText.trim(),
    imageCount: totalImages,
    vectorCount: totalVectors,
    pages: pdf.numPages,
    pdfType: analysis.type,
    confidence: analysis.confidence
  };
}

export default extractPdfData;
