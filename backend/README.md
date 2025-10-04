# Expense Management System

A comprehensive expense management system with role-based access control, approval workflows, OCR receipt processing, and detailed reporting.

## Features

- **Multi-tenant Architecture**: Company-based separation with role-based access
- **User Management**: Admin, Manager, and Employee roles with hierarchical permissions
- **Expense Tracking**: Create, submit, and track expenses with receipt uploads
- **Currency Conversion**: Real-time exchange rates with frozen rates at submission time
- **Approval Workflows**: Configurable approval rules (sequential, parallel, percentage-based)
- **OCR Processing**: Receipt scanning and data extraction (placeholder implementation)
- **Audit Logging**: Complete audit trail for all actions
- **Reporting**: Comprehensive reports with CSV export functionality
- **File Upload**: Secure file storage with AWS S3 or local storage

## Tech Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT with role-based access control
- **File Storage**: AWS S3 (production) / Local storage (development)
- **Currency API**: Exchange rate API integration
- **Testing**: Jest and Supertest

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- AWS S3 bucket (for production file storage)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd expense-management-system/backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=expense_management
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRE=7d

# AWS S3 (for production)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=expense-management-receipts

# External APIs
EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key
```

5. Create PostgreSQL database:
```sql
CREATE DATABASE expense_management;
```

6. Run database migrations:
```bash
npm run migrate
```

7. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Documentation

### Authentication

#### POST `/api/auth/signup`
Register a new company with admin user.

**Request Body:**
```json
{
  "companyName": "Acme Corp",
  "country": "US",
  "adminName": "John Doe",
  "adminEmail": "admin@acme.com",
  "password": "SecurePass123"
}
```

#### POST `/api/auth/login`
Login user and receive JWT token.

**Request Body:**
```json
{
  "email": "admin@acme.com",
  "password": "SecurePass123"
}
```

### Users

#### GET `/api/users`
Get all users (role-based filtering applied).

#### POST `/api/users`
Create new user (admin only).

#### PUT `/api/users/:userId`
Update user information.

### Expenses

#### POST `/api/expenses`
Create new expense.

#### GET `/api/expenses`
Get expenses with filtering options.

#### PUT `/api/expenses/:expenseId/submit`
Submit expense for approval (triggers currency conversion and approval workflow).

### Approvals

#### GET `/api/approvals/pending`
Get pending approvals for current user.

#### POST `/api/approvals/:stepId/process`
Approve or reject an expense.

#### GET `/api/approvals/rules`
Get approval rules (admin only).

### OCR

#### POST `/api/ocr/upload`
Upload receipt and process with OCR.

#### GET `/api/ocr/expenses/:expenseId`
Get OCR records for an expense.

### Reports

#### GET `/api/reports`
Generate expense reports with various groupings.

#### GET `/api/reports/export/csv`
Export expenses to CSV format.

#### GET `/api/reports/dashboard`
Get dashboard statistics.

## Database Schema

The system uses the following main tables:

- `companies`: Company information and settings
- `users`: User accounts with role-based permissions
- `expenses`: Expense records with currency conversion
- `approval_rules`: Configurable approval workflow rules
- `approval_steps`: Individual approval steps for each expense
- `audit_logs`: Complete audit trail of all actions
- `ocr_records`: OCR processing results and extracted data
- `exchange_rates`: Historical exchange rate data

## Role-Based Access Control

### Admin
- Full access to company data
- User management
- Approval rule configuration
- System administration

### Manager
- View team expenses
- Approve/reject team expenses
- Limited user management (direct reports)

### Employee
- Create and manage own expenses
- View own expense history
- Submit expenses for approval

## Approval Workflows

The system supports flexible approval workflows:

1. **Sequential**: Approvals required in order
2. **Parallel**: Multiple approvers at the same level
3. **Percentage**: Based on expense amount thresholds
4. **Specific**: Designated approver for certain categories
5. **Hybrid**: Combination of multiple rules

## Currency Conversion

- Real-time exchange rates from external API
- Rates frozen at submission time for audit purposes
- Fallback to historical rates if API unavailable
- Support for 20+ major currencies

## File Upload & Storage

- Secure file uploads with validation
- AWS S3 integration for production
- Local storage for development
- Signed URLs for secure file access
- File type validation (images and PDFs)

## OCR Processing

Current implementation provides a placeholder OCR service that can be extended with:
- Google Vision API
- AWS Textract
- Tesseract OCR
- Custom OCR solutions

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Deployment

### Production Environment

1. Set `NODE_ENV=production`
2. Configure production database
3. Set up AWS S3 bucket
4. Configure proper JWT secrets
5. Set up monitoring and logging

### Docker Deployment

```bash
# Build image
docker build -t expense-management-api .

# Run container
docker run -p 3000:3000 --env-file .env expense-management-api
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License.