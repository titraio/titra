// Utility function for slug sanitization
function sanitizeSlug (input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .toLowerCase()
    .trim()
    // Replace spaces with dashes
    .replace(/\s+/g, '-')
    // Remove special characters but KEEP letters, numbers, AND DASHES
    .replace(/[^a-z0-9\-]/g, '')  // This keeps dashes!
    // Replace multiple dashes with single dash
    .replace(/-+/g, '-')
    // Remove dashes from start and end
    .replace(/^-/g, '')
    // Limit length
    .substring(0, 100);
};

export {sanitizeSlug}
