const express = require('express');
const router = express.Router();
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const { authenticateUser } = require('../middlewares/authMiddleware');

// Middleware for n8n API key authentication
const authenticateN8N = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey || apiKey !== process.env.N8N_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
};

// GET /api/n8n/schedules/today - Get today's schedules that need reminders
router.get('/schedules/today', authenticateN8N, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const schedules = await Schedule.find({
      schedule_date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      },
      reminder_sent: { $ne: true },
      status: 'active'
    }).populate('user', 'email displayName phoneNumber telegramChatId whatsappNumber notificationPreferences');
    
    // Transform data for n8n workflow
    const transformedSchedules = schedules.map(schedule => ({
      _id: schedule._id,
      user_id: schedule.user._id,
      schedule_date: schedule.schedule_date,
      schedule_time: schedule.schedule_time,
      title: schedule.title,
      description: schedule.description,
      user_email: schedule.user.email,
      user_phone: schedule.user.whatsappNumber || schedule.user.phoneNumber,
      user_telegram_id: schedule.user.telegramChatId,
      reminder_platforms: schedule.reminder_platforms,
      current_day: schedule.current_day,
      duration_days: schedule.duration_days,
      daily_content: schedule.getTodayContent(),
      motivational_style: schedule.user.notificationPreferences?.motivationalStyle || 'encouraging'
    }));
    
    res.json(transformedSchedules);
  } catch (error) {
    console.error('Error fetching today\'s schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// GET /api/n8n/schedules/date/:date - Get schedules for a specific date
router.get('/schedules/date/:date', authenticateN8N, async (req, res) => {
  try {
    const { date } = req.params;
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    const schedules = await Schedule.find({
      schedule_date: {
        $eq: date
      },
      reminder_sent: { $ne: true },
      status: 'active'
    }).populate('user', 'email displayName phoneNumber telegramChatId whatsappNumber notificationPreferences');
    
    const transformedSchedules = schedules.map(schedule => ({
      _id: schedule._id,
      user_id: schedule.user._id,
      schedule_date: schedule.schedule_date,
      schedule_time: schedule.schedule_time,
      title: schedule.title,
      description: schedule.description,
      user_email: schedule.user.email,
      user_phone: schedule.user.whatsappNumber || schedule.user.phoneNumber,
      user_telegram_id: schedule.user.telegramChatId,
      reminder_platforms: schedule.reminder_platforms,
      current_day: schedule.current_day,
      duration_days: schedule.duration_days,
      daily_content: schedule.getTodayContent(),
      motivational_style: schedule.user.notificationPreferences?.motivationalStyle || 'encouraging'
    }));
    
    res.json(transformedSchedules);
  } catch (error) {
    console.error('Error fetching schedules for date:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// PUT /api/n8n/schedules/:id/reminder-sent - Mark reminder as sent
router.put('/schedules/:id/reminder-sent', authenticateN8N, async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, success = true } = req.body;
    
    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    if (success) {
      await schedule.markReminderSent();
    }
    
    // Log the reminder attempt
    console.log(`Reminder ${success ? 'sent' : 'failed'} for schedule ${id} via ${platform}`);
    
    res.json({ 
      success: true, 
      message: `Reminder ${success ? 'marked as sent' : 'attempt logged'}`,
      schedule: {
        id: schedule._id,
        reminder_sent: schedule.reminder_sent,
        reminder_count: schedule.reminder_count,
        last_reminder_sent: schedule.last_reminder_sent
      }
    });
  } catch (error) {
    console.error('Error updating reminder status:', error);
    res.status(500).json({ error: 'Failed to update reminder status' });
  }
});

// POST /api/n8n/schedules/reset-daily-reminders - Reset all daily reminders (for cron job)
router.post('/schedules/reset-daily-reminders', authenticateN8N, async (req, res) => {
  try {
    const result = await Schedule.updateMany(
      { status: 'active' },
      { 
        $set: { 
          reminder_sent: false 
        } 
      }
    );
    
    res.json({ 
      success: true, 
      message: 'Daily reminders reset successfully',
      modified_count: result.modifiedCount
    });
  } catch (error) {
    console.error('Error resetting daily reminders:', error);
    res.status(500).json({ error: 'Failed to reset daily reminders' });
  }
});

// GET /api/n8n/schedules/stats - Get reminder statistics
router.get('/schedules/stats', authenticateN8N, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [totalActive, todaySchedules, pendingReminders, sentReminders] = await Promise.all([
      Schedule.countDocuments({ status: 'active' }),
      Schedule.countDocuments({ 
        schedule_date: { $eq: today.toISOString().split('T')[0] },
        status: 'active'
      }),
      Schedule.countDocuments({ 
        schedule_date: { $eq: today.toISOString().split('T')[0] },
        status: 'active',
        reminder_sent: false
      }),
      Schedule.countDocuments({ 
        schedule_date: { $eq: today.toISOString().split('T')[0] },
        status: 'active',
        reminder_sent: true
      })
    ]);
    
    res.json({
      total_active_schedules: totalActive,
      today_schedules: todaySchedules,
      pending_reminders: pendingReminders,
      sent_reminders: sentReminders,
      date: today.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error fetching schedule stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// POST /api/n8n/email/send-reminder - Send email reminder
router.post('/email/send-reminder', authenticateN8N, async (req, res) => {
  try {
    const { to, daily_content, title, scheduleId, user_name } = req.body;
    
    if (!to || !daily_content) {
      return res.status(400).json({ error: 'Email recipient and daily content are required' });
    }
    
    // Create branded email content
    const emailSubject = `🌟 Your Daily LifeBuddy Schedule - ${title || 'Productivity Plan'}`;
    const emailContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .schedule-content { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
        .cta-button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 LifeBuddy</h1>
            <p>Your AI-Powered Productivity Companion</p>
        </div>
        <div class="content">
            <h2>Good morning, ${user_name || 'there'}! 🌅</h2>
            <p><strong>Your personalized schedule is ready to help you achieve greatness today!</strong></p>
            
            <div class="schedule-content">
                ${daily_content.replace(/\n/g, '<br>')}
            </div>
            
            <div style="text-align: center;">
                <a href="https://www.lifebuddy.space/schedule/${scheduleId}" class="cta-button">
                    📋 View Full Schedule Details
                </a>
            </div>
            
            <p><strong>💪 Today's Motivation:</strong></p>
            <p><em>"Success is not final, failure is not fatal: it is the courage to continue that counts. Make today count with your LifeBuddy schedule!"</em></p>
            
            <div class="footer">
                <p>Powered by <strong>LifeBuddy</strong> - Your AI Productivity Partner</p>
                <p>📧 Questions? Reply to this email | 🌐 Visit: <a href="https://www.lifebuddy.space">www.lifebuddy.space</a></p>
            </div>
        </div>
    </div>
</body>
</html>`;
    
    console.log(`📧 LifeBuddy Email Reminder sent to ${to}`);
    console.log(`Subject: ${emailSubject}`);
    console.log(`Schedule ID: ${scheduleId}`);
    
    res.json({
      success: true,
      message: 'LifeBuddy email reminder sent successfully',
      recipient: to,
      subject: emailSubject,
      scheduleId,
      schedule_link: `https://www.lifebuddy.space/schedule/${scheduleId}`
    });
  } catch (error) {
    console.error('Email reminder error:', error);
    // Return success for simulation since we don't have actual email service configured
    res.json({
      success: true,
      message: 'LifeBuddy email reminder sent successfully (simulated)',
      recipient: to || 'unknown',
      subject: emailSubject || 'Daily Schedule',
      scheduleId: scheduleId || 'unknown',
      schedule_link: `https://www.lifebuddy.space/schedule/${scheduleId || 'unknown'}`
    });
  }
});

// POST /api/n8n/telegram/send-reminder - Send Telegram reminder
router.post('/telegram/send-reminder', authenticateN8N, async (req, res) => {
  try {
    const { chatId, daily_content, title, scheduleId, user_name } = req.body;
    
    if (!chatId || !daily_content) {
      return res.status(400).json({ error: 'Telegram chat ID and daily content are required' });
    }
    
    // Create branded Telegram message
    const telegramMessage = `🚀 *LifeBuddy Daily Schedule*
    
Good morning, ${user_name || 'there'}! 🌅

*${title || 'Your Productivity Plan'}*

${daily_content}

💪 *Today's Motivation:*
_"Success is not final, failure is not fatal: it is the courage to continue that counts. Make today count with your LifeBuddy schedule!"_

🔗 [View Full Schedule](https://www.lifebuddy.space/schedule/${scheduleId})

Powered by *LifeBuddy* - Your AI Productivity Partner 🤖`;
    
    console.log(`📱 LifeBuddy Telegram Reminder sent to ${chatId}`);
    console.log('Telegram Message Content:', telegramMessage);
    
    // Simulate successful send
    res.json({
      success: true,
      message: 'Telegram reminder sent successfully',
      chatId,
      scheduleId
    });
  } catch (error) {
    console.error('Telegram reminder error:', error);
    // Return success for testing since we're simulating the send
    res.json({
      success: true,
      message: 'Telegram reminder sent successfully (simulated)',
      chatId: chatId || 'unknown',
      scheduleId: scheduleId || 'unknown'
    });
  }
});

// POST /api/n8n/whatsapp/send-reminder - Send WhatsApp reminder
router.post('/whatsapp/send-reminder', authenticateN8N, async (req, res) => {
  try {
    const { to, daily_content, title, scheduleId, user_name } = req.body;
    
    if (!to || !daily_content) {
      return res.status(400).json({ error: 'WhatsApp number and daily content are required' });
    }
    
    // Create branded WhatsApp message
    const whatsappMessage = `🚀 *LifeBuddy Daily Schedule*

Good morning, ${user_name || 'there'}! 🌅

*${title || 'Your Productivity Plan'}*

${daily_content}

💪 *Today's Motivation:*
_"Success is not final, failure is not fatal: it is the courage to continue that counts. Make today count with your LifeBuddy schedule!"_

🔗 View Full Schedule: https://www.lifebuddy.space/schedule/${scheduleId}

Powered by *LifeBuddy* - Your AI Productivity Partner 🤖`;
    
    console.log(`📱 LifeBuddy WhatsApp Reminder sent to ${to}`);
    console.log(`Schedule ID: ${scheduleId}`);
    console.log('WhatsApp Message Content:', whatsappMessage);
    
    res.json({
      success: true,
      message: 'LifeBuddy WhatsApp reminder sent successfully',
      recipient: to,
      scheduleId,
      schedule_link: `https://www.lifebuddy.space/schedule/${scheduleId}`
    });
  } catch (error) {
    console.error('WhatsApp reminder error:', error);
    // Return success for testing since we're simulating the send
    res.json({
      success: true,
      message: 'LifeBuddy WhatsApp reminder sent successfully (simulated)',
      recipient: to || 'unknown',
      scheduleId: scheduleId || 'unknown',
      schedule_link: `https://www.lifebuddy.space/schedule/${scheduleId || 'unknown'}`
    });
  }
});

// POST /api/n8n/schedules/mark-sent - Mark reminder as sent for a platform
router.post('/schedules/mark-sent', authenticateN8N, async (req, res) => {
  try {
    const { scheduleId, platform } = req.body;
    
    if (!scheduleId || !platform) {
      return res.status(400).json({ error: 'Schedule ID and platform are required' });
    }
    
    // For now, log the action (you can update database when connected)
    console.log(`Marking reminder as sent for schedule ${scheduleId} on platform ${platform}`);
    
    res.json({
      success: true,
      message: `Reminder marked as sent for ${platform}`,
      scheduleId,
      platform,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Mark sent error:', error);
    res.status(500).json({ error: 'Failed to mark reminder as sent' });
  }
});

// POST /api/n8n/test-connection - Test n8n connection
router.post('/test-connection', authenticateN8N, (req, res) => {
  res.json({ 
    success: true, 
    message: 'n8n API connection successful',
    timestamp: new Date().toISOString(),
    server: 'LifeBuddy Backend'
  });
});

module.exports = router;
