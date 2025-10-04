#!/bin/bash

# Expense Management Backend Setup Script
# This script sets up the complete backend environment

echo "🚀 Setting up Expense Management Backend..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

print_status "Node.js version check passed: $(node -v)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm and try again."
    exit 1
fi

print_status "npm found: $(npm -v)"

# Install dependencies
print_status "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    print_error "Failed to install dependencies"
    exit 1
fi

print_status "Dependencies installed successfully"

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from .env.example..."
    cp .env.example .env
    print_warning "Please edit .env file with your actual configuration values"
else
    print_status ".env file found"
fi

# Check if PostgreSQL is running (optional)
if command -v psql &> /dev/null; then
    print_status "PostgreSQL client found"
else
    print_warning "PostgreSQL client not found. Make sure PostgreSQL is installed and running."
fi

# Generate Prisma client
print_status "Generating Prisma client..."
npx prisma generate

if [ $? -ne 0 ]; then
    print_error "Failed to generate Prisma client"
    exit 1
fi

print_status "Prisma client generated successfully"

# Build TypeScript
print_status "Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    print_error "TypeScript build failed"
    exit 1
fi

print_status "TypeScript build completed successfully"

# Create logs directory
mkdir -p logs
print_status "Logs directory created"

# Run tests
print_status "Running tests..."
npm test

if [ $? -ne 0 ]; then
    print_warning "Some tests failed, but continuing setup..."
else
    print_status "All tests passed"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Configure your .env file with actual values"
echo "2. Set up your PostgreSQL database"
echo "3. Run migrations: npm run db:migrate"
echo "4. Seed the database: npm run db:seed"
echo "5. Start the development server: npm run dev"
echo ""
echo "📊 Available commands:"
echo "  npm run dev          - Start development server"
echo "  npm run build        - Build for production"
echo "  npm start            - Start production server"
echo "  npm test             - Run tests"
echo "  npm run db:migrate   - Run database migrations"
echo "  npm run db:seed      - Seed database with sample data"
echo "  npm run db:studio    - Open Prisma Studio"
echo ""
echo "🌐 Once running, the API will be available at:"
echo "  http://localhost:3000/api"
echo "  Health check: http://localhost:3000/health"
echo ""
echo "📖 Check README.md for detailed documentation"