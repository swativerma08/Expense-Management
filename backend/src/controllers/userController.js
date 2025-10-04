const User = require('../models/user');
const { asyncHandler } = require('../middleware/errorHandler');
const { auditLog } = require('../services/auditService');
const logger = require('../utils/logger');

// Get all users (admin and managers can see their team)
const getUsers = asyncHandler(async (req, res) => {
  const { role, is_active, manager_id } = req.query;
  const filters = {};

  if (role) filters.role = role;
  if (is_active !== undefined) filters.is_active = is_active === 'true';
  if (manager_id) filters.manager_id = manager_id;

  let users;

  if (req.user.role === 'admin') {
    // Admins can see all users in their company
    users = await User.findByCompany(req.user.company_id, filters);
  } else if (req.user.role === 'manager') {
    // Managers can see their direct reports and themselves
    if (filters.manager_id && filters.manager_id !== req.user.id) {
      return res.status(403).json({
        error: 'Managers can only view their own direct reports'
      });
    }
    users = await User.getDirectReports(req.user.id);
  } else {
    // Employees can only see themselves
    users = [await User.findById(req.user.id)];
  }

  res.json({
    users: users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      manager: user.manager_name ? {
        name: user.manager_name,
        email: user.manager_email
      } : null,
      created_at: user.created_at
    }))
  });
});

// Get user by ID
const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Check access permissions
  if (req.user.role === 'employee' && userId !== req.user.id) {
    return res.status(403).json({
      error: 'Access denied. You can only view your own profile.'
    });
  }

  if (req.user.role === 'manager') {
    // Managers can view their direct reports and themselves
    const user = await User.findById(userId);
    if (user.manager_id !== req.user.id && userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied. You can only view your direct reports.'
      });
    }
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      error: 'User not found'
    });
  }

  // Get user statistics
  const stats = await User.getStats(userId);

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
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
      last_login: user.last_login,
      statistics: stats
    }
  });
});

// Create new user (admin only)
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, manager_id } = req.body;

  // Validate required fields
  if (!name || !email || !password || !role) {
    return res.status(400).json({
      error: 'Name, email, password, and role are required'
    });
  }

  // Validate role
  if (!['admin', 'manager', 'employee'].includes(role)) {
    return res.status(400).json({
      error: 'Role must be admin, manager, or employee'
    });
  }

  // Check if user already exists
  const existingUser = await User.findByEmail(email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({
      error: 'User with this email already exists'
    });
  }

  // Validate manager_id if provided
  if (manager_id) {
    const manager = await User.findById(manager_id);
    if (!manager || manager.company_id !== req.user.company_id) {
      return res.status(400).json({
        error: 'Invalid manager ID'
      });
    }
    if (!['admin', 'manager'].includes(manager.role)) {
      return res.status(400).json({
        error: 'Manager must have admin or manager role'
      });
    }
  }

  const user = await User.create({
    company_id: req.user.company_id,
    name,
    email: email.toLowerCase(),
    password,
    role,
    manager_id
  });

  // Log the creation
  await auditLog({
    entity: 'user',
    entityId: user.id,
    action: 'USER_CREATED',
    byUser: req.user.id,
    snapshot: { ...user, password_hash: undefined }
  });

  logger.info('User created:', { userId: user.id, email: user.email, createdBy: req.user.id });

  res.status(201).json({
    message: 'User created successfully',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      manager_id: user.manager_id,
      is_active: user.is_active,
      created_at: user.created_at
    }
  });
});

// Update user (admin only, or user updating themselves)
const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { name, email, role, manager_id, is_active } = req.body;

  // Check permissions
  if (req.user.role !== 'admin' && userId !== req.user.id) {
    return res.status(403).json({
      error: 'Access denied. Only admins can update other users.'
    });
  }

  // Users can't change their own role or active status
  if (userId === req.user.id && (role || is_active !== undefined)) {
    return res.status(403).json({
      error: 'You cannot change your own role or active status.'
    });
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email.toLowerCase();
  if (role) updateData.role = role;
  if (manager_id !== undefined) updateData.manager_id = manager_id;
  if (is_active !== undefined) updateData.is_active = is_active;

  // Check if email is already taken
  if (email) {
    const existingUser = await User.findByEmail(email.toLowerCase());
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({
        error: 'Email is already in use by another user'
      });
    }
  }

  // Validate manager_id if provided
  if (manager_id) {
    const manager = await User.findById(manager_id);
    if (!manager || manager.company_id !== req.user.company_id) {
      return res.status(400).json({
        error: 'Invalid manager ID'
      });
    }
  }

  const originalUser = await User.findById(userId);
  if (!originalUser) {
    return res.status(404).json({
      error: 'User not found'
    });
  }

  const updatedUser = await User.update(userId, updateData);

  // Log the update
  await auditLog({
    entity: 'user',
    entityId: userId,
    action: 'USER_UPDATED',
    byUser: req.user.id,
    snapshot: { 
      original: { ...originalUser, password_hash: undefined },
      updated: { ...updatedUser, password_hash: undefined },
      changes: updateData
    }
  });

  logger.info('User updated:', { userId, updatedBy: req.user.id, changes: Object.keys(updateData) });

  res.json({
    message: 'User updated successfully',
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      manager_id: updatedUser.manager_id,
      is_active: updatedUser.is_active,
      updated_at: updatedUser.updated_at
    }
  });
});

// Delete user (admin only - soft delete)
const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (userId === req.user.id) {
    return res.status(400).json({
      error: 'You cannot delete your own account'
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      error: 'User not found'
    });
  }

  if (user.company_id !== req.user.company_id) {
    return res.status(403).json({
      error: 'Access denied. User not in your company.'
    });
  }

  const deletedUser = await User.delete(userId);

  // Log the deletion
  await auditLog({
    entity: 'user',
    entityId: userId,
    action: 'USER_DELETED',
    byUser: req.user.id,
    snapshot: { ...deletedUser, password_hash: undefined }
  });

  logger.info('User deleted:', { userId, deletedBy: req.user.id });

  res.json({
    message: 'User deleted successfully'
  });
});

// Search users
const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      error: 'Search term must be at least 2 characters long'
    });
  }

  const users = await User.search(req.user.company_id, q.trim());

  res.json({
    users: users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }))
  });
});

// Get direct reports (for managers)
const getDirectReports = asyncHandler(async (req, res) => {
  if (req.user.role === 'employee') {
    return res.status(403).json({
      error: 'Access denied. Only managers and admins can view direct reports.'
    });
  }

  const { managerId } = req.params;
  const targetManagerId = managerId || req.user.id;

  // Managers can only see their own direct reports unless they're admin
  if (req.user.role === 'manager' && targetManagerId !== req.user.id) {
    return res.status(403).json({
      error: 'Access denied. You can only view your own direct reports.'
    });
  }

  const directReports = await User.getDirectReports(targetManagerId);

  res.json({
    manager_id: targetManagerId,
    direct_reports: directReports.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at
    }))
  });
});

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  searchUsers,
  getDirectReports
};