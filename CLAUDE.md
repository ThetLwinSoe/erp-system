# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Full-stack multi-tenant ERP system for SMEs: Node/Express/Sequelize (PostgreSQL) REST API at the repo root, with a separate React (Vite) frontend in `erp-frontend/`. Modules: auth, companies (multi-tenant), users, customers/suppliers, products, inventory, inventory adjustments, sales + sales returns, purchases + purchase returns, reports.

There are no automated tests in this repo (no test script/framework configured in either `package.json`).

## Commands

### Backend (repo root)
```bash
npm install          # install deps
npm run dev           # start with nodemon (auto-restart), reads .env
npm start             # start with node (production)
```
Backend needs a running PostgreSQL instance and a `.env` file (copy from `.env.example`): `PORT`, `NODE_ENV`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`. On boot (`server.js`), Sequelize authenticates then calls `db.sequelize.sync()` — schema changes to models take effect automatically on next restart (no migration files in this repo).

### Frontend (`erp-frontend/`)
```bash
npm install
npm run dev            # Vite dev server, http://localhost:5173
npm run build           # production build
npm run preview          # preview production build
npm run lint             # ESLint
```
Frontend needs `erp-frontend/.env` with `VITE_API_URL` (defaults to `http://localhost:3000/api` if unset).

There is no single top-level command that runs both — start backend and frontend in separate terminals.

## Architecture

### Backend layering (`src/`)
Requests flow **routes → middleware → controller → service → models**. Keep business logic in services, not controllers.

- `routes/*.routes.js` — wire URL + HTTP verb to controller methods, attach `express-validator` chains from `middleware/validate.js` and auth/company-scope middleware. All mounted under `/api` in `routes/index.js`.
- `controllers/*.controller.js` — parse query/body, call the matching service, translate results/errors into `ApiResponse` calls. Thin; no direct Sequelize transaction logic beyond simple CRUD.
- `services/*.service.js` — only exist for modules with real business logic (`auth`, `inventory`, `sales`, `purchases`); everything else is handled directly in the controller. Services wrap multi-step writes in `sequelize.transaction(...)` (e.g. `sales.service.js` creates a Sale + SaleItems + deducts inventory atomically) and throw `Error` objects with a `.statusCode` property that the error handler / controller `catch` maps to an HTTP status.
- `models/index.js` — single file that instantiates Sequelize, requires every model, and declares **all** associations (aliases matter — controllers/services `include` by `as:`). When adding a model, register it and its associations here.
- `middleware/auth.js` — `authenticate` (verifies JWT, loads `req.user`/`req.companyId`/`req.isSuperAdmin`), `authorize(...roles)`, `requireSuperAdmin`, `restrictSaleRep`, `checkSaleRep` (sets `req.isSaleRep` for filtering, e.g. sale reps only see their own sales).
- `middleware/companyScope.js` — `companyScope` sets `req.companyFilter` (empty for superadmin unless `?companyId=` given, else `{ companyId: req.user.companyId }`) — spread this into Sequelize `where` clauses for tenant isolation. `getCompanyIdForCreate(req)` resolves the companyId to use when creating records (superadmin must pass `companyId` in body; regular users use their own).
- `middleware/validate.js` — all `express-validator` rule chains, grouped by resource (`authValidation`, `userValidation`, `salesValidation`, etc.), each ending in `handleValidation` which formats errors via `ApiResponse.badRequest`.
- `middleware/errorHandler.js` — global error handler; maps Sequelize error names (`SequelizeValidationError`, `SequelizeUniqueConstraintError`, `SequelizeForeignKeyConstraintError`) and JWT errors to appropriate status codes; falls back to `err.statusCode || 500`. Hides internal messages/stack in production.
- `utils/apiResponse.js` — `ApiResponse` static helpers (`success`, `created`, `error`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `paginated`) — use these instead of building `res.json(...)` by hand, to keep the response envelope (`{ success, message, data }` / `{ success, message, data, pagination }` / `{ success, message, errors }`) consistent.
- `utils/constants.js` — single source of truth for enums used across validation, models, and business logic: `ROLES` (`superadmin`, `admin`, `manager`, `staff`, `sale_rep`), `COMPANY_STATUS`, `CURRENCIES`, `ORDER_STATUS`, `PURCHASE_STATUS`, `SALES_RETURN_STATUS`, `PURCHASE_RETURN_STATUS`, `ADJUSTMENT_TYPE`, `INVENTORY_ADJUSTMENT_STATUS`, `CUSTOMER_TYPE`, `PAGINATION` defaults. Reuse these instead of hardcoding string literals.

