const mongoose = require('mongoose');
const User = require('./models/User');

async function testDB() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lifebuddy', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB');
    
    // Check if user exists
    const user = await User.findOne({ email: 'rohit367673@gmail.com' });
    console.log('User found:', user ? 'YES' : 'NO');
    
    if (user) {
      console.log('User details:');
      console.log('- Email:', user.email);
      console.log('- Firebase UID:', user.firebaseUid);
      console.log('- Display Name:', user.displayName);
      console.log('- Active:', user.isActive);
    }
    
    // Count total users
    const userCount = await User.countDocuments();
    console.log('Total users in database:', userCount);
    
    // List all users with email containing 'rohit'
    const rohitUsers = await User.find({ email: /rohit/i }).select('email firebaseUid displayName isActive');
    console.log('Users with "rohit" in email:', rohitUsers);
    
    mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Database test error:', error);
    process.exit(1);
  }
}

testDB();
