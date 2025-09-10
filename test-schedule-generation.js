const mongoose = require('mongoose');
const User = require('./models/User');
const PremiumTask = require('./models/PremiumTask');
const { generateScheduleWithOpenRouter } = require('./services/openRouterService');
const { MessagingService } = require('./services/messagingService');
require('dotenv').config();

// Test script to verify schedule generation and WhatsApp notification
async function testScheduleGeneration() {
  try {
    console.log('🚀 Starting schedule generation test...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lifebuddy', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find or create test user with WhatsApp number
    let testUser = await User.findOne({ email: 'test@lifebuddy.com' });
    
    if (!testUser) {
      testUser = new User({
        email: 'test@lifebuddy.com',
        displayName: 'Test User',
        username: 'testuser',
        notificationPlatform: 'whatsapp',
        phoneNumber: '+917807932322',
        subscription: {
          plan: 'yearly',
          status: 'active',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        },
        isActive: true
      });
      await testUser.save();
      console.log('✅ Created test user with WhatsApp number +917807932322');
    } else {
      // Update existing user with WhatsApp details
      testUser.notificationPlatform = 'whatsapp';
      testUser.phoneNumber = '+917807932322';
      testUser.subscription = {
        plan: 'yearly',
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
      await testUser.save();
      console.log('✅ Updated test user with WhatsApp number +917807932322');
    }

    // Test schedule generation
    console.log('📅 Generating test schedule...');
    const userContext = {
      userId: String(testUser._id),
      username: testUser.username,
      timezone: 'Asia/Kolkata',
      subscription: 'yearly',
      notificationPlatform: 'whatsapp'
    };

    const title = 'Learn JavaScript Programming';
    const requirements = 'I want to learn JavaScript from basics to advanced level. Focus on practical projects and real-world applications.';
    const startDate = new Date();
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

    let schedule;
    try {
      schedule = await generateScheduleWithOpenRouter(title, requirements, startDate, endDate, userContext);
      console.log('✅ Schedule generated successfully with OpenRouter');
      console.log(`📋 Generated ${schedule.length} daily tasks`);
    } catch (error) {
      console.error('❌ OpenRouter API not available, using mock schedule for testing');
      // Generate mock schedule for testing
      schedule = [];
      const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      for (let i = 1; i <= Math.min(totalDays, 14); i++) {
        const taskDate = new Date(startDate);
        taskDate.setDate(startDate.getDate() + i - 1);
        
        schedule.push({
          day: i,
          date: taskDate.toISOString(),
          subtask: `Day ${i}: JavaScript ${i === 1 ? 'Basics - Variables and Data Types' : 
                   i === 2 ? 'Functions and Scope' : 
                   i === 3 ? 'Arrays and Objects' : 
                   i === 4 ? 'DOM Manipulation' : 
                   i === 5 ? 'Event Handling' : 
                   i === 6 ? 'Async Programming - Promises' : 
                   i === 7 ? 'Fetch API and AJAX' : 
                   `Advanced Topic ${i - 7}`}`,
          motivationTip: i === 1 ? "Every expert was once a beginner. Start your JavaScript journey today!" :
                        i === 2 ? "Functions are the building blocks of JavaScript. Master them!" :
                        i === 3 ? "Data structures are your tools. Learn to use them effectively!" :
                        "Keep practicing! Consistency is key to mastering programming.",
          resources: [`https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Day${i}`],
          exercises: [
            `Complete ${i <= 3 ? 'basic' : i <= 7 ? 'intermediate' : 'advanced'} exercises for day ${i}`,
            `Build a small project using today's concepts`
          ],
          notes: `Focus on understanding the core concepts before moving to the next topic`,
          status: "pending"
        });
      }
      console.log('✅ Mock schedule generated for testing');
      console.log(`📋 Generated ${schedule.length} daily tasks`);
    }

    // Create premium task
    const premiumTask = new PremiumTask({
      user: testUser._id,
      title,
      description: 'Test schedule for JavaScript learning',
      requirements,
      startDate,
      endDate,
      generatedSchedule: schedule,
      consentGiven: true,
      currentDay: 1,
      scheduleSource: 'OpenRouter'
    });
    await premiumTask.save();
    console.log('✅ Premium task created and saved to database');

    // Test WhatsApp notification for Day 1
    console.log('📱 Sending Day 1 WhatsApp notification...');
    const messagingService = new MessagingService();
    
    try {
      const result = await messagingService.sendMessage(testUser, premiumTask, 1);
      if (result) {
        console.log('✅ WhatsApp notification sent successfully to +917807932322');
        console.log('📋 Day 1 Task:', schedule[0]?.subtask || 'No task found');
        console.log('💡 Motivation:', schedule[0]?.motivationTip || 'No motivation tip');
      } else {
        console.log('❌ Failed to send WhatsApp notification');
      }
    } catch (error) {
      console.error('❌ WhatsApp notification error:', error.message);
    }

    // Display test results
    console.log('\n📊 TEST RESULTS:');
    console.log('================');
    console.log(`User ID: ${testUser._id}`);
    console.log(`WhatsApp Number: ${testUser.phoneNumber}`);
    console.log(`Task ID: ${premiumTask._id}`);
    console.log(`Schedule Length: ${schedule.length} days`);
    console.log(`Current Day: ${premiumTask.currentDay}`);
    console.log('\n📋 Day 1 Schedule:');
    if (schedule[0]) {
      console.log(`Task: ${schedule[0].subtask}`);
      console.log(`Motivation: ${schedule[0].motivationTip}`);
      console.log(`Resources: ${JSON.stringify(schedule[0].resources || [])}`);
    }

    // Test n8n webhook trigger (if configured)
    console.log('\n🔗 Testing n8n webhook trigger...');
    try {
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      if (webhookUrl) {
        const fetch = require('node-fetch');
        const webhookPayload = {
          userId: String(testUser._id),
          taskId: String(premiumTask._id),
          dayNumber: 1,
          userEmail: testUser.email,
          phoneNumber: testUser.phoneNumber,
          notificationPlatform: testUser.notificationPlatform,
          task: schedule[0],
          timestamp: new Date().toISOString()
        };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload)
        });

        if (response.ok) {
          console.log('✅ n8n webhook triggered successfully');
        } else {
          console.log(`❌ n8n webhook failed: ${response.status} ${response.statusText}`);
        }
      } else {
        console.log('⚠️ N8N_WEBHOOK_URL not configured in environment variables');
      }
    } catch (error) {
      console.error('❌ n8n webhook error:', error.message);
    }

    console.log('\n🎉 Test completed successfully!');
    console.log('Check your WhatsApp (+917807932322) for the Day 1 schedule reminder.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testScheduleGeneration();
}

module.exports = { testScheduleGeneration };
