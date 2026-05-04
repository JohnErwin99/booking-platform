const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  // Clean existing data (in reverse FK order)
  await knex('notification_log').del();
  await knex('notification_templates').del();
  await knex('intake_responses').del();
  await knex('intake_forms').del();
  await knex('customer_notes').del();
  await knex('booking_payments').del();
  await knex('bookings').del();
  await knex('customers').del();
  await knex('blocked_dates').del();
  await knex('business_hours').del();
  await knex('staff_services').del();
  await knex('services').del();
  await knex('staff').del();
  await knex('calendar_sync').del();
  await knex('users').del();
  await knex('locations').del();
  await knex('tenants').del();

  // =========================================
  // TENANT 1: Demo Barbershop
  // =========================================
  const [tenantId] = await knex('tenants').insert({
    name: "The Gentleman's Cut",
    slug: 'demo',
    email: 'owner@gentlemanscut.com',
    phone: '(555) 123-4567',
    timezone: 'America/New_York',
    currency: 'USD',
    status: 'active',
    primary_color: '#c9a84c',
    secondary_color: '#0a0a0a',
    accent_color: '#f5f0e8',
    font_heading: 'Cormorant Garamond',
    font_body: 'Montserrat',
    cancellation_hours: 24,
    deposit_type: 'none'
  });

  // Location
  const [locationId] = await knex('locations').insert({
    tenant_id: tenantId,
    name: 'Downtown',
    address_line1: '123 Main Street',
    city: 'New York',
    state_province: 'NY',
    postal_code: '10001',
    country: 'US',
    phone: '(555) 123-4567',
    is_default: true
  });

  // Owner user
  const passwordHash = await bcrypt.hash('password123', 12);
  await knex('users').insert({
    tenant_id: tenantId,
    email: 'admin@demo.com',
    password_hash: passwordHash,
    first_name: 'Steve',
    last_name: 'Owner',
    role: 'owner'
  });

  // Staff
  const [staff1Id] = await knex('staff').insert({
    tenant_id: tenantId,
    location_id: locationId,
    first_name: 'Steve',
    last_name: 'Martinez',
    display_name: 'Steve',
    email: 'steve@gentlemanscut.com',
    title: 'Head Barber',
    bio: '15 years experience in classic and modern cuts.',
    commission_rate: 60.00,
    slot_duration: 30,
    buffer_after: 10,
    sort_order: 1
  });

  const [staff2Id] = await knex('staff').insert({
    tenant_id: tenantId,
    location_id: locationId,
    first_name: 'Marcus',
    last_name: 'Johnson',
    display_name: 'Marcus',
    title: 'Senior Barber',
    bio: 'Specializes in fades and beard grooming.',
    commission_rate: 55.00,
    slot_duration: 30,
    buffer_after: 10,
    sort_order: 2
  });

  const [staff3Id] = await knex('staff').insert({
    tenant_id: tenantId,
    location_id: locationId,
    first_name: 'Jake',
    last_name: 'Williams',
    display_name: 'Jake',
    title: 'Barber',
    bio: 'Creative cuts and color specialist.',
    commission_rate: 50.00,
    slot_duration: 30,
    buffer_after: 10,
    sort_order: 3
  });

  // Services
  const [svc1] = await knex('services').insert({ tenant_id: tenantId, category: 'Haircuts', name: 'Classic Haircut', description: 'Traditional scissor or clipper cut, styled to your preference.', duration_minutes: 30, price_cents: 3500, sort_order: 1 });
  const [svc2] = await knex('services').insert({ tenant_id: tenantId, category: 'Haircuts', name: 'Haircut + Beard Trim', description: 'Full haircut with a detailed beard shape-up.', duration_minutes: 45, price_cents: 5000, sort_order: 2 });
  const [svc3] = await knex('services').insert({ tenant_id: tenantId, category: 'Haircuts', name: 'Kids Haircut', description: 'Haircut for children under 12.', duration_minutes: 20, price_cents: 2500, sort_order: 3 });
  const [svc4] = await knex('services').insert({ tenant_id: tenantId, category: 'Grooming', name: 'Beard Trim & Shape', description: 'Detailed beard grooming with hot towel.', duration_minutes: 20, price_cents: 2000, sort_order: 4 });
  const [svc5] = await knex('services').insert({ tenant_id: tenantId, category: 'Grooming', name: 'Hot Towel Shave', description: 'Classic straight razor shave with hot towel treatment.', duration_minutes: 30, price_cents: 3000, sort_order: 5 });
  const [svc6] = await knex('services').insert({ tenant_id: tenantId, category: 'Premium', name: 'The Full Experience', description: 'Haircut, beard trim, hot towel, and scalp massage.', duration_minutes: 60, price_cents: 7500, sort_order: 6 });

  // Staff-Service assignments (all staff do all services)
  const staffIds = [staff1Id, staff2Id, staff3Id];
  const serviceIds = [svc1, svc2, svc3, svc4, svc5, svc6];
  const staffServiceRows = [];
  staffIds.forEach(sid => {
    serviceIds.forEach(svcId => {
      staffServiceRows.push({ tenant_id: tenantId, staff_id: sid, service_id: svcId });
    });
  });
  await knex('staff_services').insert(staffServiceRows);

  // Business Hours (Mon-Sat 10:00-20:00, closed Sunday)
  const hours = [];
  for (let day = 1; day <= 6; day++) {
    hours.push({
      tenant_id: tenantId,
      location_id: locationId,
      staff_id: null,
      weekday: day,
      open_at: '10:00:00',
      close_at: '20:00:00',
      break_start: '14:00:00',
      break_end: '14:30:00'
    });
  }
  await knex('business_hours').insert(hours);

  // A few demo customers
  const [cust1] = await knex('customers').insert({
    tenant_id: tenantId,
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone: '(555) 111-2222',
    total_bookings: 3,
    total_spent_cents: 12500,
    last_visit_date: '2026-04-28'
  });

  const [cust2] = await knex('customers').insert({
    tenant_id: tenantId,
    first_name: 'Mike',
    last_name: 'Smith',
    email: 'mike@example.com',
    phone: '(555) 333-4444',
    total_bookings: 1,
    total_spent_cents: 5000,
    preferences: 'Prefers skin fade',
    last_visit_date: '2026-04-25'
  });

  // Notification templates
  await knex('notification_templates').insert([
    {
      tenant_id: tenantId,
      type: 'booking_confirmation',
      channel: 'email',
      subject: 'Booking Confirmed - {{business_name}}',
      body_template: 'Hi {{customer_name}},\n\nYour appointment has been confirmed!\n\nService: {{service_name}}\nDate: {{booking_date}}\nTime: {{booking_time}}\nWith: {{staff_name}}\n\nIf you need to make changes: {{manage_link}}\n\nSee you soon!\n{{business_name}}'
    },
    {
      tenant_id: tenantId,
      type: 'reminder_email',
      channel: 'email',
      subject: 'Reminder: Appointment Tomorrow - {{business_name}}',
      body_template: 'Hi {{customer_name}},\n\nJust a reminder about your appointment tomorrow.\n\nService: {{service_name}}\nTime: {{booking_time}}\nWith: {{staff_name}}\n\nNeed to reschedule? {{manage_link}}\n\n{{business_name}}'
    },
    {
      tenant_id: tenantId,
      type: 'booking_cancellation',
      channel: 'email',
      subject: 'Booking Cancelled - {{business_name}}',
      body_template: 'Hi {{customer_name}},\n\nYour appointment on {{booking_date}} at {{booking_time}} has been cancelled.\n\nBook again: {{booking_link}}\n\n{{business_name}}'
    }
  ]);

  // =========================================
  // TENANT 2: Demo Salon (to show multi-tenancy)
  // =========================================
  const [tenant2Id] = await knex('tenants').insert({
    name: 'Bella Salon',
    slug: 'bella-salon',
    email: 'owner@bellasalon.com',
    timezone: 'America/Los_Angeles',
    currency: 'USD',
    status: 'active',
    primary_color: '#e91e8c',
    secondary_color: '#2d2d2d',
    accent_color: '#fdf0f5',
    font_heading: 'Playfair Display',
    font_body: 'Raleway'
  });

  const [loc2] = await knex('locations').insert({
    tenant_id: tenant2Id,
    name: 'Main Salon',
    address_line1: '456 Style Ave',
    city: 'Los Angeles',
    state_province: 'CA',
    is_default: true
  });

  const passwordHash2 = await bcrypt.hash('password123', 12);
  await knex('users').insert({
    tenant_id: tenant2Id,
    email: 'admin@bella.com',
    password_hash: passwordHash2,
    first_name: 'Isabella',
    last_name: 'Rosa',
    role: 'owner'
  });

  const [salonStaff1] = await knex('staff').insert({
    tenant_id: tenant2Id,
    location_id: loc2,
    first_name: 'Isabella',
    last_name: 'Rosa',
    display_name: 'Isabella',
    title: 'Lead Stylist',
    slot_duration: 30,
    buffer_after: 15
  });

  const [salonSvc1] = await knex('services').insert({ tenant_id: tenant2Id, category: 'Hair', name: 'Blowout', duration_minutes: 45, price_cents: 5500, sort_order: 1 });
  const [salonSvc2] = await knex('services').insert({ tenant_id: tenant2Id, category: 'Hair', name: 'Cut & Color', duration_minutes: 120, price_cents: 15000, sort_order: 2 });
  const [salonSvc3] = await knex('services').insert({ tenant_id: tenant2Id, category: 'Nails', name: 'Manicure', duration_minutes: 30, price_cents: 3500, sort_order: 3 });

  await knex('staff_services').insert([
    { tenant_id: tenant2Id, staff_id: salonStaff1, service_id: salonSvc1 },
    { tenant_id: tenant2Id, staff_id: salonStaff1, service_id: salonSvc2 },
    { tenant_id: tenant2Id, staff_id: salonStaff1, service_id: salonSvc3 }
  ]);

  // Business hours for salon (Tue-Sat 9-18)
  const salonHours = [];
  for (let day = 2; day <= 6; day++) {
    salonHours.push({
      tenant_id: tenant2Id,
      location_id: loc2,
      staff_id: null,
      weekday: day,
      open_at: '09:00:00',
      close_at: '18:00:00'
    });
  }
  await knex('business_hours').insert(salonHours);

  console.log('Seed complete!');
  console.log('Demo barbershop: /book/demo (admin: admin@demo.com / password123)');
  console.log('Demo salon:      /book/bella-salon (admin: admin@bella.com / password123)');
};
