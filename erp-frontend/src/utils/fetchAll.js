/**
 * Fetches every page of a paginated list endpoint and returns the combined
 * results as a single array - for dropdown/picker use cases that need the
 * complete list, not just one page. The backend caps `limit` at 100 per
 * request (see src/middleware/validate.js), so a single request can't be
 * relied on to return everything once a company has more than 100 rows.
 *
 * @param {(params: object) => Promise} apiFn - an api.js `getAll`-style function
 * @param {object} [params] - extra query params (e.g. { type: 'customer' })
 * @returns {Promise<Array>}
 */
export const fetchAllPages = async (apiFn, params = {}) => {
  const firstResponse = await apiFn({ ...params, page: 1, limit: 100 });
  let allRows = firstResponse.data.data || [];
  const totalPages = firstResponse.data.pagination?.totalPages || 1;

  for (let page = 2; page <= totalPages; page++) {
    const response = await apiFn({ ...params, page, limit: 100 });
    allRows = allRows.concat(response.data.data || []);
  }

  return allRows;
};
