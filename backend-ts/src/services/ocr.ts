import { prisma } from '@config/database';
import { logger } from '@utils/logger';

// Mock OCR service for development
// In production, integrate with Google Vision API or AWS Textract

export interface OCRResult {
  success: boolean;
  confidence: number;
  data: {
    merchantName?: string;
    amount?: number;
    currency?: string;
    date?: Date;
    category?: string;
    taxAmount?: number;
  };
  rawText?: string;
  error?: string;
}

export class OCRService {
  static async processReceipt(fileUrl: string): Promise<OCRResult> {
    try {
      // Mock OCR processing for development
      // Replace with actual OCR service integration
      
      return new Promise((resolve) => {
        setTimeout(() => {
          // Simulate OCR results based on filename or random data
          const mockResult: OCRResult = {
            success: true,
            confidence: 0.85,
            data: {
              merchantName: 'Sample Restaurant',
              amount: 45.67,
              currency: 'USD',
              date: new Date(),
              category: 'Meals',
              taxAmount: 3.65,
            },
            rawText: 'SAMPLE RESTAURANT\nMeal Total: $42.02\nTax: $3.65\nTotal: $45.67\nDate: ' + new Date().toLocaleDateString(),
          };
          
          resolve(mockResult);
        }, 2000); // Simulate processing time
      });
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        data: {},
        error: 'OCR processing failed',
      };
    }
  }

  static async processReceiptWithGoogleVision(fileUrl: string): Promise<OCRResult> {
    // Placeholder for Google Vision API integration
    // Uncomment and configure when ready to integrate
    
    /*
    const vision = require('@google-cloud/vision');
    const client = new vision.ImageAnnotatorClient({
      keyFilename: config.googleCloud.keyFile,
      projectId: config.googleCloud.projectId,
    });

    try {
      const [result] = await client.textDetection(fileUrl);
      const detections = result.textAnnotations;
      
      if (!detections || detections.length === 0) {
        return {
          success: false,
          confidence: 0,
          data: {},
          error: 'No text detected in image',
        };
      }

      const rawText = detections[0].description;
      const parsedData = this.parseReceiptText(rawText);

      return {
        success: true,
        confidence: 0.9,
        data: parsedData,
        rawText,
      };
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        data: {},
        error: error.message,
      };
    }
    */

    // For now, return mock data
    return this.processReceipt(fileUrl);
  }

  private static parseReceiptText(text: string): OCRResult['data'] {
    // Simple parsing logic - in production, use more sophisticated NLP
    const lines = text.split('\n');
    const data: OCRResult['data'] = {};

    for (const line of lines) {
      // Extract amount patterns
      const amountMatch = line.match(/\$?(\d+\.?\d*)/);
      if (amountMatch && !data.amount) {
        data.amount = parseFloat(amountMatch[1]);
      }

      // Extract merchant name (usually first line)
      if (!data.merchantName && line.trim().length > 3) {
        data.merchantName = line.trim();
      }

      // Extract date patterns
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (dateMatch && !data.date) {
        data.date = new Date(dateMatch[1]);
      }
    }

    return data;
  }

  static async updateOCRRecord(expenseId: string, result: OCRResult): Promise<void> {
    try {
      await prisma.oCRRecord.create({
        data: {
          expenseId,
          fileUrl: '', // Would be provided in actual implementation
          parsedJson: JSON.stringify(result.data),
          confidence: result.confidence,
          status: result.success ? 'COMPLETED' : 'FAILED',
          errorMsg: result.error || null,
        },
      });
    } catch (error) {
      logger.error('Failed to update OCR record:', error);
    }
  }
}