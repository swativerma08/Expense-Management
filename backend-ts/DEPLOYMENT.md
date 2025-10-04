# Deployment Guide

## Quick Setup (Recommended)

1. **Run the setup script**:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

## Manual Setup

If you prefer manual setup:

### 1. Environment Setup
```bash
# Copy environment file
cp .env.example .env

# Edit with your values
nano .env
```

### 2. Database Setup
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed with sample data
npm run db:seed
```

### 3. Build and Start
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Docker Deployment

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:password@db:5432/expense_management
    depends_on:
      - db
  
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=expense_management
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Environment Variables

Required:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Strong secret for JWT tokens
- `JWT_REFRESH_SECRET`: Strong secret for refresh tokens

Optional:
- `SENDGRID_API_KEY`: For email notifications
- `EXCHANGE_RATE_API_KEY`: For currency conversion
- `AWS_ACCESS_KEY_ID`: For file uploads
- `AWS_SECRET_ACCESS_KEY`: For file uploads

## Production Checklist

- [ ] Set strong JWT secrets
- [ ] Configure database with SSL
- [ ] Set up email service (SendGrid)
- [ ] Configure file storage (AWS S3)
- [ ] Set up monitoring and logging
- [ ] Configure reverse proxy (nginx)
- [ ] Set up SSL certificates
- [ ] Configure backup strategy
- [ ] Set up health checks
- [ ] Configure rate limiting