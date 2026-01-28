# ERP System for SME

A Node.js REST API for a basic Enterprise Resource Planning (ERP) system targeting Small and Medium Enterprises.

## Features

- **User Authentication**: JWT-based authentication with role-based access control
- **User Management**: Admin-only user CRUD operations
- **Customer Management**: Full CRUD for customers/suppliers
- **Product Management**: Product catalog with SKU tracking
- **Inventory Management**: Stock tracking with low-stock alerts
- **Sales Orders**: Sales order processing with automatic inventory deduction
- **Purchase Orders**: Purchase order management with goods receiving

## Tech Stack

- **Runtime**: Node.js with Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: express-validator
- **Password Hashing**: bcryptjs
- **Security**: helmet, cors

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
cd erp-system
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=erp_database
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=24h
```

5. Create the PostgreSQL database:
```sql
CREATE DATABASE erp_database;
```

6. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT |
| GET | `/api/auth/me` | Get current user profile |

### Users (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| GET | `/api/users/:id` | Get user details |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

### Customers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/customers/:id` | Get customer details |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products |
| POST | `/api/products` | Create product |
| GET | `/api/products/:id` | Get product details |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory` | List stock levels |
| GET | `/api/inventory/low-stock` | Get low stock items |
| GET | `/api/inventory/:productId` | Get product inventory |
| PUT | `/api/inventory/:productId` | Update stock |
| POST | `/api/inventory/adjust` | Adjust stock (add/remove/set) |

### Sales
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sales` | List sales orders |
| POST | `/api/sales` | Create sale order |
| GET | `/api/sales/:id` | Get sale details |
| PUT | `/api/sales/:id` | Update sale |
| PATCH | `/api/sales/:id/status` | Update status |
| DELETE | `/api/sales/:id` | Cancel/delete sale |

### Purchases
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/purchases` | List purchase orders |
| POST | `/api/purchases` | Create purchase order |
| GET | `/api/purchases/:id` | Get purchase details |
| PUT | `/api/purchases/:id` | Update purchase |
| PATCH | `/api/purchases/:id/status` | Update status |
| PATCH | `/api/purchases/:id/receive` | Receive goods |
| DELETE | `/api/purchases/:id` | Delete purchase |

## User Roles

- **admin**: Full access to all features including user management
- **manager**: Access to all business operations
- **staff**: Limited access to day-to-day operations

## API Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Paginated Response
```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [ ... ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [ ... ]
}
```

## Example Usage

### Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123",
    "name": "Admin User",
    "role": "admin"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'
```

### Create a Product (with auth token)
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "sku": "PROD-001",
    "name": "Sample Product",
    "description": "A sample product",
    "category": "Electronics",
    "unit": "piece",
    "costPrice": 50.00,
    "sellingPrice": 79.99
  }'
```

### Create a Sale Order
```bash
curl -X POST http://localhost:3000/api/sales \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "customerId": 1,
    "items": [
      {
        "productId": 1,
        "quantity": 2
      }
    ],
    "tax": 10.00,
    "notes": "First order"
  }'
```

## Project Structure

```
erp-system/
├── src/
│   ├── config/
│   │   └── database.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   └── validate.js
│   ├── models/
│   │   ├── index.js
│   │   ├── User.js
│   │   ├── Customer.js
│   │   ├── Product.js
│   │   ├── Inventory.js
│   │   ├── Sale.js
│   │   ├── SaleItem.js
│   │   ├── Purchase.js
│   │   └── PurchaseItem.js
│   ├── routes/
│   │   ├── index.js
│   │   ├── auth.routes.js
│   │   ├── users.routes.js
│   │   ├── customers.routes.js
│   │   ├── products.routes.js
│   │   ├── inventory.routes.js
│   │   ├── sales.routes.js
│   │   └── purchases.routes.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── users.controller.js
│   │   ├── customers.controller.js
│   │   ├── products.controller.js
│   │   ├── inventory.controller.js
│   │   ├── sales.controller.js
│   │   └── purchases.controller.js
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── inventory.service.js
│   │   └── sales.service.js
│   └── utils/
│       ├── apiResponse.js
│       └── constants.js
├── app.js
├── server.js
├── package.json
├── .env.example
└── README.md
```

## License

ISC
