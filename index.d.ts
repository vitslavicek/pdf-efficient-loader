/**
 * PDF source type - can be a file path, Buffer, or Uint8Array
 */
export type PdfSource = string | Buffer | Uint8Array;

/**
 * PDF document type classification
 */
export type PdfType = 'scan' | 'vector' | 'text';

/**
 * Progress callback for extraction operations
 */
export interface ProgressInfo {
  stage: 'analyzing' | 'analyzed' | 'extracting';
  progress: number;
  currentPage?: number;
  totalPages?: number;
  pdfType?: PdfType;
  confidence?: number;
}

/**
 * Page processing callback information
 */
export interface PageProcessedInfo {
  pageNum: number;
  totalPages: number;
  currentImages: number;
  currentVectors: number;
}

/**
 * Basic PDF extraction result
 */
export interface PdfDataResult {
  text: string;
  imageCount: number;
  vectorCount: number;
}

/**
 * PDF extraction result with page count
 */
export interface PdfStatsResult extends PdfDataResult {
  pages: number;
}

/**
 * Smart PDF extraction result with type detection
 */
export interface PdfSmartResult extends PdfStatsResult {
  pdfType: PdfType;
  confidence: number;
}

/**
 * PDF type analysis statistics
 */
export interface PdfTypeStats {
  totalPages: number;
  sampledPages: number;
  avgImagesPerPage: number;
  avgVectorsPerPage: number;
  avgTextItemsPerPage: number;
  largeImageRatio: number;
  estimatedTotalImages: number;
  estimatedTotalVectors: number;
}

/**
 * PDF type analysis result
 */
export interface PdfTypeAnalysis {
  type: PdfType;
  confidence: number;
  stats: PdfTypeStats;
}

/**
 * Options for streaming extraction
 */
export interface StreamingOptions {
  onPageProcessed?: (info: PageProcessedInfo) => void;
  extractText?: boolean;
}

/**
 * Options for stats extraction
 */
export interface StatsOptions {
  extractText?: boolean;
  onPageProcessed?: (info: PageProcessedInfo) => void;
}

/**
 * Options for PDF type analysis
 */
export interface AnalyzeOptions {
  samplePages?: number;
}

/**
 * Options for smart extraction
 */
export interface SmartOptions {
  onProgress?: (info: ProgressInfo) => void;
  analysis?: PdfTypeAnalysis;
}

/**
 * Memory-efficient PDF data extraction
 * Processes document page-by-page without loading entire PDF into memory
 * 
 * @param pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @returns Promise with extracted text, image count, and vector count
 */
export function extractPdfData(pdfSource: PdfSource): Promise<PdfDataResult>;

/**
 * Alternative method for streaming processing of large PDFs
 * Uses callback for progressive page processing
 * 
 * @param pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @param options - Processing options
 * @returns Promise with extracted text, image count, and vector count
 */
export function extractPdfDataStreaming(
  pdfSource: PdfSource,
  options?: StreamingOptions
): Promise<PdfDataResult>;

/**
 * Ultra-RAM optimized extraction with statistics only
 * Does not use getOperatorList which loads image data into memory
 * Uses direct access to PDF dictionary for counting objects
 * 
 * @param pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @param options - Processing options
 * @returns Promise with extracted text, image count, vector count, and page count
 */
export function extractPdfStats(
  pdfSource: PdfSource,
  options?: StatsOptions
): Promise<PdfStatsResult>;

/**
 * Ultra-RAM efficient PDF document type analysis
 * Detects whether PDF is a scan, vector document, or pure text
 * 
 * @param pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @param options - Analysis options
 * @returns Promise with document type, confidence, and statistics
 */
export function analyzePdfType(
  pdfSource: PdfSource,
  options?: AnalyzeOptions
): Promise<PdfTypeAnalysis>;

/**
 * Efficient data extraction based on PDF type
 * Automatically selects the best method based on document type
 * 
 * @param pdfSource - Path to PDF file, Buffer, or Uint8Array
 * @param options - Processing options
 * @returns Promise with extracted data, type, and confidence
 */
export function extractPdfSmart(
  pdfSource: PdfSource,
  options?: SmartOptions
): Promise<PdfSmartResult>;
