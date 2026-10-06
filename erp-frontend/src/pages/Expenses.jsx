import { useState, useEffect, useRef } from 'react';
import { Card, Table, Button, Spinner, Form, Row, Col, Modal, InputGroup, Alert } from 'react-bootstrap';
import { FaTrash, FaEdit, FaPlus, FaFileInvoiceDollar } from 'react-icons/fa';
import { expensesAPI, companiesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/common/Pagination';
import ConfirmModal from '../components/common/ConfirmModal';
import ErrorAlert from '../components/common/ErrorAlert';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import { EXPENSE_CATEGORIES } from '../utils/constants';

// Local calendar date as YYYY-MM-DD (toISOString would give the UTC date).
const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

const emptyForm = () => ({
  expenseDate: todayLocal(),
  category: EXPENSE_CATEGORIES[0],
  amount: '',
  paidTo: '',
  paymentMethod: '',
  reference: '',
  notes: '',
});

const Expenses = () => {
  const { user, isSuperAdmin, canAccessExpenseTracker } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [error, setError] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [savedNotice, setSavedNotice] = useState(null);
  const formRef = useRef(null);
  const amountRef = useRef(null);

  const selectedCompany = isSuperAdmin()
    ? companies.find((c) => String(c.id) === String(companyId))
    : user?.company;
  const currency = selectedCompany?.currency || 'USD';
  // Superadmin must also pick a company here, since the backend needs one to
  // resolve which company's expense settings apply.
  const canQuery = canAccessExpenseTracker() && (!isSuperAdmin() || !!companyId);

  useEffect(() => {
    if (isSuperAdmin()) {
      companiesAPI.getAll({ limit: 100 })
        .then((res) => setCompanies(res.data.data || []))
        .catch(() => setCompanies([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchExpenses = async () => {
    if (!canQuery) {
      setExpenses([]);
      setPagination({ total: 0, totalPages: 1 });
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params = { page, limit: 20 };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (categoryFilter) params.category = categoryFilter;
      if (isSuperAdmin() && companyId) params.companyId = companyId;

      const response = await expensesAPI.getAll(params);
      setExpenses(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      setError(extractApiError(err, 'Failed to load expenses'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, startDate, endDate, categoryFilter, companyId]);

  const openCreate = () => {
    setError(null);
    setSavedNotice(null);
    setEditingExpense(null);
    setForm(emptyForm());
    setShowMoreDetails(false);
    setShowFormModal(true);
  };

  const openEdit = (expense) => {
    setError(null);
    setSavedNotice(null);
    setEditingExpense(expense);
    setShowMoreDetails(!!(expense.paidTo || expense.notes));
    setForm({
      expenseDate: expense.expenseDate,
      category: expense.category,
      amount: expense.amount,
      paidTo: expense.paidTo || '',
      paymentMethod: expense.paymentMethod || '',
      reference: expense.reference || '',
      notes: expense.notes || '',
    });
    setShowFormModal(true);
  };

  const saveExpense = async (addAnother = false) => {
    try {
      setSaving(true);
      setError(null);
      setSavedNotice(null);
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editingExpense) {
        const params = isSuperAdmin() && companyId ? { companyId } : undefined;
        await expensesAPI.update(editingExpense.id, payload, params);
      } else {
        // Superadmin: the company goes in the body (for the record) and in the query
        // string (for the access check, which runs before the controller reads the body).
        const createParams = isSuperAdmin() && companyId ? { companyId } : undefined;
        if (isSuperAdmin()) payload.companyId = parseInt(companyId);
        await expensesAPI.create(payload, createParams);
      }
      fetchExpenses();
      if (addAnother) {
        // Keep the date and category, which are usually the same across a batch of entries.
        setForm({ ...emptyForm(), expenseDate: form.expenseDate, category: form.category });
        setSavedNotice(`Saved ${formatCurrency(payload.amount, currency)}. Add the next one.`);
        setShowMoreDetails(false);
        amountRef.current?.focus();
        return;
      }
      setShowFormModal(false);
    } catch (err) {
      setError(extractApiError(err, 'Failed to save expense'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    saveExpense(false);
  };

  const handleDelete = async () => {
    try {
      const params = isSuperAdmin() && companyId ? { companyId } : undefined;
      await expensesAPI.delete(selectedExpense.id, params);
      setShowDeleteModal(false);
      fetchExpenses();
    } catch (err) {
      setError(extractApiError(err, 'Delete failed'));
    }
  };

  const setField = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <FaFileInvoiceDollar className="me-2" />
          Expenses
        </h2>
        {canQuery && (
          <Button variant="primary" onClick={openCreate}>
            <FaPlus className="me-2" />
            Add Expense
          </Button>
        )}
      </div>

      <p className="text-muted">
        Operating expenses recorded here reduce net profit in the Profit &amp; Loss report while Expense Tracker is on for this company.
      </p>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      <Card>
        <Card.Header>
          <Row className="g-3">
            {isSuperAdmin() && (
              <Col md={3}>
                <Form.Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }}>
                  <option value="">Select company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Form.Select>
              </Col>
            )}
            <Col md={2}>
              <Form.Control type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} placeholder="From" />
            </Col>
            <Col md={2}>
              <Form.Control type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} placeholder="To" />
            </Col>
            <Col md={3}>
              <Form.Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
                <option value="">All Categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Form.Select>
            </Col>
          </Row>
        </Card.Header>

        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          ) : !canQuery ? (
            <div className="text-center text-muted p-5">
              {isSuperAdmin() ? 'Select a company to view its expenses.' : 'Expense Tracker is not available to your account.'}
            </div>
          ) : (
            <Table striped hover responsive className="mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Paid To</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="text-end">Amount</th>
                  <th>Recorded By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted py-4">No expenses recorded</td>
                  </tr>
                ) : (
                  expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.expenseDate}</td>
                      <td>{expense.category}</td>
                      <td>{expense.paidTo || '-'}</td>
                      <td>{expense.paymentMethod || '-'}</td>
                      <td>{expense.reference || '-'}</td>
                      <td className="text-end">{formatCurrency(expense.amount, currency)}</td>
                      <td>{expense.user?.name || '-'}</td>
                      <td>
                        <Button variant="outline-primary" size="sm" className="me-2" onClick={() => openEdit(expense)} title="Edit">
                          <FaEdit />
                        </Button>
                        {isSuperAdmin() && (
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => { setError(null); setSelectedExpense(expense); setShowDeleteModal(true); }}
                            title="Delete"
                          >
                            <FaTrash />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </Card.Body>

        <Card.Footer className="d-flex justify-content-between align-items-center">
          <span className="text-muted">Total: {pagination.total} expenses</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <Modal show={showFormModal} onHide={() => setShowFormModal(false)} centered onEntered={() => amountRef.current?.focus()}>
        <Form ref={formRef} onSubmit={handleSave}>
          <Modal.Header closeButton>
            <Modal.Title>{editingExpense ? 'Edit Expense' : 'Add Expense'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <ErrorAlert error={error} dismissible onClose={() => setError(null)} />
            {savedNotice && (
              <Alert variant="success" dismissible onClose={() => setSavedNotice(null)} className="py-2">
                {savedNotice}
              </Alert>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Amount *</Form.Label>
              <InputGroup>
                <InputGroup.Text>{currency}</InputGroup.Text>
                <Form.Control
                  ref={amountRef}
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  required
                  value={form.amount}
                  onChange={setField('amount')}
                />
              </InputGroup>
            </Form.Group>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Date *</Form.Label>
                  <Form.Control type="date" required value={form.expenseDate} onChange={setField('expenseDate')} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Category *</Form.Label>
                  <Form.Select required value={form.category} onChange={setField('category')}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Payment Method</Form.Label>
                  <Form.Control type="text" maxLength={50} value={form.paymentMethod} onChange={setField('paymentMethod')} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Reference</Form.Label>
                  <Form.Control type="text" maxLength={100} value={form.reference} onChange={setField('reference')} />
                </Form.Group>
              </Col>
            </Row>
            <Button
              variant="link"
              className="p-0 mb-3 text-decoration-none"
              onClick={() => setShowMoreDetails(!showMoreDetails)}
              aria-expanded={showMoreDetails}
            >
              {showMoreDetails ? '− Hide details' : '+ More details'}
            </Button>
            {showMoreDetails && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>Paid To</Form.Label>
                  <Form.Control type="text" maxLength={255} value={form.paidTo} onChange={setField('paidTo')} />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control as="textarea" rows={2} value={form.notes} onChange={setField('notes')} />
                </Form.Group>
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="flex-wrap">
            <Button variant="secondary" onClick={() => setShowFormModal(false)}>Cancel</Button>
            {!editingExpense && (
              <Button
                variant="outline-primary"
                disabled={saving}
                onClick={() => formRef.current?.reportValidity() && saveExpense(true)}
              >
                Save &amp; add another
              </Button>
            )}
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Expense"
        message={`Are you sure you want to delete this expense of ${selectedExpense ? formatCurrency(selectedExpense.amount, currency) : ''}?`}
        error={error}
      />
    </div>
  );
};

export default Expenses;
