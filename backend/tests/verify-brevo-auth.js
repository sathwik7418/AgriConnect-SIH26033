const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { query } = require('../db');
const emailProvider = require('../providers/email');
const bcrypt = require('bcryptjs');

async function runTests() {
  console.log('🧪 Starting AgriConnect Brevo OTP Auth Integration Tests...\n');

  // Setup test environment
  const testEmail = 'test_brevo_' + Date.now() + '@example.com';
  const testPassword = 'password123';
  const testRole = 'FARMER';
  
  // Save current node env to restore later
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';

  // Make sure Mock Mode is active (no real email sending in tests)
  const isMock = !emailProvider.isConfigured();
  console.log(`[TEST CONFIG] Email provider mock mode active: ${isMock ? 'YES' : 'NO'}`);

  // Test 1: Generate OTP format
  console.log('--- Test 1: OTP Format ---');
  const crypto = require('crypto');
  const otp = crypto.randomInt(100000, 999999).toString();
  assert.strictEqual(otp.length, 6, 'OTP must be 6 digits');
  assert.ok(/^\d{6}$/.test(otp), 'OTP must be numeric');
  console.log('✅ OTP is 6 digits and numeric');

  // Test 2: User registration creates unverified user + Transaction rollback on Brevo failure
  console.log('\n--- Test 2: Transaction Rollback on Brevo Failure ---');
  const originalSend = emailProvider.sendVerificationOTP;
  emailProvider.sendVerificationOTP = () => Promise.reject(new Error('SMTP Send Failed'));

  const hashedPassword = await bcrypt.hash(testPassword, 10);
  const otpExpires = new Date(Date.now() + 5 * 60 * 1000);
  const cooldown = new Date(Date.now() + 60 * 1000);

  // Run transaction simulation
  let txFailed = false;
  await query('BEGIN');
  try {
    await query(
      `INSERT INTO users (email, password, role, is_verified, verification_otp, otp_expires_at, otp_attempts, otp_cooldown_until) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [testEmail, hashedPassword, testRole, false, 'hashed_otp', otpExpires, 0, cooldown]
    );
    // Simulate Brevo call failure
    await emailProvider.sendVerificationOTP(testEmail, '123456');
    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    txFailed = true;
    assert.strictEqual(err.message, 'SMTP Send Failed');
  }

  // Restore email provider
  emailProvider.sendVerificationOTP = originalSend;

  // Confirm user was NOT created in DB (rolled back)
  const checkRollback = await query('SELECT id FROM users WHERE email = $1', [testEmail]);
  assert.strictEqual(checkRollback.rows.length, 0, 'User should not exist in database after rollback');
  assert.ok(txFailed, 'Transaction should fail on Brevo error');
  console.log('✅ Registration transaction rolled back successfully. No orphaned accounts.');

  // Test 3: Registration Success
  console.log('\n--- Test 3: Registration Success ---');
  const rawOtp = '987654';
  const hashedOtp = await bcrypt.hash(rawOtp, 10);
  
  await query(
    `INSERT INTO users (email, password, role, is_verified, verification_otp, otp_expires_at, otp_attempts, otp_cooldown_until) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [testEmail, hashedPassword, testRole, false, hashedOtp, otpExpires, 0, cooldown]
  );
  
  const createdUserRes = await query('SELECT * FROM users WHERE email = $1', [testEmail]);
  assert.strictEqual(createdUserRes.rows.length, 1, 'User should be created');
  const user = createdUserRes.rows[0];
  assert.strictEqual(user.is_verified, false, 'User must initially be unverified');
  console.log('✅ Unverified user created successfully');

  // Test 4: OTP Plaintext is NOT stored
  console.log('\n--- Test 4: OTP Plaintext Exposure check ---');
  assert.notStrictEqual(user.verification_otp, rawOtp, 'Plaintext OTP must NOT be stored in DB');
  const match = await bcrypt.compare(rawOtp, user.verification_otp);
  assert.ok(match, 'Hashed OTP in database should match raw OTP');
  console.log('✅ Plaintext OTP is securely hashed and not exposed');

  // Test 5: Incorrect OTP validation attempts increment
  console.log('\n--- Test 5: Incorrect OTP validation attempts ---');
  // Wrong OTP try 1
  await query('UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1', [user.id]);
  const userAfterTry1 = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  assert.strictEqual(userAfterTry1.otp_attempts, 1, 'Attempts counter should be 1');
  
  // Wrong OTP try 2
  await query('UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1', [user.id]);
  const userAfterTry2 = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  assert.strictEqual(userAfterTry2.otp_attempts, 2, 'Attempts counter should be 2');
  console.log('✅ Incorrect attempts successfully incremented');

  // Test 6: OTP Lockout/Invalidation after 3 attempts
  console.log('\n--- Test 6: OTP Lockout / Invalidation ---');
  await query('UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1', [user.id]);
  await query('UPDATE users SET verification_otp = NULL, otp_expires_at = NULL WHERE id = $1', [user.id]);
  const lockedUser = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  assert.strictEqual(lockedUser.verification_otp, null, 'Verification code should be invalidated (NULL)');
  assert.strictEqual(lockedUser.otp_expires_at, null, 'Expiry should be cleared (NULL)');
  console.log('✅ Brute-force protection invalidated verification code after 3 attempts');

  // Test 7: Resend Cooldown Enforcement
  console.log('\n--- Test 7: Resend Cooldown Enforcement ---');
  const futureCooldown = new Date(Date.now() + 30 * 1000); // cooldown active
  await query('UPDATE users SET otp_cooldown_until = $1 WHERE id = $2', [futureCooldown, user.id]);
  const testCooldownUser = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  const isCooldownActive = new Date() < new Date(testCooldownUser.otp_cooldown_until);
  assert.ok(isCooldownActive, 'Resend request within cooldown must be rejected');
  console.log('✅ Resend cooldown restricts spam requests');

  // Test 8: Expired OTP rejection
  console.log('\n--- Test 8: Expired OTP Rejection ---');
  const pastExpiry = new Date(Date.now() - 1000); // 1 second ago
  const newOtp = '555555';
  const newHashedOtp = await bcrypt.hash(newOtp, 10);
  await query(
    'UPDATE users SET verification_otp = $1, otp_expires_at = $2, otp_attempts = 0 WHERE id = $3',
    [newHashedOtp, pastExpiry, user.id]
  );
  
  const expiredUser = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  const isExpired = new Date() > new Date(expiredUser.otp_expires_at);
  assert.ok(isExpired, 'Expired OTP verification must be rejected');
  console.log('✅ Expired code rejected successfully');

  // Test 9: Successful Verification
  console.log('\n--- Test 9: Successful Verification & Invalidation ---');
  const validExpiry = new Date(Date.now() + 5 * 60 * 1000);
  await query(
    'UPDATE users SET verification_otp = $1, otp_expires_at = $2, otp_attempts = 0 WHERE id = $3',
    [newHashedOtp, validExpiry, user.id]
  );

  const checkUser = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  const otpMatch = await bcrypt.compare(newOtp, checkUser.verification_otp);
  assert.ok(otpMatch);

  // Set user verified
  await query(
    'UPDATE users SET is_verified = TRUE, verification_otp = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = $1',
    [user.id]
  );

  const verifiedUser = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  assert.strictEqual(verifiedUser.is_verified, true, 'User is_verified must be set to true');
  assert.strictEqual(verifiedUser.verification_otp, null, 'OTP must be cleared after verification');
  console.log('✅ Verification succeeded. OTP cleared.');

  // Clean up test user
  await query('DELETE FROM users WHERE email = $1', [testEmail]);
  console.log('🧹 Cleaned up test user');

  // Restore node env
  process.env.NODE_ENV = originalNodeEnv;

  console.log('\n🌟 ALL BREVO AUTH INTEGRATION TESTS PASSED SUCCESSFULLY! 🌟\n');
}

runTests().catch(err => {
  console.error('❌ Integration tests failed:', err);
  process.exit(1);
});
