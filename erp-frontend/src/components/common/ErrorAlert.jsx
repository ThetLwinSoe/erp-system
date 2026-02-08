import { Alert } from 'react-bootstrap';

const ErrorAlert = ({ error, onClose, dismissible = false }) => {
  if (!error) return null;

  const isString = typeof error === 'string';
  const message = isString ? error : error.message;
  const fieldErrors = isString ? [] : (error.fieldErrors || []);

  return (
    <Alert
      variant="danger"
      dismissible={dismissible || !!onClose}
      onClose={onClose}
    >
      {fieldErrors.length > 0 ? (
        fieldErrors.length === 1 ? (
          fieldErrors[0].message
        ) : (
          <ul className="mb-0 ps-3">
            {fieldErrors.map((fe, idx) => (
              <li key={idx}>{fe.message}</li>
            ))}
          </ul>
        )
      ) : (
        message
      )}
    </Alert>
  );
};

export default ErrorAlert;
