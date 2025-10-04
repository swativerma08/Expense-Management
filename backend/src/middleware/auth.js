const { verifyToken } = require('../config/auth');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);
    
    // Get user details from database
    const userResult = await query(
      `SELECT u.*, c.name as company_name, c.default_currency 
       FROM users u 
       JOIN companies c ON u.company_id = c.id 
       WHERE u.id = $1 AND u.is_active = true`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid token. User not found or inactive.' 
      });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ 
      error: 'Invalid token.' 
    });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.' 
      });
    }

    next();
  };
};

// Company access middleware (ensures user can only access their company's data)
const companyAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.' 
      });
    }

    // For admins, allow access to any company data if company_id is provided
    if (req.user.role === 'admin' && req.params.companyId) {
      req.targetCompanyId = req.params.companyId;
    } else {
      req.targetCompanyId = req.user.company_id;
    }

    next();
  } catch (error) {
    logger.error('Company access error:', error);
    return res.status(500).json({ 
      error: 'Internal server error.' 
    });
  }
};

// Manager access middleware (ensures managers can only access their team's data)
const managerAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.' 
      });
    }

    const { userId } = req.params;
    
    // Admins have full access
    if (req.user.role === 'admin') {
      return next();
    }

    // Users can access their own data
    if (userId === req.user.id) {
      return next();
    }

    // Managers can access their direct reports' data
    if (req.user.role === 'manager') {
      const result = await query(
        'SELECT id FROM users WHERE id = $1 AND manager_id = $2',
        [userId, req.user.id]
      );

      if (result.rows.length > 0) {
        return next();
      }
    }

    return res.status(403).json({ 
      error: 'Access denied. Cannot access this user\'s data.' 
    });
  } catch (error) {
    logger.error('Manager access error:', error);
    return res.status(500).json({ 
      error: 'Internal server error.' 
    });
  }
};

module.exports = {
  authenticate,
  authorize,
  companyAccess,
  managerAccess
};