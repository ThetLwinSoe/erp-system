import { Pagination as BsPagination } from 'react-bootstrap';

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const pages = [];
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <BsPagination className="mb-0">
      <BsPagination.First onClick={() => onPageChange(1)} disabled={currentPage === 1} />
      <BsPagination.Prev onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} />

      {startPage > 1 && <BsPagination.Ellipsis disabled />}

      {pages.map((page) => (
        <BsPagination.Item
          key={page}
          active={page === currentPage}
          onClick={() => onPageChange(page)}
        >
          {page}
        </BsPagination.Item>
      ))}

      {endPage < totalPages && <BsPagination.Ellipsis disabled />}

      <BsPagination.Next onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} />
      <BsPagination.Last onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} />
    </BsPagination>
  );
};

export default Pagination;
