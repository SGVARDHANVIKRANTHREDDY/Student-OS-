// Quick test script to validate signup and login flow

async function test() {
  const BASE_URL = 'http://127.0.0.1:5000';
  
  const user = {
    name: 'Test User',
    email: 'quicktest@example.com',
    password: 'Test123@45',
    confirmPassword: 'Test123@45'
  };

  try {
    // Step 1: Signup
    console.log('1. Testing signup...');
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    const signupData = await signupRes.json();
    console.log('Signup response:', JSON.stringify(signupData, null, 2));
    
    if (!signupData.ok || !signupData.data.token) {
      console.error('Signup failed');
      return;
    }
    
    const token = signupData.data.token;
    const profileAfterSignup = signupData.data.profile;
    console.log('Profile after signup:', profileAfterSignup);
    console.log(`  - onboarded: ${profileAfterSignup?.onboarded} (type: ${typeof profileAfterSignup?.onboarded})`);
    
    // Step 2: Onboard
    console.log('\n2. Testing onboarding update...');
    const onboardRes = await fetch(`${BASE_URL}/api/profile/me`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        college: 'Test College',
        branch: 'CSE',
        graduationYear: '2025',
        careerGoal: 'SDE',
        onboarded: true
      })
    });
    const onboardData = await onboardRes.json();
    console.log('Onboarding response:', JSON.stringify(onboardData, null, 2));
    
    const profileAfterOnboard = onboardData.data.profile;
    console.log('Profile after onboarding:', profileAfterOnboard);
    console.log(`  - onboarded: ${profileAfterOnboard?.onboarded} (type: ${typeof profileAfterOnboard?.onboarded})`);
    
    // Step 3: Login with same credentials
    console.log('\n3. Testing login...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: user.password
      })
    });
    const loginData = await loginRes.json();
    console.log('Login response:', JSON.stringify(loginData,null, 2));
    
    const profileAfterLogin = loginData.data.profile;
    console.log('Profile after login:', profileAfterLogin);
    console.log(`  - onboarded: ${profileAfterLogin?.onboarded} (type: ${typeof profileAfterLogin?.onboarded})`);
    
    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`After signup:    onboarded = ${profileAfterSignup?.onboarded}`);
    console.log(`After onboarding: onboarded = ${profileAfterOnboard?.onboarded}`);
    console.log(`After login:      onboarded = ${profileAfterLogin?.onboarded}`);
    
    if (profileAfterLogin?.onboarded) {
      console.log('\n✅ SUCCESS: Profile correctly shows onboarded=true after login!');
    } else {
      console.log('\n❌ FAILURE: Profile shows onboarded=false after login (should be true)');
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

test();
