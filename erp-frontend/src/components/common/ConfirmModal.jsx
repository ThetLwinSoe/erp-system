import { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import ErrorAlert from './ErrorAlert';
import PasswordInput from './PasswordInput';

const ConfirmModal = ({
  show,
  onHide,
  onConfirm,
  title,
  message,
  confirmText = 'Delete',
  variant = 'danger',
  error,
  requirePassword = false,
  confirmDisabled = false,
}) => {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (show) {
      // Intentional reset of the password field whenever the modal opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassword('');
    }
  }, [show]);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ErrorAlert error={error} />
        {message}
        {requirePassword && (
          <Form.Group className="mt-3">
            <Form.Label>Enter your password to confirm</Form.Label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </Form.Group>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant={variant}
          onClick={() => onConfirm(password)}
          disabled={confirmDisabled || (requirePassword && !password)}
        >
          {confirmText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ConfirmModal;
