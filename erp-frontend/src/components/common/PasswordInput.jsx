import { useState } from 'react';
import { InputGroup, Form, Button } from 'react-bootstrap';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

/**
 * Drop-in replacement for <Form.Control type="password" ... /> with a
 * show/hide toggle, so users can check what they typed before submitting.
 *
 * Defaults autoComplete to "new-password" - these fields are almost always
 * "set/confirm a password" rather than "log in", and without this the
 * browser can treat an auto-focused password field as a login field and
 * autofill a saved credential into it *and* into the nearest unrelated text
 * input on the page (e.g. a list search box). Pass autoComplete explicitly
 * (e.g. "current-password" on an actual login form) to override.
 */
const PasswordInput = (props) => {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup>
      <Form.Control type={visible ? 'text' : 'password'} autoComplete="new-password" {...props} />
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
