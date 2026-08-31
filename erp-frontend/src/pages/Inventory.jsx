import { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Spinner, Alert, Badge, Tab, Tabs } from 'react-bootstrap';
import { FaExclamationTriangle, FaFileExport } from 'react-icons/fa';
import { inventoryAPI } from '../services/api';
import Pagination from '../components/common/Pagination';
import SortableHeader from '../components/common/SortableHeader';

// Low Stock data is fetched in full (no pagination), so it's sorted client-side
// using the same sortBy/sortOrder state that drives the server-sorted "All Inventory" tab.
const getSortValue = (item, field) => {
  switch (field) {
    case 'sku': return item.product?.sku ?? null;
    case 'name': return item.product?.name ?? null;
    case 'category': return item.product?.category ?? null;
    case 'location': return item.location ?? null;
    case 'lastRestocked': return item.lastRestocked ? new Date(item.lastRestocked).getTime() : null;
    default: return item[field];
  }
};

const sortItems = (items, sortBy, sortOrder) => {
  return [...items].sort((a, b) => {
    const aVal = getSortValue(a, sortBy);
    const bVal = getSortValue(b, sortBy);

    // Nulls (e.g. never-restocked items) always sort last, regardless of direction
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    const comparison = typeof aVal === 'string'
      ? aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
      : aVal - bVal;

    return sortOrder === 'ASC' ? comparison : -comparison;
  });
};

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [activeTab, setActiveTab] = useState('all');
  const [exporting, setExporting] = useState(false);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const [inventoryRes, lowStockRes] = await Promise.all([
        inventoryAPI.getAll({ page, limit: 20, sortBy, sortOrder }),
        inventoryAPI.getLowStock(),
      ]);
      setInventory(inventoryRes.data.data || []);
      setPagination(inventoryRes.data.pagination || { total: 0, totalPages: 1 });
      setLowStock(lowStockRes.data.data || []);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [page, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const sortedLowStock = useMemo(
    () => sortItems(lowStock, sortBy, sortOrder),
    [lowStock, sortBy, sortOrder]
  );

  const getStockBadge = (item) => {
    const { quantity, minStockLevel } = item;
    if (quantity <= 0) return <Badge bg="danger">{quantity}</Badge>;
    if (quantity <= minStockLevel) return <Badge bg="warning">{quantity}</Badge>;
    return <Badge bg="success">{quantity}</Badge>;
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await inventoryAPI.exportCSV();

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting inventory:', error);
    } finally {
      setExporting(false);
    }
  };

  const renderTable = (data, sortable = false) => (
    <Table striped hover responsive>
      <thead>
        <tr>
          {sortable ? (
            <>
              <SortableHeader label="SKU" field="sku" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Product Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Category" field="category" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Stock" field="quantity" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Min Level" field="minStockLevel" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Location" field="location" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Last Restocked" field="lastRestocked" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
            </>
          ) : (
            <>
              <th>SKU</th>
              <th>Product Name</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Min Level</th>
              <th>Location</th>
              <th>Last Restocked</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item.id}>
            <td><code>{item.product?.sku}</code></td>
            <td>{item.product?.name}</td>
            <td>{item.product?.category || '-'}</td>
            <td>{getStockBadge(item)}</td>
            <td>{item.minStockLevel}</td>
            <td>{item.location || '-'}</td>
            <td>{item.lastRestocked ? new Date(item.lastRestocked).toLocaleDateString() : '-'}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Inventory Management</h2>
        {inventory.length > 0 && (
          <Button variant="success" onClick={handleExport} disabled={exporting}>
            <FaFileExport className="me-2" />
            {exporting ? 'Exporting...' : 'Export to CSV'}
          </Button>
        )}
      </div>

      <Card>
        <Card.Header>
          <Tabs activeKey={activeTab} onSelect={setActiveTab}>
            <Tab eventKey="all" title="All Inventory" />
            <Tab
              eventKey="low"
              title={
                <span>
                  <FaExclamationTriangle className="me-1 text-warning" />
                  Low Stock ({lowStock.length})
                </span>
              }
            />
          </Tabs>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <>
              {activeTab === 'all' && renderTable(inventory, true)}
              {activeTab === 'low' && (
                lowStock.length > 0 ? renderTable(sortedLowStock, true) : (
                  <Alert variant="success">No low stock items. All inventory levels are healthy.</Alert>
                )
              )}
            </>
          )}
        </Card.Body>
        {activeTab === 'all' && (
          <Card.Footer className="d-flex justify-content-between align-items-center">
            <span className="text-muted">Total: {pagination.total} items</span>
            <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </Card.Footer>
        )}
      </Card>
    </div>
  );
};

export default Inventory;
