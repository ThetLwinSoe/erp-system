import { useEffect, useState } from 'react';
import { Modal, Button, Form, Alert, Table } from 'react-bootstrap';
import { FaDownload } from 'react-icons/fa';
import { extractApiError } from '../../utils/errorUtils';
import ErrorAlert from './ErrorAlert';

const escapeCSVValue = (value) => {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const downloadTemplate = (headers, row, filename) => {
  const csvContent = [headers, row].map((r) => r.map(escapeCSVValue).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * Shared bulk-import modal: file picker + CSV template download + per-row result summary.
 */
const ImportCsvModal = ({ show, onHide, title, templateHeaders, templateRow, templateFilename, onImport, onImported }) => {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (show) {
      setFile(null);
      setImporting(false);
      setError(null);
      setResult(null);
    }
  }, [show]);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const response = await onImport(file);
      setResult(response.data.data);
    } catch (err) {
      setError(extractApiError(err, 'Import failed'));
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (result && result.created > 0) {
      onImported();
    }
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ErrorAlert error={error} />

        <p className="text-muted">
          Download the template below, fill in your data, and upload the CSV file.
        </p>

        <Button
          variant="outline-secondary"
          size="sm"
          className="mb-3"
          onClick={() => downloadTemplate(templateHeaders, templateRow, templateFilename)}
        >
          <FaDownload className="me-2" />
          Download Template
        </Button>

        <Form.Group controlId="importCsvFile" className="mb-3">
          <Form.Label>CSV File</Form.Label>
          <Form.Control
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Form.Group>

        {result && (
          <>
            <Alert variant={result.failed === 0 ? 'success' : result.created === 0 ? 'danger' : 'warning'}>
              Import completed: {result.created} of {result.total} row(s) created
              {result.failed > 0 && `, ${result.failed} failed`}.
            </Alert>
            {result.errors.length > 0 && (
              <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                <Table striped bordered size="sm">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, idx) => (
                      <tr key={idx}>
                        <td>{e.row}</td>
                        <td>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && (
          <Button variant="primary" onClick={handleImport} disabled={!file || importing}>
            {importing ? 'Importing...' : 'Import'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default ImportCsvModal;
