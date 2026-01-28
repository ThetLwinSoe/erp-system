import { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Alert, Spinner } from 'react-bootstrap';
import { FaUsers, FaBoxes, FaShoppingCart, FaExclamationTriangle } from 'react-icons/fa';
import { customersAPI, productsAPI, salesAPI, inventoryAPI } from '../services/api';

const StatCard = ({ title, value, icon: Icon, color }) => (
  <Card className="h-100">
    <Card.Body className="d-flex align-items-center">
      <div className={`rounded-circle p-3 me-3 bg-${color} bg-opacity-10`}>
        <Icon size={24} className={`text-${color}`} />
      </div>
      <div>
        <h6 className="text-muted mb-1">{title}</h6>
        <h3 className="mb-0">{value}</h3>
      </div>
    </Card.Body>
  </Card>
);

const Dashboard = () => {
  const [stats, setStats] = useState({
    customers: 0,
    products: 0,
    sales: 0,
    lowStock: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [customersRes, productsRes, salesRes, lowStockRes] = await Promise.all([
          customersAPI.getAll({ limit: 1 }),
          productsAPI.getAll({ limit: 1 }),
          salesAPI.getAll({ limit: 1 }),
          inventoryAPI.getLowStock(),
        ]);

        setStats({
          customers: customersRes.data.pagination?.total || 0,
          products: productsRes.data.pagination?.total || 0,
          sales: salesRes.data.pagination?.total || 0,
          lowStock: lowStockRes.data.data || [],
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4">Dashboard</h2>

      <Row className="g-4 mb-4">
        <Col md={3}>
          <StatCard title="Customers" value={stats.customers} icon={FaUsers} color="primary" />
        </Col>
        <Col md={3}>
          <StatCard title="Products" value={stats.products} icon={FaBoxes} color="success" />
        </Col>
        <Col md={3}>
          <StatCard title="Total Sales" value={stats.sales} icon={FaShoppingCart} color="info" />
        </Col>
        <Col md={3}>
          <StatCard
            title="Low Stock Items"
            value={stats.lowStock.length}
            icon={FaExclamationTriangle}
            color="warning"
          />
        </Col>
      </Row>

      {stats.lowStock.length > 0 && (
        <Card>
          <Card.Header className="bg-warning bg-opacity-10">
            <FaExclamationTriangle className="me-2 text-warning" />
            Low Stock Alerts
          </Card.Header>
          <Card.Body>
            <Table striped hover responsive>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product Name</th>
                  <th>Current Stock</th>
                  <th>Min Stock Level</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {stats.lowStock.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product?.sku}</td>
                    <td>{item.product?.name}</td>
                    <td className="text-danger fw-bold">{item.quantity}</td>
                    <td>{item.minStockLevel}</td>
                    <td>{item.location || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {stats.lowStock.length === 0 && (
        <Alert variant="success">
          All inventory levels are healthy. No low stock items detected.
        </Alert>
      )}
    </div>
  );
};

export default Dashboard;
