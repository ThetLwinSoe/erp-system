import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';

const SortableHeader = ({ label, field, sortBy, sortOrder, onSort }) => {
  const isActive = sortBy === field;

  return (
    <th
      role="button"
      onClick={() => onSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}{' '}
      {isActive ? (
        sortOrder === 'ASC' ? <FaSortUp /> : <FaSortDown />
      ) : (
        <FaSort className="text-muted" opacity={0.4} />
      )}
    </th>
  );
};

export default SortableHeader;
