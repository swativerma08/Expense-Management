import axios from 'axios';
import { config } from '@config/index';
import { prisma } from '@config/database';
import { logger } from '@utils/logger';

interface CurrencyConversionResult {
  convertedAmount: number;
  rate: number;
  timestamp: Date;
}

export class CurrencyService {
  static async convertCurrency(
    fromCurrency: string,
    toCurrency: string,
    amount: number
  ): Promise<CurrencyConversionResult> {
    try {
      // First, check if we have a recent rate in cache
      const cachedRate = await this.getCachedRate(fromCurrency, toCurrency);
      
      if (cachedRate) {
        return {
          convertedAmount: Number((amount * Number(cachedRate.rate)).toFixed(2)),
          rate: Number(cachedRate.rate),
          timestamp: cachedRate.timestamp,
        };
      }

      // Fetch from external API
      const response = await axios.get(
        `${config.exchangeRate.baseUrl}/${config.exchangeRate.apiKey}/pair/${fromCurrency}/${toCurrency}`
      );

      if (response.data.result !== 'success') {
        throw new Error('Failed to fetch exchange rate');
      }

      const rate = response.data.conversion_rate;
      const timestamp = new Date();

      // Cache the rate
      await this.cacheRate(fromCurrency, toCurrency, rate, timestamp);

      return {
        convertedAmount: Number((amount * rate).toFixed(2)),
        rate,
        timestamp,
      };
    } catch (error) {
      logger.error('Currency conversion failed:', error);
      throw new Error('Currency conversion service unavailable');
    }
  }

  static async getCachedRate(fromCurrency: string, toCurrency: string) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    return await prisma.exchangeRate.findFirst({
      where: {
        baseCurrency: fromCurrency,
        targetCurrency: toCurrency,
        timestamp: {
          gte: oneHourAgo,
        },
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  static async cacheRate(
    fromCurrency: string,
    toCurrency: string,
    rate: number,
    timestamp: Date
  ) {
    try {
      await prisma.exchangeRate.create({
        data: {
          baseCurrency: fromCurrency,
          targetCurrency: toCurrency,
          rate,
          timestamp,
        },
      });
    } catch (error) {
      logger.error('Failed to cache exchange rate:', error);
    }
  }

  static async getLatestRates(baseCurrency: string) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const rates = await prisma.exchangeRate.findMany({
        where: {
          baseCurrency,
          timestamp: { gte: oneHourAgo },
        },
        orderBy: { timestamp: 'desc' },
        distinct: ['targetCurrency'],
      });

      return rates.reduce((acc: Record<string, { rate: number; timestamp: Date }>, rate: any) => {
        acc[rate.targetCurrency] = {
          rate: Number(rate.rate),
          timestamp: rate.timestamp,
        };
        return acc;
      }, {} as Record<string, { rate: number; timestamp: Date }>);
    } catch (error) {
      logger.error('Failed to get latest rates:', error);
      return {};
    }
  }
}