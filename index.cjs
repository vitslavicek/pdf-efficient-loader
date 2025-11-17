/**
 * CommonJS wrapper for pdf-efficient-loader
 * This file provides CommonJS compatibility for the ES module
 */

const esmModule = import('./index.js');

let cachedModule = null;

async function getModule() {
  if (!cachedModule) {
    cachedModule = await esmModule;
  }
  return cachedModule;
}

// Export async wrapper functions
module.exports = {
  extractPdfData: async function(pdfSource) {
    const mod = await getModule();
    return mod.extractPdfData(pdfSource);
  },
  
  extractPdfDataStreaming: async function(pdfSource, options) {
    const mod = await getModule();
    return mod.extractPdfDataStreaming(pdfSource, options);
  },
  
  extractPdfStats: async function(pdfSource, options) {
    const mod = await getModule();
    return mod.extractPdfStats(pdfSource, options);
  },
  
  analyzePdfType: async function(pdfSource, options) {
    const mod = await getModule();
    return mod.analyzePdfType(pdfSource, options);
  },
  
  extractPdfSmart: async function(pdfSource, options) {
    const mod = await getModule();
    return mod.extractPdfSmart(pdfSource, options);
  }
};
