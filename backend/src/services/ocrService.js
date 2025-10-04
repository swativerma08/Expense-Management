const { query } = require('../config/database');
const logger = require('../utils/logger');

// Placeholder OCR service - will be replaced with actual OCR implementation
class OCRService {
  // Process receipt image/PDF and extract data
  static async processReceipt(fileUrl, fileType) {
    try {
      // This is a placeholder implementation
      // In production, this would integrate with Google Vision API, Tesseract, or other OCR services
      
      logger.info('Processing receipt with OCR:', { fileUrl, fileType });
      
      // Simulate OCR processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock extracted data based on file type
      const mockData = this.generateMockOCRData(fileType);
      
      return {
        success: true,
        confidence: 0.85,
        extractedData: mockData,
        processingTime: 2000
      };
    } catch (error) {
      logger.error('OCR processing failed:', error);
      return {
        success: false,
        error: error.message,
        confidence: 0,
        extractedData: null
      };
    }
  }

  // Generate mock OCR data for demonstration
  static generateMockOCRData(fileType) {
    const mockData = {
      merchant: this.getRandomMerchant(),
      amount: this.getRandomAmount(),
      currency: this.getRandomCurrency(),
      date: this.getRandomDate(),
      category: this.getRandomCategory(),
      items: this.getRandomItems(),
      tax: null,
      total: null
    };

    // Calculate tax and total
    mockData.tax = parseFloat((mockData.amount * 0.08).toFixed(2)); // 8% tax
    mockData.total = parseFloat((mockData.amount + mockData.tax).toFixed(2));

    return mockData;
  }

  // Helper methods for generating mock data
  static getRandomMerchant() {
    const merchants = [
      'Starbucks Coffee',
      'McDonald\'s',
      'Shell Gas Station',
      'Best Buy',
      'Amazon',
      'Walmart',
      'Target',
      'Home Depot',
      'Office Depot',
      'Restaurant ABC'
    ];
    return merchants[Math.floor(Math.random() * merchants.length)];
  }

  static getRandomAmount() {
    return parseFloat((Math.random() * 500 + 10).toFixed(2));
  }

  static getRandomCurrency() {
    const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
    return currencies[Math.floor(Math.random() * currencies.length)];
  }

  static getRandomDate() {
    const now = new Date();
    const pastDate = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    return pastDate.toISOString().split('T')[0];
  }

  static getRandomCategory() {
    const categories = [
      'Travel',
      'Office Supplies',
      'Software',
      'Marketing',
      'Training',
      'Entertainment',
      'Equipment',
      'Other'
    ];
    return categories[Math.floor(Math.random() * categories.length)];
  }

  static getRandomItems() {
    const items = [
      { description: 'Coffee', quantity: 2, unitPrice: 4.50 },
      { description: 'Lunch', quantity: 1, unitPrice: 12.99 },
      { description: 'Office supplies', quantity: 1, unitPrice: 25.00 },
      { description: 'Software license', quantity: 1, unitPrice: 99.00 }
    ];
    
    const numItems = Math.floor(Math.random() * 3) + 1;
    return items.slice(0, numItems);
  }

  // Store OCR record in database
  static async createOCRRecord(expenseId, fileUrl, extractedData, confidence, status = 'processed') {
    try {
      const result = await query(
        `INSERT INTO ocr_records (expense_id, file_url, parsed_json, confidence, status, processed_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [expenseId, fileUrl, JSON.stringify(extractedData), confidence, status]
      );
      
      logger.info('OCR record created:', { 
        ocrId: result.rows[0].id, 
        expenseId, 
        confidence 
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create OCR record:', error);
      throw error;
    }
  }

  // Get OCR record by ID
  static async getOCRRecord(id) {
    try {
      const result = await query(
        'SELECT * FROM ocr_records WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get OCR record:', error);
      throw error;
    }
  }

  // Get OCR records by expense ID
  static async getOCRRecordsByExpense(expenseId) {
    try {
      const result = await query(
        `SELECT * FROM ocr_records 
         WHERE expense_id = $1 
         ORDER BY created_at DESC`,
        [expenseId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to get OCR records by expense:', error);
      throw error;
    }
  }

  // Update OCR record status
  static async updateOCRRecordStatus(id, status, errorMessage = null) {
    try {
      const result = await query(
        `UPDATE ocr_records 
         SET status = $1, error_message = $2, processed_at = NOW()
         WHERE id = $3 
         RETURNING *`,
        [status, errorMessage, id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update OCR record status:', error);
      throw error;
    }
  }

  // Process receipt and create/update expense (integrated workflow)
  static async processReceiptAndUpdateExpense(expenseId, fileUrl, fileType) {
    try {
      // Create pending OCR record
      const ocrRecord = await this.createOCRRecord(
        expenseId, 
        fileUrl, 
        null, 
        0, 
        'pending'
      );

      // Process receipt
      const ocrResult = await this.processReceipt(fileUrl, fileType);

      if (ocrResult.success) {
        // Update OCR record with results
        await query(
          `UPDATE ocr_records 
           SET parsed_json = $1, confidence = $2, status = $3, processed_at = NOW()
           WHERE id = $4`,
          [
            JSON.stringify(ocrResult.extractedData),
            ocrResult.confidence,
            'processed',
            ocrRecord.id
          ]
        );

        // Optionally auto-populate expense fields if confidence is high
        if (ocrResult.confidence > 0.8) {
          const expenseUpdates = {};
          const data = ocrResult.extractedData;

          if (data.amount) expenseUpdates.original_amount = data.amount;
          if (data.currency) expenseUpdates.original_currency = data.currency;
          if (data.date) expenseUpdates.expense_date = data.date;
          if (data.category) expenseUpdates.category = data.category;
          if (data.merchant) expenseUpdates.description = `${data.merchant} - ${data.description || 'Auto-extracted'}`;

          if (Object.keys(expenseUpdates).length > 0) {
            const updateFields = Object.keys(expenseUpdates)
              .map((key, index) => `${key} = $${index + 2}`)
              .join(', ');
            
            await query(
              `UPDATE expenses SET ${updateFields} WHERE id = $1`,
              [expenseId, ...Object.values(expenseUpdates)]
            );

            logger.info('Expense auto-populated from OCR:', { 
              expenseId, 
              updates: Object.keys(expenseUpdates) 
            });
          }
        }

        return {
          success: true,
          ocrRecord: ocrRecord.id,
          extractedData: ocrResult.extractedData,
          confidence: ocrResult.confidence,
          autoPopulated: ocrResult.confidence > 0.8
        };
      } else {
        // Update OCR record with failure
        await this.updateOCRRecordStatus(ocrRecord.id, 'failed', ocrResult.error);
        
        return {
          success: false,
          ocrRecord: ocrRecord.id,
          error: ocrResult.error
        };
      }
    } catch (error) {
      logger.error('Failed to process receipt and update expense:', error);
      throw error;
    }
  }

  // Future: Real OCR integration methods would go here
  // static async processWithGoogleVision(fileUrl) { ... }
  // static async processWithTesseract(fileBuffer) { ... }
  // static async processWithAWSTextract(fileUrl) { ... }
}

module.exports = OCRService;