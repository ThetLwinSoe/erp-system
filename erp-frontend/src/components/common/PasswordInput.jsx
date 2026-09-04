import { useState } from 'react';
import { InputGroup, Form, Button } from 'react-bootstrap';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

/**
 * Drop-in replacement for <Form.Control type="password" ... /> with a
 * show/hide toggle, so users can check what they typed before submitting.
 */
const PasswordInput = (props) => {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup>
      <Form.Control type={visible ? 'text' : 'password'} {...props} />
      <Button
        variant="outline-secondary"
        type="button"
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <FaEyeSlash /> : <FaEye />}
      </Button>
    </InputGroup>
  );
};

export default PasswordInput;
