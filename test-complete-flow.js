// Comprehensive end-to-end test for signup → login → onboarding flow
// This simulates the exact frontend behavior to find any issues

const BASE_URL = 'http://127.0.0.1:5000';

// Simulate a user's browser localStorage
class FakeBrowser {
  constructor() {
    this.localStorage = {};
    this.cookies = {};
  }
  
  setItem(key, value) {
    this.localStorage[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  
  getItem(key) {
    return this.localStorage[key] || null;
  }
  
  removeItem(key) {
    delete this.localStorage[key];
  }
  
  clear() {
    this.localStorage = {};
  }
  
  setCookie(name, value) {
    this.cookies[name] = value;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCompleteFlow() {
  const browser = new FakeBrowser();
  
  const testUser = {
    name: 'Admin1',
    email: 'admin@gmail.com',
    password: 'Admin@123'
  };

  try {
    console.log('='.repeat(80));
    console.log('END-TO-END TEST: SIGNUP → LOGIN → ONBOARDING');
    console.log('='.repeat(80));
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 1: SIGNUP
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n[STEP 1] USER SIGNUP');
    console.log('─'.repeat(80));
    console.log('User clicks "Sign up" and fills in form:');
    console.log(`  Name: ${testUser.name}`);
    console.log(`  Email: ${testUser.email}`);
    console.log(`  Password: ${testUser.password}`);
    console.log('User clicks "Sign up" button\n');
    
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testUser.name,
        email: testUser.email,
        password: testUser.password,
        confirmPassword: testUser.password
      })
    });
    
    const signupData = await signupRes.json();
    
    if (!signupData.ok) {
      console.error('❌ SIGNUP FAILED:', signupData.error);
      return;
    }
    
    console.log('✅ Signup successful');
    console.log(`Backend response includes:`);
    console.log(`  - token: ${signupData.data.token.substring(0, 50)}...`);
    console.log(`  - user.id: ${signupData.data.user.id}`);
    console.log(`  - profile.onboarded: ${signupData.data.profile.onboarded}`);
    
    // Frontend: Simulate login() in AuthContext
    browser.setItem('token', signupData.data.token);
    browser.setItem('user', JSON.stringify(signupData.data.user));
    browser.setItem('profile', JSON.stringify(signupData.data.profile));
    
    console.log(`\nFrontend AuthContext.login() stores:`);
    console.log(`  - localStorage.token: ${signupData.data.token.substring(0, 50)}...`);
    console.log(`  - localStorage.profile.onboarded: ${signupData.data.profile.onboarded}`);
    
    // Frontend: Check decision
    const afterSignup = JSON.parse(browser.getItem('profile'));
    const nextPageAfterSignup = afterSignup.onboarded ? '/app' : '/onboarding';
    console.log(`\nFrontend decision: Navigate to "${nextPageAfterSignup}"`);
    console.log(`✅ EXPECTED: /onboarding (because onboarded=false)`);
    
    if (nextPageAfterSignup !== '/onboarding') {
      console.error('❌ ERROR: Should navigate to /onboarding but got:', nextPageAfterSignup);
      return;
    }
    
    console.log('✅ CORRECT');
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 2: ONBOARDING PAGE
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n[STEP 2] USER COMPLETES ONBOARDING');
    console.log('─'.repeat(80));
    console.log('User is on /onboarding page');
    console.log('User fills in:');
    console.log('  College: Test University');
    console.log('  Branch: CSE');
    console.log('  Graduation Year: 2025');
    console.log('  Career Goal: Software Engineer');
    console.log('User clicks "Finish setup"\n');
    
    const onboardRes = await fetch(`${BASE_URL}/api/profile/me`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${browser.getItem('token')}`
      },
      body: JSON.stringify({
        college: 'Test University',
        branch: 'CSE',
        graduationYear: '2025',
        careerGoal: 'Software Engineer',
        onboarded: true
      })
    });
    
    const onboardData = await onboardRes.json();
    
    if (!onboardData.ok) {
      console.error('❌ ONBOARDING UPDATE FAILED:', onboardData.error);
      return;
    }
    
    console.log('✅ Profile update successful');
    console.log(`Backend returns:`);
    console.log(`  - profile.onboarded: ${onboardData.data.profile.onboarded}`);
    console.log(`  - profile.college: ${onboardData.data.profile.college}`);
    
    // Frontend: Simulate updateProfile() in AuthContext
    browser.setItem('profile', JSON.stringify(onboardData.data.profile));
    
    console.log(`\nFrontend AuthContext.updateProfile() stores:`);
    console.log(`  - localStorage.profile.onboarded: ${onboardData.data.profile.onboarded}`);
    
    const afterOnboarding = JSON.parse(browser.getItem('profile'));
    const nextPageAfterOnboarding = afterOnboarding.onboarded ? '/app' : '/onboarding';
    console.log(`\nFrontend decision: Navigate to "${nextPageAfterOnboarding}"`);
    console.log(`✅ EXPECTED: /app (because onboarded=true)`);
    
    if (nextPageAfterOnboarding !== '/app') {
      console.error('❌ ERROR: Should navigate to /app but got:', nextPageAfterOnboarding);
      return;
    }
    
    console.log('✅ CORRECT');
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 3: USER IN APP
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n[STEP 3] USER IN APP DASHBOARD');
    console.log('─'.repeat(80));
    console.log('User is now on /app dashboard');
    console.log('Everything works! ✅\n');
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 4: USER LOGS OUT
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[STEP 4] USER LOGS OUT');
    console.log('─'.repeat(80));
    console.log('User clicks logout\n');
    
    browser.clear();
    
    console.log('Frontend AuthContext.logout() clears localStorage');
    console.log(`✅ LOGOUT SUCCESSFUL\n`);
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 5: USER LOGS BACK IN
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[STEP 5] USER LOGS BACK IN');
    console.log('─'.repeat(80));
    console.log('User is on /student/login page');
    console.log('User enters:');
    console.log(`  Email: ${testUser.email}`);
    console.log(`  Password: ${testUser.password}`);
    console.log('User clicks "Sign in"\n');
    
    await sleep(500);
    
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });
    
    const loginData = await loginRes.json();
    
    if (!loginData.ok) {
      console.error('❌ LOGIN FAILED:', loginData.error);
      return;
    }
    
    console.log('✅ Login successful');
    console.log(`Backend response includes:`);
    console.log(`  - token: ${loginData.data.token.substring(0, 50)}...`);
    console.log(`  - profile.onboarded: ${loginData.data.profile.onboarded}`);
    console.log(`  - profile.college: ${loginData.data.profile.college}`);
    
    // Frontend: Simulate login() in AuthContext
    browser.setItem('token', loginData.data.token);
    browser.setItem('user', JSON.stringify(loginData.data.user));
    browser.setItem('profile', JSON.stringify(loginData.data.profile));
    
    console.log(`\nFrontend AuthContext.login() stores:`);
    console.log(`  - localStorage.profile.onboarded: ${loginData.data.profile.onboarded}`);
    
    // Frontend: Check decision
    const afterLogin = JSON.parse(browser.getItem('profile'));
    const nextPageAfterLogin = afterLogin.onboarded ? '/app' : '/onboarding';
    console.log(`\nFrontend decision: Navigate to "${nextPageAfterLogin}"`);
    console.log(`✅ EXPECTED: /app (because profile was saved with onboarded=true)`);
    
    if (nextPageAfterLogin !== '/app') {
      console.error('❌ ERROR: Should navigate to /app but got:', nextPageAfterLogin);
      console.log('\n⚠️  THIS IS THE ISSUE: Profile is not being persisted to database!');
      return;
    }
    
    console.log('✅ CORRECT');
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // FINAL SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n' + '='.repeat(80));
    console.log('🎉 END-TO-END TEST PASSED!');
    console.log('='.repeat(80));
    console.log('\n✅ All steps completed successfully:');
    console.log('  1. Signup with onboarded=false → Navigate to /onboarding');
    console.log('  2. Complete onboarding (onboarded=true) → Navigate to /app');
    console.log('  3. Use app dashboard → Everything works');
    console.log('  4. Logout → Clear session');
    console.log('  5. Login again → Get profile with onboarded=true → Navigate to /app');
    console.log('\n✅ No redirect loops!');
    console.log('✅ Profile persistence working!');
    console.log('✅ Complete onboarding flow working!\n');
    
  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

testCompleteFlow();
