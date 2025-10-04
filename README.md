# Expense Management System

A comprehensive, enterprise-grade expense management system with role-based access control, approval workflows, OCR receipt processing, and detailed reporting capabilities.

## 🎯 Project Overview

This is a complete expense management solution that allows companies to:
- **Track and manage expenses** with multi-currency support
- **Implement approval workflows** with configurable rules
- **Process receipts** using OCR technology
- **Generate reports** with export capabilities
- **Maintain audit trails** for compliance
- **Manage users** with role-based permissions

## 🏗️ Architecture

### Backend (Node.js/Express)
- **API Server**: RESTful API with JWT authentication
- **Database**: PostgreSQL with comprehensive schema
- **File Storage**: AWS S3 (production) / Local storage (development)
- **Currency**: Real-time exchange rates with frozen rates at submission
- **OCR**: Placeholder service ready for Google Vision/Tesseract integration

### Frontend (React/TypeScript)
- **Modern React**: TypeScript, React Router, React Query
- **UI Framework**: Tailwind CSS with responsive design
- **Authentication**: JWT-based with automatic token refresh
- **State Management**: Context API with React Query for server state

## 🚀 Quick Start

### Prerequisites
- Node.js (v16+)
- PostgreSQL (v12+)
- npm or yarn

### 1. Clone and Setup Backend

```bash
# Clone the repository
git clone <repository-url>
cd expense-management-system

# Setup backend
cd backend
npm install

# Create environment file
cp .env.example .env
# Edit .env with your configuration

# Create PostgreSQL database
createdb expense_management

# Run database migrations
npm run migrate

# Start backend server
npm run dev
```

### 2. Setup Frontend

```bash
# In a new terminal, setup frontend
cd frontend
npm install

# Create environment file
cp .env.example .env
# Default API URL is already configured

# Start frontend development server
npm start
```

### 3. Access the Application

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **API Documentation**: Available in backend/README.md

## 📋 Features

### ✅ User Management
- **Role-Based Access Control**: Admin, Manager, Employee roles
- **Company Management**: Multi-tenant architecture
- **User Hierarchy**: Manager-employee relationships
- **Profile Management**: Self-service profile updates

### ✅ Expense Management
- **Multi-Currency Support**: 20+ currencies with real-time conversion
- **Receipt Upload**: Secure file storage with validation
- **OCR Processing**: Automatic data extraction from receipts
- **Draft System**: Save and edit expenses before submission

### ✅ Approval Workflows
- **Configurable Rules**: Sequential, parallel, percentage-based, specific approver
- **Flexible Routing**: Based on amount, category, or user role
- **Approval History**: Complete audit trail of all decisions
- **Notifications**: Email and in-app notifications (planned)

### ✅ Reporting & Analytics
- **Dashboard**: Real-time statistics and charts
- **Custom Reports**: Filter by date, category, user, status
- **Data Export**: CSV export with configurable fields
- **Audit Logs**: Complete system activity tracking

### ✅ Security & Compliance
- **JWT Authentication**: Secure token-based authentication
- **Role-Based Permissions**: Granular access control
- **Audit Logging**: Immutable audit trail
- **Data Validation**: Input validation and sanitization

## 🔧 Configuration

### Backend Environment Variables

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

# AWS S3 (Optional - for production file storage)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=expense-management-receipts

# External APIs
EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key
EXCHANGE_RATE_API_URL=https://api.exchangerate-api.com/v4/latest

# Email (Optional - for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Frontend Environment Variables

```env
REACT_APP_API_URL=http://localhost:3000/api
```

## 📖 API Documentation

### Authentication
- `POST /api/auth/signup` - Register company with admin user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get current user profile

### Users
- `GET /api/users` - List users (role-based filtering)
- `POST /api/users` - Create user (admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin only)

### Expenses
- `GET /api/expenses` - List expenses with filters
- `POST /api/expenses` - Create new expense
- `PUT /api/expenses/:id` - Update expense (draft only)
- `PUT /api/expenses/:id/submit` - Submit for approval
- `DELETE /api/expenses/:id` - Delete expense (draft only)

### Approvals
- `GET /api/approvals/pending` - Get pending approvals
- `POST /api/approvals/:stepId/process` - Approve/reject expense
- `GET /api/approvals/rules` - Get approval rules (admin)
- `POST /api/approvals/rules` - Create approval rule (admin)

### Reports
- `GET /api/reports` - Generate expense reports
- `GET /api/reports/export/csv` - Export to CSV
- `GET /api/reports/dashboard` - Dashboard statistics

## 👥 User Roles & Permissions

### Admin
- Full system access
- User management
- Approval rule configuration
- Company settings
- All reports and analytics

### Manager
- Team expense approval
- Team member management
- Team reports
- Own expense management

### Employee
- Create and manage own expenses
- Submit expenses for approval
- View own expense history
- Basic reporting for own expenses

## 🔄 Expense Workflow

1. **Create**: Employee creates expense (draft status)
2. **Upload**: Receipt upload with optional OCR processing
3. **Submit**: Submit for approval (triggers currency conversion)
4. **Route**: System creates approval steps based on rules
5. **Approve**: Managers/approvers review and decide
6. **Complete**: Final status (approved/rejected)
7. **Audit**: All actions logged for compliance

## 🛠️ Development

### Backend Structure
```
backend/
├── src/
│   ├── config/         # Database, auth configuration
│   ├── controllers/    # Route handlers
│   ├── models/         # Data models
│   ├── routes/         # Express routes
│   ├── middleware/     # Authentication, validation
│   ├── services/       # Business logic services
│   ├── utils/          # Utilities and helpers
│   └── app.js          # Express app setup
├── tests/              # Test files
└── server.js           # Server entry point
```

### Frontend Structure
```
frontend/
├── src/
│   ├── components/     # Reusable UI components
│   ├── contexts/       # React contexts
│   ├── pages/          # Page components
│   ├── hooks/          # Custom React hooks
│   ├── services/       # API services
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions
└── public/             # Static assets
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## 🚀 Deployment

### Backend Deployment
1. Set production environment variables
2. Build and deploy to your preferred platform
3. Set up PostgreSQL database
4. Configure AWS S3 for file storage
5. Set up monitoring and logging

### Frontend Deployment
1. Build the React app: `npm run build`
2. Deploy to static hosting (Netlify, Vercel, S3)
3. Configure environment variables for production API

## 🔮 Future Enhancements

### Phase 2 Features
- **Real OCR Integration**: Google Vision API, AWS Textract
- **Mobile App**: React Native mobile application
- **Advanced Reporting**: Charts, graphs, advanced analytics
- **Notifications**: Email and push notifications
- **Multi-language Support**: Internationalization

### Phase 3 Features
- **Integration APIs**: Connect with accounting systems
- **Machine Learning**: Smart categorization and fraud detection
- **Advanced Workflows**: Custom approval workflows
- **Real-time Collaboration**: Live updates and comments

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation in `/backend/README.md`
- Review the code comments for implementation details

---

**Built with ❤️ using Node.js, React, PostgreSQL, and modern web technologies.**