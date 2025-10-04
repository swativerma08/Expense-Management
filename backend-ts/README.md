# Expense Management Backend

A comprehensive backend system for expense management with approval workflows, OCR processing, and currency conversion.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **User Management**: Company setup, user creation, and role management
- **Expense Management**: Create, submit, and track expenses
- **Approval Workflows**: Configurable approval rules (Sequential, Parallel, Percentage, Specific, Hybrid)
- **Currency Conversion**: Real-time currency conversion with caching
- **OCR Processing**: Receipt processing (mock implementation, ready for Google Vision API)
- **Audit Logging**: Complete audit trail for all actions
- **Notifications**: Email notifications via SendGrid
- **File Upload**: Receipt upload with validation
- **Rate Limiting**: API protection against abuse
- **Security**: Helmet, CORS, input validation

## 🛠 Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT (Access + Refresh tokens)
- **File Storage**: Local storage (ready for AWS S3)
- **Email**: SendGrid
- **Testing**: Jest
- **Security**: Helmet, CORS, Rate Limiting

## 📦 Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   - Database URL
   - JWT secrets
   - SendGrid API key
   - Exchange rate API key
   - AWS credentials (optional)

3. **Set up database**:
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run migrations
   npm run db:migrate
   
   # Seed database with sample data
   npm run db:seed
   ```

## 🏃‍♂️ Running the Application

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Database Operations
```bash
# View database in Prisma Studio
npm run db:studio

# Reset database
npx prisma migrate reset

# Generate new migration
npx prisma migrate dev --name migration_name
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create company & admin user
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh tokens
- `POST /api/auth/logout` - User logout

### Users
- `GET /api/users` - List users (Admin only)
- `POST /api/users` - Create user (Admin only)
- `PUT /api/users/:id` - Update user (Admin only)
- `DELETE /api/users/:id` - Deactivate user (Admin only)
- `GET /api/users/profile` - Get current user profile

### Expenses
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id/submit` - Submit for approval
- `GET /api/expenses/:id` - Get expense details
- `POST /api/expenses/:id/approve` - Approve/reject expense
- `GET /api/expenses/:id/history` - Get expense audit trail

### Admin
- `GET /api/admin/rules` - List approval rules
- `POST /api/admin/rules` - Create approval rule
- `PUT /api/admin/rules/:id` - Update approval rule
- `DELETE /api/admin/rules/:id` - Delete approval rule
- `GET /api/admin/audit-logs` - Get audit logs
- `GET /api/admin/stats` - Company statistics

### Utilities
- `GET /api/utils/exchange-rates?base=USD` - Get exchange rates
- `POST /api/utils/ocr` - Process receipt OCR
- `GET /api/utils/health` - Health check

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret | Yes |
| `SENDGRID_API_KEY` | SendGrid API key | No |
| `EXCHANGE_RATE_API_KEY` | Exchange rate API key | No |
| `AWS_ACCESS_KEY_ID` | AWS access key | No |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | No |

### Approval Rules

The system supports multiple approval rule types:

1. **Sequential**: Step-by-step approval through manager hierarchy
2. **Parallel**: All approvers notified simultaneously
3. **Percentage**: Requires X% of approvers to approve
4. **Specific**: Specific person can approve instantly
5. **Hybrid**: Combination of percentage + specific approver

## 📝 Sample Data

After running `npm run db:seed`, you'll have:

**Admin User**:
- Email: `admin@techcorp.com`
- Password: `admin123`

**Manager User**:
- Email: `manager@techcorp.com`
- Password: `manager123`

**Employee Users**:
- Email: `alice@techcorp.com` / Password: `employee123`
- Email: `bob@techcorp.com` / Password: `employee123`

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 🔒 Security Features

- **Rate Limiting**: Protects against API abuse
- **CORS**: Configurable cross-origin resource sharing
- **Helmet**: Security headers
- **Input Validation**: Joi-based request validation
- **JWT Tokens**: Secure authentication with refresh tokens
- **Password Hashing**: bcrypt with configurable salt rounds
- **File Upload Validation**: Type and size restrictions

## 📱 Integration Ready

The backend is designed to be easily integrated with:

- **Frontend Applications**: React, Vue, Angular
- **Mobile Apps**: React Native, Flutter
- **OCR Services**: Google Vision API, AWS Textract
- **Cloud Storage**: AWS S3, Google Cloud Storage
- **Email Services**: SendGrid, AWS SES
- **Payment Systems**: Stripe, PayPal

## 📈 Monitoring & Logging

- **Winston Logger**: Structured logging with different levels
- **Audit Trails**: Complete history of all changes
- **Request Logging**: HTTP request/response logging
- **Error Handling**: Centralized error handling with proper status codes

## 🚀 Deployment

The application is ready for deployment to:

- **Cloud Platforms**: AWS, Google Cloud, Azure
- **Container Platforms**: Docker, Kubernetes
- **Platform-as-a-Service**: Heroku, Vercel, Railway

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run linting and tests
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

For more information or support, please refer to the API documentation or contact the development team.