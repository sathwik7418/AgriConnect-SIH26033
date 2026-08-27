const assert = require('assert');

const BASE_URL = 'http://localhost:5001/api';

async function runE2ETests() {
  console.log('🏁 Starting Real-World API E2E Audit against running server (port 5001)...\n');

  const testEmail = 'e2e_brevo_test_' + Math.floor(Math.random() * 1000000) + '@gmail.com';
  const testPassword = 'Password@123';
  const testRole = 'FARMER';

  // ----------------------------------------------------
  // Test A: Register with invalid email
  // ----------------------------------------------------
  console.log('--- Test A: Register with invalid email ---');
  const regInvalidRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'invalid-email', password: testPassword, role: testRole })
  });
  const regInvalidBody = await regInvalidRes.json();
  assert.strictEqual(regInvalidRes.status, 400);
  assert.strictEqual(regInvalidBody.error, 'Invalid email format');
  console.log('✅ Invalid email registration blocked correctly.');

  // ----------------------------------------------------
  // Test B: Register with duplicate email
  // ----------------------------------------------------
  console.log('\n--- Test B: Register with duplicate email ---');
  const regDupRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ramesh@farmer.com', password: testPassword, role: testRole })
  });
  const regDupBody = await regDupRes.json();
  assert.strictEqual(regDupRes.status, 400);
  assert.strictEqual(regDupBody.error, 'User already exists');
  console.log('✅ Duplicate email registration blocked correctly.');

  // ----------------------------------------------------
  // Test C: Valid registration
  // ----------------------------------------------------
  console.log('\n--- Test C: Valid registration ---');
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword, role: testRole })
  });
  const regBody = await regRes.json();
  assert.strictEqual(regRes.status, 201);
  assert.strictEqual(regBody.requiresVerification, true);
  assert.ok(regBody.devOtp, 'Development OTP should be returned in non-prod environment');
  const firstOtp = regBody.devOtp;
  console.log(`✅ Registered successfully. Dev OTP: ${firstOtp}`);

  // ----------------------------------------------------
  // Test D: Login with unverified account
  // ----------------------------------------------------
  console.log('\n--- Test D: Login with unverified account ---');
  const loginUnvRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });
  const loginUnvBody = await loginUnvRes.json();
  assert.strictEqual(loginUnvRes.status, 403);
  assert.strictEqual(loginUnvBody.requiresVerification, true);
  assert.strictEqual(loginUnvBody.email.toLowerCase(), testEmail.toLowerCase());
  console.log('✅ Unverified login blocked and redirected to verification info.');

  // ----------------------------------------------------
  // Test E: Verify with wrong OTP
  // ----------------------------------------------------
  console.log('\n--- Test E: Verify with wrong OTP (Attempt 1) ---');
  const verifyWrongRes = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: '000000' })
  });
  const verifyWrongBody = await verifyWrongRes.json();
  assert.strictEqual(verifyWrongRes.status, 400);
  assert.ok(verifyWrongBody.error.includes('Invalid verification code'));
  console.log(`✅ Wrong OTP rejected. Message: ${verifyWrongBody.error}`);

  // ----------------------------------------------------
  // Test F: Resend countdown/cooldown enforcement
  // ----------------------------------------------------
  console.log('\n--- Test F: Resend cooldown enforcement ---');
  const resendCooldownRes = await fetch(`${BASE_URL}/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  const resendCooldownBody = await resendCooldownRes.json();
  console.log('DEBUG: resendCooldownBody =', resendCooldownBody);
  assert.strictEqual(resendCooldownRes.status, 429);
  assert.ok(resendCooldownBody.error && (resendCooldownBody.error.includes('Please wait') || resendCooldownBody.error.includes('Too many verification')));
  console.log(`✅ Cooldown active. Message: ${resendCooldownBody.error}`);

  // ----------------------------------------------------
  // Test G: Brute-force lockout (Attempt 2 & 3)
  // ----------------------------------------------------
  console.log('\n--- Test G: Lockout after 3 incorrect attempts ---');
  // Attempt 2
  const verifyWrongRes2 = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: '000000' })
  });
  assert.strictEqual(verifyWrongRes2.status, 400);
  
  // Attempt 3
  const verifyWrongRes3 = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: '000000' })
  });
  const verifyWrongBody3 = await verifyWrongRes3.json();
  assert.strictEqual(verifyWrongRes3.status, 400);
  assert.ok(verifyWrongBody3.error.includes('Too many incorrect attempts'));
  console.log(`✅ Lockout triggered successfully on attempt 3. Message: ${verifyWrongBody3.error}`);

  // ----------------------------------------------------
  // Test H: Verifying after lockout fails
  // ----------------------------------------------------
  console.log('\n--- Test H: Verification with correct OTP after lockout ---');
  const verifyPostLockoutRes = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: firstOtp })
  });
  const verifyPostLockoutBody = await verifyPostLockoutRes.json();
  assert.strictEqual(verifyPostLockoutRes.status, 400);
  assert.ok(verifyPostLockoutBody.error.includes('Too many incorrect attempts') || verifyPostLockoutBody.error.includes('No active verification code'));
  console.log('✅ Correct code is blocked after brute-force lockout.');

  // ----------------------------------------------------
  // Test I: Wait for resend cooldown and request new OTP
  // ----------------------------------------------------
  console.log('\n--- Test I: Requesting new code after cooldown ---');
  console.log('Waiting 65 seconds for resend cooldown to expire...');
  await new Promise(resolve => setTimeout(resolve, 65000));
  
  const resendRes = await fetch(`${BASE_URL}/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  const resendBody = await resendRes.json();
  assert.strictEqual(resendRes.status, 200);
  assert.ok(resendBody.devOtp);
  const secondOtp = resendBody.devOtp;
  console.log(`✅ New OTP generated successfully: ${secondOtp}`);

  // ----------------------------------------------------
  // Test J: Successful verification
  // ----------------------------------------------------
  console.log('\n--- Test J: Verification with new code ---');
  const verifyRes = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: secondOtp })
  });
  const verifyBody = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200);
  assert.strictEqual(verifyBody.success, true);
  assert.ok(verifyBody.token, 'Should return session token');
  console.log('✅ Verification succeeded.');

  // ----------------------------------------------------
  // Test K: Login after verification
  // ----------------------------------------------------
  console.log('\n--- Test K: Login after verification ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });
  const loginBody = await loginRes.json();
  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginBody.token, 'Should return token');
  assert.strictEqual(loginBody.user.is_verified, true);
  console.log('✅ Login succeeded after verification.');

  // ----------------------------------------------------
  // Test L: Login with wrong password
  // ----------------------------------------------------
  console.log('\n--- Test L: Login with wrong password ---');
  const loginWrongRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'wrongpassword' })
  });
  assert.strictEqual(loginWrongRes.status, 401);
  console.log('✅ Login with wrong password blocked correctly.');

  // ----------------------------------------------------
  // Test M: Rate Limiting validation
  // ----------------------------------------------------
  console.log('\n--- Test M: Rate Limiting Test ---');
  console.log('Flooding verify endpoint to trigger rate limits...');
  let rateLimitHit = false;
  for (let i = 0; i < 40; i++) {
    const floodRes = await fetch(`${BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, otp: '111111' })
    });
    if (floodRes.status === 429) {
      rateLimitHit = true;
      const floodBody = await floodRes.json();
      console.log(`✅ Rate limit triggered successfully on request ${i + 1}. Message: ${floodBody.error}`);
      break;
    }
  }
  assert.ok(rateLimitHit, 'Rate limit should be triggered after flooding');

  console.log('\n🎉 ALL E2E API AUDIT TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runE2ETests().catch(err => {
  console.error('❌ E2E Audit Tests failed:', err);
  process.exit(1);
});
