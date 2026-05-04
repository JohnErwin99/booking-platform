const express = require('express');
const multer = require('multer');
const db = require('../../config/database');
const { formatPrice, formatDate, formatTimeLabel } = require('../../utils/helpers');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /admin/customers
router.get('/customers', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { search, page } = req.query;
    const perPage = 25;
    const currentPage = parseInt(page) || 1;

    let query = db('customers').where('tenant_id', tenantId);

    if (search) {
      query = query.where(function () {
        this.where('first_name', 'like', `%${search}%`)
          .orWhere('last_name', 'like', `%${search}%`)
          .orWhere('email', 'like', `%${search}%`)
          .orWhere('phone', 'like', `%${search}%`);
      });
    }

    const [{ count: total }] = await query.clone().count('id as count');
    const customers = await query
      .orderBy('last_visit_date', 'desc')
      .limit(perPage)
      .offset((currentPage - 1) * perPage);

    res.render('admin/customers/index', {
      title: 'Customers',
      user: req.user,
      tenant: req.tenant,
      customers,
      search: search || '',
      pagination: {
        current: currentPage,
        total: Math.ceil(total / perPage),
        count: total
      },
      helpers: { formatPrice, formatDate },
      flash: {
        error: req.flash('error'),
        success: req.flash('success')
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/customers/export - CSV export
router.get('/customers/export', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const customers = await db('customers')
      .where('tenant_id', tenantId)
      .select('first_name', 'last_name', 'email', 'phone')
      .orderBy('last_name')
      .orderBy('first_name');

    const header = 'First Name,Last Name,Email,Phone';
    const rows = customers.map(c => {
      const escape = (v) => '"' + (v || '').replace(/"/g, '""') + '"';
      return [escape(c.first_name), escape(c.last_name), escape(c.email), escape(c.phone)].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// POST /admin/customers/import - CSV import
router.post('/customers/import', upload.single('csv'), async (req, res, next) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please select a CSV file.');
      return res.redirect('/admin/customers');
    }

    const tenantId = req.user.tenant_id;
    const content = req.file.buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());

    if (lines.length < 2) {
      req.flash('error', 'CSV file is empty or has no data rows.');
      return res.redirect('/admin/customers');
    }

    // Parse header to find column indices
    const header = parseCSVRow(lines[0]).map(h => h.toLowerCase().trim());
    const fnIdx = header.findIndex(h => h.includes('first'));
    const lnIdx = header.findIndex(h => h.includes('last'));
    const emIdx = header.findIndex(h => h.includes('email'));
    const phIdx = header.findIndex(h => h.includes('phone'));

    if (emIdx === -1) {
      req.flash('error', 'CSV must have an "Email" column.');
      return res.redirect('/admin/customers');
    }

    let imported = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVRow(lines[i]);
      const email = (cols[emIdx] || '').trim();
      if (!email) { skipped++; continue; }

      const firstName = fnIdx >= 0 ? (cols[fnIdx] || '').trim() : '';
      const lastName = lnIdx >= 0 ? (cols[lnIdx] || '').trim() : '';
      const phone = phIdx >= 0 ? (cols[phIdx] || '').trim() : '';

      // Upsert: skip if email already exists for this tenant
      const existing = await db('customers')
        .where({ tenant_id: tenantId, email })
        .first();

      if (existing) {
        skipped++;
      } else {
        await db('customers').insert({
          tenant_id: tenantId,
          first_name: firstName || 'Unknown',
          last_name: lastName || '',
          email,
          phone: phone || null,
        });
        imported++;
      }
    }

    req.flash('success', `Imported ${imported} customer${imported !== 1 ? 's' : ''}. ${skipped} skipped (duplicate or empty).`);
    res.redirect('/admin/customers');
  } catch (err) {
    next(err);
  }
});

// Simple CSV row parser (handles quoted fields with commas)
function parseCSVRow(row) {
  const cols = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cols.push(current); current = ''; }
      else { current += ch; }
    }
  }
  cols.push(current);
  return cols;
}

// GET /admin/customers/:id
router.get('/customers/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const customer = await db('customers')
      .where({ id: req.params.id, tenant_id: tenantId }).first();

    if (!customer) {
      req.flash('error', 'Customer not found.');
      return res.redirect('/admin/customers');
    }

    const [bookings, notes] = await Promise.all([
      db('bookings')
        .where({ customer_id: customer.id, tenant_id: tenantId })
        .orderBy('booking_date', 'desc')
        .orderBy('start_time', 'desc')
        .limit(50),
      db('customer_notes')
        .leftJoin('staff', 'customer_notes.staff_id', 'staff.id')
        .select('customer_notes.*', 'staff.first_name as staff_first', 'staff.last_name as staff_last')
        .where('customer_notes.customer_id', customer.id)
        .where('customer_notes.tenant_id', tenantId)
        .orderBy('customer_notes.created_at', 'desc')
    ]);

    res.render('admin/customers/detail', {
      title: `${customer.first_name} ${customer.last_name}`,
      user: req.user,
      tenant: req.tenant,
      customer,
      bookings,
      notes,
      helpers: { formatPrice, formatDate, formatTimeLabel },
      flash: {
        error: req.flash('error'),
        success: req.flash('success')
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/customers/:id/notes
router.post('/customers/:id/notes', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { note } = req.body;

    await db('customer_notes').insert({
      tenant_id: tenantId,
      customer_id: parseInt(req.params.id),
      staff_id: req.user.staff_id || null,
      note
    });

    req.flash('success', 'Note added.');
    res.redirect(`/admin/customers/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
