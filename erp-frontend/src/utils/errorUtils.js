/**
 * Extract meaningful error messages from API error responses.
 *
 * @param {Error} err - The error from a catch block (typically an Axios error)
 * @param {string} fallback - Fallback message if nothing useful can be extracted
 * @returns {{ message: string, fieldErrors: Array<{field: string, message: string}> }}
 */
export const extractApiError = (err, fallback = 'An error occurred') => {
  const data = err?.response?.data;

  if (!data) {
    return { message: err?.message || fallback, fieldErrors: [] };
  }

  const fieldErrors = Array.isArray(data.errors) ? data.errors : [];
  const message = data.message || fallback;

  return { message, fieldErrors };
};
