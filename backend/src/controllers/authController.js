const { generateToken } = require('../config/auth');
const Company = require('../models/company');
const User = require('../models/user');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { auditLog } = require('../services/auditService');

// Country to currency mapping
const COUNTRY_CURRENCY_MAP = {
  'US': 'USD',
  'CA': 'CAD',
  'GB': 'GBP',
  'DE': 'EUR',
  'FR': 'EUR',
  'ES': 'EUR',
  'IT': 'EUR',
  'JP': 'JPY',
  'AU': 'AUD',
  'IN': 'INR',
  'CN': 'CNY',
  'BR': 'BRL',
  'MX': 'MXN',
  'SG': 'SGD',
  'HK': 'HKD',
  'CH': 'CHF',
  'SE': 'SEK',
  'NO': 'NOK',
  'DK': 'DKK',
  'NZ': 'NZD'
};

// Register company with admin user
const signup = asyncHandler(async (req, res) => {
  const { 
    companyName, 
    country, 
    adminName, 
    adminEmail, 
    password 
  } = req.body;

  // Validate required fields
  if (!companyName || !country || !adminName || !adminEmail || !password) {
    return res.status(400).json({
      error: 'All fields are required: companyName, country, adminName, adminEmail, password'
    });
  }

  // Check if user already exists
  const existingUser = await User.findByEmail(adminEmail);
  if (existingUser) {
    return res.status(400).json({
      error: 'User with this email already exists'
    });
  }

  // Determine default currency based on country
  const defaultCurrency = COUNTRY_CURRENCY_MAP[country.toUpperCase()] || 'USD';

  try {
    // Create company
    const company = await Company.create({
      name: companyName,
      country: country.toUpperCase(),
      default_currency: defaultCurrency
    });

    // Create admin user
    const admin = await User.create({
      company_id: company.id,
      name: adminName,
      email: adminEmail.toLowerCase(),
      password: password,
      role: 'admin'
    });

    // Generate token
    const token = generateToken({
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      companyId: company.id
    });

    // Log the registration
    await auditLog({
      entity: 'company',
      entityId: company.id,
      action: 'COMPANY_REGISTERED',
      byUser: admin.id,
      snapshot: { company, admin: { ...admin, password_hash: undefined } }
    });

    logger.info('New company registered:', { 
      companyId: company.id, 
      adminId: admin.id,
      companyName,
      country 
    });

    res.status(201).json({
      message: 'Company registered successfully',
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        company: {
          id: company.id,
          name: company.name,
          country: company.country,
          default_currency: company.default_currency
        }
      }
    });
  } catch (error) {
    logger.error('Signup error:', error);
    res.status(500).json({
      error: 'Failed to register company'
    });
  }
});

// Login user
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate required fields
  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required'
    });
  }

  // Find user by email
  const user = await User.findByEmail(email.toLowerCase());
  if (!user) {
    return res.status(401).json({
      error: 'Invalid email or password'
    });
  }

  // Check if user is active
  if (!user.is_active) {
    return res.status(401).json({
      error: 'Account is deactivated. Please contact your administrator.'
    });
  }

  // Validate password
  const isValidPassword = await User.validatePassword(user, password);
  if (!isValidPassword) {
    return res.status(401).json({
      error: 'Invalid email or password'
    });
  }

  // Update last login
  await User.updateLastLogin(user.id);

  // Generate token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    companyId: user.company_id
  });

  // Log the login
  await auditLog({
    entity: 'user',
    entityId: user.id,
    action: 'USER_LOGIN',
    byUser: user.id,
    snapshot: { login_time: new Date() }
  });

  logger.info('User logged in:', { userId: user.id, email: user.email });

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company: {
        id: user.company_id,
        name: user.company_name,
        default_currency: user.default_currency
      }
    }
  });
});

// Get current user profile
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return res.status(404).json({
      error: 'User not found'
    });
  }

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      manager: user.manager_name ? {
        name: user.manager_name,
        email: user.manager_email
      } : null,
      company: {
        id: user.company_id,
        name: user.company_name,
        default_currency: user.default_currency
      },
      created_at: user.created_at,
      last_login: user.last_login
    }
  });
});

// Update profile
const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const updateData = {};

  if (name) updateData.name = name;
  if (email) updateData.email = email.toLowerCase();
  if (password) updateData.password = password;

  // Check if email is already taken by another user
  if (email && email.toLowerCase() !== req.user.email) {
    const existingUser = await User.findByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({
        error: 'Email is already in use by another user'
      });
    }
  }

  const updatedUser = await User.update(req.user.id, updateData);

  // Log the update
  await auditLog({
    entity: 'user',
    entityId: req.user.id,
    action: 'PROFILE_UPDATED',
    byUser: req.user.id,
    snapshot: { updated_fields: Object.keys(updateData) }
  });

  res.json({
    message: 'Profile updated successfully',
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role
    }
  });
});

// Logout (client-side token removal, but log the action)
const logout = asyncHandler(async (req, res) => {
  // Log the logout
  await auditLog({
    entity: 'user',
    entityId: req.user.id,
    action: 'USER_LOGOUT',
    byUser: req.user.id,
    snapshot: { logout_time: new Date() }
  });

  logger.info('User logged out:', { userId: req.user.id, email: req.user.email });

  res.json({
    message: 'Logout successful'
  });
});

module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  logout
};