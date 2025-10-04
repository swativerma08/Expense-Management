const axios = require('axios');
const { query } = require('../config/database');
const logger = require('../utils/logger');

class CurrencyService {
  constructor() {
    this.apiUrl = process.env.EXCHANGE_RATE_API_URL || 'https://api.exchangerate-api.com/v4/latest';
    this.apiKey = process.env.EXCHANGE_RATE_API_KEY;
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  // Get exchange rate from external API
  async getExchangeRate(baseCurrency, targetCurrency) {
    if (baseCurrency === targetCurrency) {
      return 1.0;
    }

    const cacheKey = `${baseCurrency}-${targetCurrency}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.rate;
    }

    try {
      const url = `${this.apiUrl}/${baseCurrency}`;
      const params = this.apiKey ? { access_key: this.apiKey } : {};
      
      const response = await axios.get(url, { params, timeout: 5000 });
      
      if (!response.data || !response.data.rates) {
        throw new Error('Invalid response from exchange rate API');
      }

      const rate = response.data.rates[targetCurrency];
      if (!rate) {
        throw new Error(`Exchange rate not found for ${baseCurrency} to ${targetCurrency}`);
      }

      // Cache the result
      this.cache.set(cacheKey, {
        rate: parseFloat(rate),
        timestamp: Date.now()
      });

      // Store in database for audit trail
      await this.storeExchangeRate(baseCurrency, targetCurrency, rate);

      logger.info('Exchange rate fetched:', { baseCurrency, targetCurrency, rate });
      return parseFloat(rate);
    } catch (error) {
      logger.error('Failed to fetch exchange rate:', error);
      
      // Try to get last known rate from database
      const fallbackRate = await this.getLastKnownRate(baseCurrency, targetCurrency);
      if (fallbackRate) {
        logger.warn('Using fallback exchange rate from database:', { baseCurrency, targetCurrency, rate: fallbackRate });
        return fallbackRate;
      }
      
      throw new Error(`Unable to get exchange rate for ${baseCurrency} to ${targetCurrency}`);
    }
  }

  // Store exchange rate in database
  async storeExchangeRate(baseCurrency, targetCurrency, rate) {
    try {
      await query(
        `INSERT INTO exchange_rates (base_currency, target_currency, rate) 
         VALUES ($1, $2, $3)
         ON CONFLICT (base_currency, target_currency, timestamp) 
         DO NOTHING`,
        [baseCurrency, targetCurrency, rate]
      );
    } catch (error) {
      logger.error('Failed to store exchange rate:', error);
    }
  }

  // Get last known rate from database
  async getLastKnownRate(baseCurrency, targetCurrency) {
    try {
      const result = await query(
        `SELECT rate FROM exchange_rates 
         WHERE base_currency = $1 AND target_currency = $2 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [baseCurrency, targetCurrency]
      );
      
      return result.rows.length > 0 ? parseFloat(result.rows[0].rate) : null;
    } catch (error) {
      logger.error('Failed to get last known rate:', error);
      return null;
    }
  }

  // Convert amount between currencies
  async convertAmount(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return {
        convertedAmount: amount,
        rate: 1.0,
        timestamp: new Date()
      };
    }

    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = parseFloat((amount * rate).toFixed(2));

    return {
      convertedAmount,
      rate,
      timestamp: new Date()
    };
  }

  // Get supported currencies (mock implementation)
  getSupportedCurrencies() {
    return [
      'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD',
      'MXN', 'SGD', 'HKD', 'NOK', 'TRY', 'ZAR', 'BRL', 'INR', 'KRW', 'THB'
    ];
  }

  // Get historical rates for a specific date range
  async getHistoricalRates(baseCurrency, targetCurrency, dateFrom, dateTo) {
    try {
      const result = await query(
        `SELECT rate, timestamp 
         FROM exchange_rates 
         WHERE base_currency = $1 AND target_currency = $2 
           AND timestamp BETWEEN $3 AND $4
         ORDER BY timestamp ASC`,
        [baseCurrency, targetCurrency, dateFrom, dateTo]
      );
      
      return result.rows.map(row => ({
        rate: parseFloat(row.rate),
        date: row.timestamp
      }));
    } catch (error) {
      logger.error('Failed to get historical rates:', error);
      return [];
    }
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    logger.info('Currency cache cleared');
  }
}

module.exports = new CurrencyService();