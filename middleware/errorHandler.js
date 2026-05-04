function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  const statusCode = err.status || 500;

  // API requests get JSON errors
  if (req.path.startsWith('/api/')) {
    return res.status(statusCode).json({
      error: true,
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : err.message
    });
  }

  // HTML requests get error page
  res.status(statusCode).render('errors/error', {
    layout: false,
    title: `Error ${statusCode}`,
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : err.message,
    status: statusCode,
    user: req.user || null,
    tenant: req.tenant || null
  });
}

module.exports = errorHandler;
