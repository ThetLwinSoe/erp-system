# ERP System for SME

A full-stack Enterprise Resource Planning (ERP) system for Small and Medium Enterprises, featuring a Node.js REST API backend and React frontend.

## Features

### Core Modules
- **Multi-Tenant Support**: Company-based data isolation with Super Admin management
- **User Authentication**: JWT-based authentication with role-based access control
- **User Management**: Admin-only user CRUD operations
- **Customer Management**: Full CRUD for customers and suppliers
- **Product Management**: Product catalog with SKU tracking

### Inventory Management
- **Stock Tracking**: Real-time inventory levels with low-stock alerts
- **Inventory Adjustments**: Audit trail for stock adjustments with approval workflow
  - Create adjustment records with physical count (ground values)
  - Status workflow: Pending → Approved → Completed
  - Automatic inventory update on completion
- **CSV Export**: Export current inventory to CSV

### Sales Module
- **Sales Orders**: Order processing with automatic inventory deduction
- **Sales Returns**: Partial/full return support with inventory restoration
- **PDF Invoices**: Generate and print professional invoices with company branding
- **Sales Reports**: Filterable reports with CSV export

### Purchases Module
- **Purchase Orders**: Purchase order management with goods receiving
- **Purchase Returns**: Return management with supplier credit tracking
- **Purchases Reports**: Filterable reports with CSV export

### Additional Features
- **Multi-Currency Support**: USD, SGD, THB, MMK
- **Company Branding**: Logo upload for invoices
- **Reports & Analytics**: Sales and purchases reports with export functionality

## Tech Stack

### Backend
- **Runtime**: Node.js with Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: express-validator
- **Password Hashing**: bcryptjs
- **Security**: helmet, cors
- **File Upload**: multer

### Frontend
- **Framework**: React 18 with Vite
- **UI Library**: React Bootstrap
- **Routing**: React Router v6
- **Icons**: React Icons (Font Awesome)
- **PDF Generation**: jsPDF with jspdf-autotable
- **HTTP Client**: Axios

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

### Backend Setup

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

6. Start the backend server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd erp-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
VITE_API_URL=http://localhost:3000/api
```

4. Start the frontend development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT |
| GET | `/api/auth/me` | Get current user profile |

### Companies (Super Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | List all companies |
| POST | `/api/companies` | Create company |
| GET | `/api/companies/:id` | Get company details |
| PUT | `/api/companies/:id` | Update company |
| DELETE | `/api/companies/:id` | Delete company |
| POST | `/api/companies/:id/logo` | Upload company logo |
| DELETE | `/api/companies/:id/logo` | Delete company logo |

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
| GET | `/api/inventory/export` | Export inventory to CSV |
| GET | `/api/inventory/:productId` | Get product inventory |
| PUT | `/api/inventory/:productId` | Update stock |
| POST | `/api/inventory/adjust` | Adjust stock (add/remove/set) |

### Inventory Adjustments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory-adjustments` | List all adjustments |
| GET | `/api/inventory-adjustments/products` | Get products with current stock |
| POST | `/api/inventory-adjustments` | Create adjustment |
| GET | `/api/inventory-adjustments/:id` | Get adjustment details |
| PATCH | `/api/inventory-adjustments/:id/status` | Update status |
| DELETE | `/api/inventory-adjustments/:id` | Delete adjustment (pending only) |

### Sales
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sales` | List sales orders |
| POST | `/api/sales` | Create sale order |
| GET | `/api/sales/:id` | Get sale details |
| PUT | `/api/sales/:id` | Update sale |
| PATCH | `/api/sales/:id/status` | Update status |
| DELETE | `/api/sales/:id` | Cancel/delete sale |

### Sales Returns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sales-returns` | List sales returns |
| GET | `/api/sales-returns/sale/:saleId/returnable-items` | Get returnable items |
| POST | `/api/sales-returns` | Create sales return |
| GET | `/api/sales-returns/:id` | Get return details |
| PATCH | `/api/sales-returns/:id/status` | Update status |
| DELETE | `/api/sales-returns/:id` | Delete return |

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

### Purchase Returns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/purchase-returns` | List purchase returns |
| GET | `/api/purchase-returns/purchase/:purchaseId/returnable-items` | Get returnable items |
| POST | `/api/purchase-returns` | Create purchase return |
| GET | `/api/purchase-returns/:id` | Get return details |
| PATCH | `/api/purchase-returns/:id/status` | Update status |
| DELETE | `/api/purchase-returns/:id` | Delete return |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/sales` | Get sales report |
| GET | `/api/reports/sales/export` | Export sales to CSV |
| GET | `/api/reports/purchases` | Get purchases report |
| GET | `/api/reports/purchases/export` | Export purchases to CSV |

## User Roles

- **superadmin**: Full access including company management
- **admin**: Full access to all features within their company
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

## Project Structure

```
erp-system/
├── src/
│   ├── config/
│   │   └── database.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── companyScope.js
│   │   ├── errorHandler.js
│   │   └── validate.js
│   ├── models/
│   │   ├── index.js
│   │   ├── Company.js
│   │   ├── User.js
│   │   ├── Customer.js
│   │   ├── Product.js
│   │   ├── Inventory.js
│   │   ├── InventoryAdjustment.js
│   │   ├── InventoryAdjustmentItem.js
│   │   ├── Sale.js
│   │   ├── SaleItem.js
│   │   ├── SalesReturn.js
│   │   ├── SalesReturnItem.js
│   │   ├── Purchase.js
│   │   ├── PurchaseItem.js
│   │   ├── PurchaseReturn.js
│   │   └── PurchaseReturnItem.js
│   ├── routes/
│   │   ├── index.js
│   │   ├── auth.routes.js
│   │   ├── companies.routes.js
│   │   ├── users.routes.js
│   │   ├── customers.routes.js
│   │   ├── products.routes.js
│   │   ├── inventory.routes.js
│   │   ├── inventoryAdjustments.routes.js
│   │   ├── sales.routes.js
│   │   ├── salesReturns.routes.js
│   │   ├── purchases.routes.js
│   │   ├── purchaseReturns.routes.js
│   │   └── reports.routes.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── companies.controller.js
│   │   ├── users.controller.js
│   │   ├── customers.controller.js
│   │   ├── products.controller.js
│   │   ├── inventory.controller.js
│   │   ├── inventoryAdjustments.controller.js
│   │   ├── sales.controller.js
│   │   ├── salesReturns.controller.js
│   │   ├── purchases.controller.js
│   │   ├── purchaseReturns.controller.js
│   │   └── reports.controller.js
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── inventory.service.js
│   │   └── sales.service.js
│   └── utils/
│       ├── apiResponse.js
│       └── constants.js
├── uploads/                    # Uploaded files (logos)
├── erp-frontend/              # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   └── Layout/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   ├── public/
│   └── package.json
├── app.js
├── server.js
├── package.json
├── .env.example
└── README.md
```

## Screenshots

### Dashboard
The main dashboard provides an overview of key business metrics.

### Inventory Management
- View all inventory with stock levels
- Export inventory data to CSV
- Low stock alerts

### Inventory Adjustments
- Create adjustments with physical count values
- Approval workflow (Pending → Approved → Completed)
- Audit trail for all stock changes

### Sales & Purchases
- Create and manage orders
- Generate PDF invoices
- Process returns

## License

ISC
