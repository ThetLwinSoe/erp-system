import { Form, InputGroup } from 'react-bootstrap';
import { FaSearch } from 'react-icons/fa';

const SearchBar = ({ value, onChange, placeholder = 'Search...' }) => {
  return (
    <InputGroup style={{ maxWidth: '300px' }}>
      <InputGroup.Text>
        <FaSearch />
      </InputGroup.Text>
      <Form.Control
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </InputGroup>
  );
};

export default SearchBar;
