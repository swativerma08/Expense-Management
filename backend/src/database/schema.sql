-- Expense Management System Database Schema
-- PostgreSQL version

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL,
    default_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table with role-based access
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
    manager_id UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for users
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_manager_id ON users(manager_id);

-- Expenses table
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_currency VARCHAR(3) NOT NULL,
    original_amount DECIMAL(12, 2) NOT NULL,
    converted_amount DECIMAL(12, 2),
    conversion_rate DECIMAL(10, 6),
    rate_timestamp TIMESTAMP WITH TIME ZONE,
    expense_date DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    receipt_url VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid')),
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for expenses
CREATE INDEX idx_expenses_company_id ON expenses(company_id);
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);

-- Approval rules table
CREATE TABLE approval_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL 
        CHECK (type IN ('sequential', 'parallel', 'percentage', 'specific', 'hybrid')),
    threshold_amount DECIMAL(12, 2),
    threshold_percentage DECIMAL(5, 2),
    specific_approver_id UUID REFERENCES users(id),
    applies_to_category VARCHAR(100),
    applies_to_role VARCHAR(50),
    sequence_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for approval rules
CREATE INDEX idx_approval_rules_company_id ON approval_rules(company_id);
CREATE INDEX idx_approval_rules_type ON approval_rules(type);

-- Approval steps table
CREATE TABLE approval_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES users(id),
    sequence_index INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
    action_by UUID REFERENCES users(id),
    action_time TIMESTAMP WITH TIME ZONE,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for approval steps
CREATE INDEX idx_approval_steps_expense_id ON approval_steps(expense_id);
CREATE INDEX idx_approval_steps_approver_id ON approval_steps(approver_id);
CREATE INDEX idx_approval_steps_status ON approval_steps(status);

-- Audit logs table (immutable)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    by_user UUID REFERENCES users(id),
    snapshot JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit logs
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_by_user ON audit_logs(by_user);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- OCR records table
CREATE TABLE ocr_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
    file_url VARCHAR(500) NOT NULL,
    parsed_json JSONB,
    confidence DECIMAL(5, 2),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for OCR records
CREATE INDEX idx_ocr_records_expense_id ON ocr_records(expense_id);
CREATE INDEX idx_ocr_records_status ON ocr_records(status);

-- Exchange rates table
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    base_currency VARCHAR(3) NOT NULL,
    target_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(10, 6) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(base_currency, target_currency, timestamp)
);

-- Create indexes for exchange rates
CREATE INDEX idx_exchange_rates_currencies ON exchange_rates(base_currency, target_currency);
CREATE INDEX idx_exchange_rates_timestamp ON exchange_rates(timestamp);

-- Categories table (predefined expense categories)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for categories
CREATE INDEX idx_categories_company_id ON categories(company_id);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_read BOOLEAN DEFAULT false,
    related_entity VARCHAR(100),
    related_entity_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approval_rules_updated_at BEFORE UPDATE ON approval_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default categories
INSERT INTO categories (name, description) VALUES
('Travel', 'Business travel expenses including flights, hotels, meals'),
('Office Supplies', 'Office equipment, stationery, and supplies'),
('Software', 'Software licenses, subscriptions, and tools'),
('Marketing', 'Marketing and advertising expenses'),
('Training', 'Professional development and training costs'),
('Entertainment', 'Client entertainment and business meals'),
('Utilities', 'Office utilities and services'),
('Equipment', 'Computer hardware and office equipment'),
('Consulting', 'External consulting and professional services'),
('Other', 'Miscellaneous business expenses');

-- Insert default approval rule types
COMMENT ON COLUMN approval_rules.type IS 'sequential: one by one, parallel: all at once, percentage: based on amount, specific: designated approver, hybrid: combination';

-- Views for reporting
CREATE VIEW expense_summary AS
SELECT 
    e.id,
    e.original_amount,
    e.converted_amount,
    e.original_currency,
    e.expense_date,
    e.category,
    e.status,
    u.name as employee_name,
    u.email as employee_email,
    c.name as company_name,
    c.default_currency
FROM expenses e
JOIN users u ON e.user_id = u.id
JOIN companies c ON e.company_id = c.id;

-- Indexes on views
CREATE INDEX idx_expense_summary_status ON expenses(status);
CREATE INDEX idx_expense_summary_date ON expenses(expense_date);