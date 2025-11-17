import { analyzePdfType, extractPdfSmart } from './index.js';

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('❌ Missing PDF file path');
  console.error('Usage: node example.js <path_to_pdf> [--extract | -e]');
  process.exit(1);
}

console.log('🔍 PDF Document Analysis');
console.log('━'.repeat(60));
console.log('File:', pdfPath);
console.log('━'.repeat(60));

try {
  // Phase 1: Fast type analysis (very low RAM)
  console.log('\n⚡ Phase 1: PDF Type Detection...\n');
  
  const analysis = await analyzePdfType(pdfPath, { samplePages: 5 });
  
  console.log('📊 Analysis Results:');
  console.log('━'.repeat(60));
  console.log(`📄 Document Type: ${analysis.type.toUpperCase()}`);
  console.log(`🎯 Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
  console.log('');
  console.log('📈 Statistics (based on sample):');
  console.log(`  • Total pages: ${analysis.stats.totalPages}`);
  console.log(`  • Analyzed pages: ${analysis.stats.sampledPages}`);
  console.log(`  • Avg images/page: ${analysis.stats.avgImagesPerPage}`);
  console.log(`  • Avg vectors/page: ${analysis.stats.avgVectorsPerPage}`);
  console.log(`  • Avg text/page: ${analysis.stats.avgTextItemsPerPage} items`);
  console.log(`  • Large image ratio: ${(analysis.stats.largeImageRatio * 100).toFixed(1)}%`);
  console.log('');
  console.log('🔮 Estimates:');
  console.log(`  • Estimated total images: ${analysis.stats.estimatedTotalImages}`);
  console.log(`  • Estimated total vectors: ${analysis.stats.estimatedTotalVectors}`);
  
  console.log('━'.repeat(60));
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  if (analysis.type === 'scan') {
    console.log('  ✓ Detected SCAN - will use ultra-RAM efficient method');
    console.log('  ✓ OCR will be needed for text extraction');
    console.log('  ✓ Expected RAM usage: < 100 MB');
  } else if (analysis.type === 'vector') {
    console.log('  ✓ Detected VECTOR document - will use ultra-RAM efficient method');
    console.log('  ✓ OCR will be needed for text extraction');
    console.log('  ✓ Expected RAM usage: < 100 MB');
  } else if (analysis.type === 'text') {
    console.log('  ✓ Detected TEXT document - minimal RAM usage');
    console.log('  ✓ Text can be extracted directly from PDF');
    console.log('  ✓ Expected RAM usage: < 50 MB');
  }
  
  // Phase 2: Intelligent extraction (optional)
  const doExtract = process.argv[3] === '--extract' || process.argv[3] === '-e';
  
  if (doExtract) {
    console.log('━'.repeat(60));
    console.log('\n⚡ Phase 2: Intelligent Data Extraction...\n');
    
    const startTime = Date.now();
    const memBefore = process.memoryUsage();
    
    const result = await extractPdfSmart(pdfPath, {
      onProgress: (progress) => {
        if (progress.stage === 'extracting' && progress.currentPage % 10 === 0) {
          const percent = (progress.progress * 100).toFixed(1);
          process.stdout.write(`\r  Processed: ${progress.currentPage}/${progress.totalPages} (${percent}%)`);
        }
      }
    });
    
    console.log(''); // New line
    
    const endTime = Date.now();
    const memAfter = process.memoryUsage();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // Force GC
    if (global.gc) {
      global.gc();
    }
    
    console.log('\n✅ Extraction Complete!\n');
    console.log('━'.repeat(60));
    console.log('📊 Extraction Results:');
    console.log('━'.repeat(60));
    console.log(`📝 Text length: ${result.text.length} characters`);
    console.log(`📄 Pages: ${result.pages}`);
    console.log(`🖼️  Images: ${result.imageCount}`);
    console.log(`📐 Vectors: ${result.vectorCount}`);
    console.log(`📋 PDF Type: ${result.pdfType}`);
    console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`⏱️  Time: ${duration}s`);
    console.log(`🐎 Speed: ${(result.pages / parseFloat(duration)).toFixed(2)} pages/s`);
    
    console.log('━'.repeat(60));
    console.log('💾 Memory Usage:');
    console.log('━'.repeat(60));
    const heapDiff = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
    const rssDiff = (memAfter.rss - memBefore.rss) / 1024 / 1024;
    const extDiff = (memAfter.external - memBefore.external) / 1024 / 1024;
    
    console.log(`  Heap: ${heapDiff.toFixed(2)} MB`);
    console.log(`  RSS: ${rssDiff.toFixed(2)} MB`);
    console.log(`  External: ${extDiff.toFixed(2)} MB`);
    
    if (rssDiff < 100) {
      console.log(`\n✅ EXCELLENT! RAM usage under 100 MB`);
    } else if (rssDiff < 200) {
      console.log(`\n✓ GOOD. RAM usage under 200 MB`);
    } else {
      console.log(`\n⚠️  WARNING: High RAM usage ${rssDiff.toFixed(2)} MB`);
    }
  } else {
    console.log('━'.repeat(60));
    console.log('\n💡 To extract full data, run:');
    console.log(`   node example.js "${pdfPath}" --extract`);
  }
  
  console.log('━'.repeat(60));
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}
