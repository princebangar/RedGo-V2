import '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { FoodAdmin } from '../src/core/admin/admin.model.js';

const [, , emailArg, passwordArg] = process.argv;

const email = String(emailArg || '').trim().toLowerCase();
const password = String(passwordArg || '');

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password>');
  process.exit(1);
}

try {
  await connectDB();

  const existingAdmin = await FoodAdmin.findOne({ email });

  if (existingAdmin) {
    existingAdmin.password = password;
    existingAdmin.isActive = true;
    await existingAdmin.save();
    console.log(`Updated existing admin: ${email}`);
  } else {
    await FoodAdmin.create({
      email,
      password,
      role: 'ADMIN',
      isActive: true,
      servicesAccess: ['food'],
    });
    console.log(`Created new admin: ${email}`);
  }
} catch (error) {
  console.error('Failed to create admin:', error?.message || error);
  process.exitCode = 1;
} finally {
  await disconnectDB().catch(() => {});
}