### Multi-tenancy model
- `Company` is the tenant boundary; almost every model has a `companyId` foreign key.
- `superadmin` role bypasses company scoping (manages companies themselves, can filter by `?companyId=`); all other roles are hard-scoped to their own `companyId` via `companyScope` middleware.
- `authenticate` also blocks non-superadmin users whose company `status` is `inactive`.
- `sale_rep` role is further restricted: blocked from certain modules (`restrictSaleRep`) and, where allowed, only sees/creates records tied to their own `userId` (see `checkSaleRep` / `req.isSaleRep` usage in `sales.controller.js`).

### Order/workflow status machines
Sales, purchases, sales returns, purchase returns, and inventory adjustments are all state machines defined in `utils/constants.js` with explicit valid-transition maps enforced in the relevant service (see `updateSaleStatus` in `src/services/sales.service.js` for the pattern: look up valid transitions, reject invalid ones with a 400, and side-effect inventory (restore/deduct stock) inside a transaction when a status change requires it).

### Frontend structure (`erp-frontend/src/`)
- `services/api.js` — single Axios instance (`api`) with a request interceptor that attaches `Authorization: Bearer <token>` from `localStorage`, and a response interceptor that clears auth and redirects to `/login` on 401. Every backend resource has a corresponding exported `*API` object (`authAPI`, `salesAPI`, `inventoryAPI`, etc.) — add new backend endpoints here rather than calling `axios` directly from components. `getStaticUrl(path)` builds absolute URLs for uploaded files (logos) served from `/uploads`.
- `context/AuthContext.jsx` — `AuthProvider`/`useAuth()` hold the logged-in `user` (persisted in `localStorage` alongside the JWT) and expose role-check helpers (`isSuperAdmin`, `isAdmin`, `isManager`, `isSaleRep`, `canAccessInventory`, `canAccessPurchases`, `canAccessSalesReturns`) — use these instead of comparing `user.role` inline so role logic stays centralized.
- `App.jsx` — all routes declared here with `react-router-dom` v6; protected routes are nested under `<PrivateRoute />` + `<Layout />`. Add new pages both as a file in `pages/` and a `<Route>` here.
- `components/Layout/` — `Layout`, `Navbar`, `Sidebar` (app chrome for authenticated routes).
- `components/common/` — shared UI: `ConfirmModal`, `ErrorAlert`, `Pagination`, `SearchBar`, `StatusBadge`.
- `pages/` — one component per route, generally following a List page + Details page + Create page split per module (e.g. `Sales.jsx` / `SaleDetails.jsx`, `Purchases.jsx` / `PurchaseDetails.jsx` / `CreatePurchaseReturn.jsx`).
- PDF invoices are generated client-side with `jspdf` + `jspdf-autotable`.

### API response envelope
All backend responses follow one of:
```json
{ "success": true, "message": "...", "data": ... }
{ "success": true, "message": "...", "data": [...], "pagination": { "total", "page", "limit", "totalPages" } }
{ "success": false, "message": "...", "errors": [ { "field", "message" } ] }
```
Frontend code reads `response.data.data` (and `.pagination` where present) — see `AuthContext.login` for the pattern.

See `README.md` for the full REST endpoint list and role permission matrix.
