/**
 * Quick test runner for the clean tunnel architecture
 * Run with: node test-clean-architecture.js
 */

console.log('🚀 Loading Clean Tunnel Architecture Test...');

async function runTest() {
  try {
    // Import the TypeScript test module
    const { runAllTests } = require('./dist/test/testCleanTunnelConnection');
    
    console.log('✅ Test module loaded successfully');
    console.log('');
    
    await runAllTests();
    
  } catch (importError) {
    console.log('⚠️  Could not import compiled test - trying to compile first...');
    console.log('Error:', importError.message);
    console.log('');
    
    console.log('🔧 Attempting to compile TypeScript...');
    const { exec } = require('child_process');
    
    exec('npm run build', (buildError, stdout, stderr) => {
      if (buildError) {
        console.error('❌ TypeScript compilation failed:');
        console.error(stderr);
        console.log('');
        console.log('💡 To fix this:');
        console.log('1. Run: npm install');
        console.log('2. Run: npm run build');
        console.log('3. Run this test again');
        return;
      }
      
      console.log('✅ TypeScript compilation successful');
      console.log('🔄 Retrying test...');
      
      try {
        const { runAllTests } = require('./dist/test/testCleanTunnelConnection');
        runAllTests().catch(console.error);
      } catch (retryError) {
        console.error('❌ Still cannot load test module:', retryError.message);
      }
    });
  }
}

runTest();