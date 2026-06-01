const express = require('express');
const router = express.Router();

router.get('/menu', (req, res) => {
  res.render('admin/menu', {
    title: 'Menu',
    user: req.user,
    tenant: req.tenant
  });
});

module.exports = router;
