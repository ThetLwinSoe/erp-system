import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

// Layout
import Layout from './components/Layout/Layout'
import PrivateRoute from './components/PrivateRoute'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import CompanyDetails from './pages/CompanyDetails'
import Users from './pages/Users'
import Customers from './pages/Customers'
import Products from './pages/Products'
import Inventory from './pages/Inventory'
import Sales from './pages/Sales'
import SaleDetails from './pages/SaleDetails'
import SalesReturns from './pages/SalesReturns'
import SalesReturnDetails from './pages/SalesReturnDetails'
import CreateSalesReturn from './pages/CreateSalesReturn'
import Purchases from './pages/Purchases'
import PurchaseDetails from './pages/PurchaseDetails'
import PurchaseReturns from './pages/PurchaseReturns'
import PurchaseReturnDetails from './pages/PurchaseReturnDetails'
import CreatePurchaseReturn from './pages/CreatePurchaseReturn'
import SalesReport from './pages/SalesReport'
import PurchasesReport from './pages/PurchasesReport'
import InventoryAdjustments from './pages/InventoryAdjustments'
import InventoryAdjustmentDetails from './pages/InventoryAdjustmentDetails'
import CreateInventoryAdjustment from './pages/CreateInventoryAdjustment'

function App() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />

      {/* Protected routes */}
      <Route element={<PrivateRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/companies/:id" element={<CompanyDetails />} />
          <Route path="/users" element={<Users />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/products" element={<Products />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory-adjustments" element={<InventoryAdjustments />} />
          <Route path="/inventory-adjustments/new" element={<CreateInventoryAdjustment />} />
          <Route path="/inventory-adjustments/:id" element={<InventoryAdjustmentDetails />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales/:id" element={<SaleDetails />} />
          <Route path="/sales/:saleId/return" element={<CreateSalesReturn />} />
          <Route path="/sales-returns" element={<SalesReturns />} />
          <Route path="/sales-returns/:id" element={<SalesReturnDetails />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/purchases/:id" element={<PurchaseDetails />} />
          <Route path="/purchases/:purchaseId/return" element={<CreatePurchaseReturn />} />
          <Route path="/purchase-returns" element={<PurchaseReturns />} />
          <Route path="/purchase-returns/:id" element={<PurchaseReturnDetails />} />
          <Route path="/reports/sales" element={<SalesReport />} />
          <Route path="/reports/purchases" element={<PurchasesReport />} />
        </Route>
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
