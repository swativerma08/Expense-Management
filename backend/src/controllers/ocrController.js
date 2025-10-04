const OCRService = require('../services/ocrService');
const { uploadMiddleware, generateSignedUrl } = require('../services/fileUploadService');
const { asyncHandler } = require('../middleware/errorHandler');
const { auditLog } = require('../services/auditService');
const logger = require('../utils/logger');

// Upload receipt and process with OCR
const uploadAndProcessReceipt = asyncHandler(async (req, res) => {
  // File upload is handled by middleware
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded. Please provide a receipt image or PDF.'
    });
  }

  const { expenseId } = req.body;
  
  if (!expenseId) {
    return res.status(400).json({
      error: 'Expense ID is required'
    });
  }

  try {
    // Get file URL (S3 key or local path)
    const fileUrl = req.file.location || req.file.key || req.file.filename;
    const fileType = req.file.mimetype;

    logger.info('Receipt uploaded:', { 
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType,
      expenseId,
      userId: req.user.id
    });

    // Process receipt with OCR
    const ocrResult = await OCRService.processReceiptAndUpdateExpense(
      expenseId, 
      fileUrl, 
      fileType
    );

    // Log the OCR processing
    await auditLog({
      entity: 'expense',
      entityId: expenseId,
      action: 'RECEIPT_PROCESSED',
      byUser: req.user.id,
      snapshot: {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          type: fileType,
          url: fileUrl
        },
        ocrResult
      }
    });

    // Generate signed URL for file access
    const signedUrl = await generateSignedUrl(fileUrl);

    res.json({
      message: 'Receipt uploaded and processed successfully',
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        type: fileType,
        url: signedUrl
      },
      ocr: {
        success: ocrResult.success,
        confidence: ocrResult.confidence,
        extractedData: ocrResult.extractedData,
        autoPopulated: ocrResult.autoPopulated,
        error: ocrResult.error
      }
    });
  } catch (error) {
    logger.error('Receipt processing failed:', error);
    res.status(500).json({
      error: 'Failed to process receipt'
    });
  }
});

// Process existing file URL with OCR
const processExistingReceipt = asyncHandler(async (req, res) => {
  const { fileUrl, expenseId } = req.body;

  if (!fileUrl || !expenseId) {
    return res.status(400).json({
      error: 'File URL and expense ID are required'
    });
  }

  try {
    // Determine file type from URL extension
    const fileExtension = fileUrl.split('.').pop().toLowerCase();
    const fileTypeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'pdf': 'application/pdf'
    };
    const fileType = fileTypeMap[fileExtension] || 'image/jpeg';

    // Process receipt with OCR
    const ocrResult = await OCRService.processReceiptAndUpdateExpense(
      expenseId, 
      fileUrl, 
      fileType
    );

    // Log the OCR processing
    await auditLog({
      entity: 'expense',
      entityId: expenseId,
      action: 'EXISTING_RECEIPT_PROCESSED',
      byUser: req.user.id,
      snapshot: { fileUrl, ocrResult }
    });

    res.json({
      message: 'Receipt processed successfully',
      ocr: {
        success: ocrResult.success,
        confidence: ocrResult.confidence,
        extractedData: ocrResult.extractedData,
        autoPopulated: ocrResult.autoPopulated,
        error: ocrResult.error
      }
    });
  } catch (error) {
    logger.error('Receipt processing failed:', error);
    res.status(500).json({
      error: 'Failed to process receipt'
    });
  }
});

// Get OCR records for an expense
const getOCRRecords = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  try {
    const ocrRecords = await OCRService.getOCRRecordsByExpense(expenseId);

    res.json({
      expense_id: expenseId,
      ocr_records: ocrRecords.map(record => ({
        id: record.id,
        file_url: record.file_url,
        status: record.status,
        confidence: record.confidence,
        extractedData: record.parsed_json,
        error_message: record.error_message,
        created_at: record.created_at,
        processed_at: record.processed_at
      }))
    });
  } catch (error) {
    logger.error('Failed to get OCR records:', error);
    res.status(500).json({
      error: 'Failed to retrieve OCR records'
    });
  }
});

// Get specific OCR record
const getOCRRecord = asyncHandler(async (req, res) => {
  const { ocrId } = req.params;

  try {
    const ocrRecord = await OCRService.getOCRRecord(ocrId);
    
    if (!ocrRecord) {
      return res.status(404).json({
        error: 'OCR record not found'
      });
    }

    res.json({
      ocr_record: {
        id: ocrRecord.id,
        expense_id: ocrRecord.expense_id,
        file_url: ocrRecord.file_url,
        status: ocrRecord.status,
        confidence: ocrRecord.confidence,
        extractedData: ocrRecord.parsed_json,
        error_message: ocrRecord.error_message,
        created_at: ocrRecord.created_at,
        processed_at: ocrRecord.processed_at
      }
    });
  } catch (error) {
    logger.error('Failed to get OCR record:', error);
    res.status(500).json({
      error: 'Failed to retrieve OCR record'
    });
  }
});

// Reprocess OCR for a specific record
const reprocessOCR = asyncHandler(async (req, res) => {
  const { ocrId } = req.params;

  try {
    const ocrRecord = await OCRService.getOCRRecord(ocrId);
    
    if (!ocrRecord) {
      return res.status(404).json({
        error: 'OCR record not found'
      });
    }

    // Determine file type from URL
    const fileUrl = ocrRecord.file_url;
    const fileExtension = fileUrl.split('.').pop().toLowerCase();
    const fileTypeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'pdf': 'application/pdf'
    };
    const fileType = fileTypeMap[fileExtension] || 'image/jpeg';

    // Reprocess the receipt
    const ocrResult = await OCRService.processReceipt(fileUrl, fileType);

    if (ocrResult.success) {
      // Update the OCR record
      await OCRService.updateOCRRecordStatus(ocrId, 'processed');
      
      // Update parsed data
      await query(
        'UPDATE ocr_records SET parsed_json = $1, confidence = $2 WHERE id = $3',
        [JSON.stringify(ocrResult.extractedData), ocrResult.confidence, ocrId]
      );
    } else {
      await OCRService.updateOCRRecordStatus(ocrId, 'failed', ocrResult.error);
    }

    // Log the reprocessing
    await auditLog({
      entity: 'ocr_record',
      entityId: ocrId,
      action: 'OCR_REPROCESSED',
      byUser: req.user.id,
      snapshot: { ocrResult }
    });

    res.json({
      message: 'OCR reprocessed successfully',
      ocr: {
        success: ocrResult.success,
        confidence: ocrResult.confidence,
        extractedData: ocrResult.extractedData,
        error: ocrResult.error
      }
    });
  } catch (error) {
    logger.error('OCR reprocessing failed:', error);
    res.status(500).json({
      error: 'Failed to reprocess OCR'
    });
  }
});

// Test OCR service (for development/testing)
const testOCR = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Test endpoint not available in production'
    });
  }

  try {
    const mockResult = await OCRService.processReceipt(
      'test-receipt.jpg', 
      'image/jpeg'
    );

    res.json({
      message: 'OCR test completed',
      result: mockResult
    });
  } catch (error) {
    logger.error('OCR test failed:', error);
    res.status(500).json({
      error: 'OCR test failed'
    });
  }
});

module.exports = {
  uploadAndProcessReceipt,
  processExistingReceipt,
  getOCRRecords,
  getOCRRecord,
  reprocessOCR,
  testOCR,
  uploadMiddleware
};