const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const path = require('path');
require('dotenv').config();

// In development, avoid process exit on uncaught errors to prevent restart loops
if (process.env.NODE_ENV !== 'production') {
  process.on('uncaughtException', (err) => {
    console.error('[Dev] Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (reason, p) => {
    console.error('[Dev] Unhandled Rejection:', reason);
  });
}

// Environment verification
console.log('[ENV] NODE_ENV:', process.env.NODE_ENV);
console.log('[ENV] OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);
console.log('[ENV] OPENROUTER_API_KEY prefix:', process.env.OPENROUTER_API_KEY ? process.env.OPENROUTER_API_KEY.substring(0, 9) + '...' : 'Not set');
console.log('[ENV] OPENROUTER_REFERRER:', process.env.OPENROUTER_REFERRER || 'Not set');
console.log('[ENV] OPENROUTER_TITLE:', process.env.OPENROUTER_TITLE || 'Not set');
console.log('[ENV] OPENROUTER_MODEL:', process.env.OPENROUTER_MODEL || 'Not set');
console.log('[DEBUG] CASHFREE_APP_ID present:', !!process.env.CASHFREE_APP_ID);
console.log('[DEBUG] CASHFREE_SECRET_KEY present:', !!process.env.CASHFREE_SECRET_KEY);
console.log('[DEBUG] CASHFREE_MODE:', process.env.CASHFREE_MODE || 'Not set');
console.log('[DEBUG] All env keys containing CASHFREE:', Object.keys(process.env).filter(k => k.includes('CASHFREE')));
console.log('[DEBUG] Raw CASHFREE_APP_ID value:', JSON.stringify(process.env.CASHFREE_APP_ID));
console.log('[DEBUG] Raw CASHFREE_SECRET_KEY value:', process.env.CASHFREE_SECRET_KEY ? `"${process.env.CASHFREE_SECRET_KEY.substring(0, 15)}..."` : 'undefined');

// Set default environment variables if not provided (do NOT set fake OpenRouter keys)
if (!process.env.OPENROUTER_API_KEY) {
  console.warn('[Startup] OPENROUTER_API_KEY is not set. AI features will fail with 401 until you add it to .env');
}
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '6644184480:AAH1234567890abcdefghijklmnopqrstuvwxyz';
process.env.WHATSAPP_SANDBOX_CODE = process.env.WHATSAPP_SANDBOX_CODE || 'GBmQD7SB';
process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your-whatsapp-phone-number-id';
process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || 'your-whatsapp-access-token';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'lifebuddy-jwt-secret-key-2024-change-in-production';

const app = express();

// Trust proxy for tunnels (ngrok/localtunnel) so rate-limit sees correct IP
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
  crossOriginEmbedderPolicy: false
}));

// Compression middleware for faster responses
app.use(compression({
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// CORS configuration - Enhanced for Railway deployment
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('CORS: allowing request with no origin');
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'https://www.lifebuddy.space',
      'https://lifebuddy.space',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://localhost:5000',
      process.env.FRONTEND_URL,
      // Allow Vercel deployments
      /^https:\/\/life-buddy-.*\.vercel\.app$/,
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.vercel\.dev$/,
      // Allow Railway backend health checks
      /^https:\/\/.*\.up\.railway\.app$/,
      /^https:\/\/.*\.railway\.app$/,
      // Allow localhost for development
      /^http:\/\/localhost:\d+$/
    ].filter(Boolean);
    
    console.log('CORS check for origin:', origin);
    console.log('CORS allowed origins:', allowedOrigins);
    
    // Also allow any localhost origin for development
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      console.log('CORS allowed: localhost origin');
      return callback(null, true);
    }
    
    // Check string origins
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('CORS allowed: exact match for origin:', origin);
      callback(null, true);
    }
    // Check regex patterns for Vercel deployments
    else if (allowedOrigins.some(pattern => pattern instanceof RegExp && pattern.test(origin))) {
      console.log('CORS allowed: regex match for origin:', origin);
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      console.log('Available allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Authorization', 
    'Content-Type', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Additional CORS headers for Railway compatibility
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('[CORS Middleware] Request from origin:', origin, 'Method:', req.method, 'Path:', req.path);
  
  if (origin === 'https://www.lifebuddy.space' || origin === 'https://lifebuddy.space') {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Requested-With,Accept,Origin,Access-Control-Request-Method,Access-Control-Request-Headers');
    res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  }
  
  // Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    console.log('[CORS] Handling preflight for:', req.path, 'from origin:', origin);
    res.header('Access-Control-Allow-Origin', origin || 'https://www.lifebuddy.space');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Requested-With,Accept,Origin,Access-Control-Request-Method,Access-Control-Request-Headers');
    return res.status(200).end();
  }
  
  next();
});

// Rate limiting - optimized for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for development to prevent 429 errors
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});
// Skip rate limit for subscription status checks and Cashfree webhook
app.use((req, res, next) => {
  if (
    req.path === '/api/subscriptions/status' ||
    req.path === '/api/payments/cashfree/webhook'
  ) {
    return next();
  }
  return limiter(req, res, next);
});

// Performance monitoring middleware
const performanceMonitor = require('./scripts/monitorPerformance');
app.use(performanceMonitor.trackRequest.bind(performanceMonitor));

// Logging
app.use(morgan('combined', {
  skip: (req, res) => {
    if (req.path === '/api/subscriptions/status') return true; // quiet frequent polling
    if (req.path === '/api/health') return true; // optional: health checks
    return false;
  }
}));

// Body parsing middleware
// IMPORTANT: Use raw body for Cashfree webhook so signature verification matches exactly
app.use('/api/payments/cashfree/webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lifebuddy', {
  maxPoolSize: 10, // Maximum number of connections in the pool
  minPoolSize: 2,  // Minimum number of connections in the pool
  maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
  serverSelectionTimeoutMS: 5000, // Timeout for server selection
  socketTimeoutMS: 45000, // Timeout for socket operations
  bufferCommands: false, // Disable mongoose buffering
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('Connected to MongoDB with connection pooling');

  if (process.env.NODE_ENV === 'development' && process.env.DROP_DB_ON_START === 'true') {
    try {
      await mongoose.connection.dropDatabase();
      console.log('✅ Dropped database for development reset (controlled by DROP_DB_ON_START)');
    } catch (err) {
      console.error('❌ Failed to drop database:', err);
    }
  }

  // Import routes AFTER connection established
  const authRoutes = require('./routes/authRoutes');
  const eventRoutes = require('./routes/eventRoutes');
  const userRoutes = require('./routes/userRoutes');
  const moodRoutes = require('./routes/moodRoutes');
  const achievementRoutes = require('./routes/achievementRoutes');
  const referralRoutes = require('./routes/referralRoutes');
  const motivationalRoutes = require('./routes/motivationalRoutes');
  const taskRoutes = require('./routes/taskRoutes');
  const subscriptionRoutes = require('./routes/subscriptionRoutes');
  const storeRoutes = require('./routes/storeRoutes');
  const premiumTaskRoutes = require('./routes/premiumTaskRoutes');
  const aiChatRoutes = require('./routes/aiChatRoutes');
  const couponRoutes = require('./routes/couponRoutes');
  const trialRoutes = require('./routes/trialRoutes');
  const paypalRoutes = require('./routes/paypalRoutes');
  const cashfreeRoutes = require('./routes/cashfreeRoutes');
  const pricingRoutes = require('./routes/pricingRoutes');
  const adminCouponRoutes = require('./routes/adminCouponRoutes');
  const Activity = require('./models/Activity');
  const ReferralCode = require('./models/ReferralCode');
  const ReferralHit = require('./models/ReferralHit');
  const User = require('./models/User');
  const { authenticateUser } = require('./middlewares/authMiddleware');
  const { logEnvironmentStatus } = require('./utils/environmentValidator');
  const { logPaymentStatus } = require('./utils/paymentValidator');
  const Achievement = require('./models/Achievement');

  // Validate environment on startup
  logEnvironmentStatus();
  logPaymentStatus();

  // Data migration to fix achievement progress types
  async function runDataMigration() {
    try {
      // Find achievements where progress.current or progress.target is a string
      const achievements = await Achievement.find({
        $or: [
          { 'progress.current': { $type: 'string' } },
          { 'progress.target': { $type: 'string' } }
        ]
      });

      for (const achievement of achievements) {
        // Convert to numbers
        achievement.progress.current = parseFloat(achievement.progress.current);
        achievement.progress.target = parseFloat(achievement.progress.target);
        
        // If conversion fails, set to 0 and target to 1 to avoid further errors
        if (isNaN(achievement.progress.current)) achievement.progress.current = 0;
        if (isNaN(achievement.progress.target)) achievement.progress.target = 1;
        
        await achievement.save();
      }
      
      console.log(`✅ Migrated ${achievements.length} achievements`);
    } catch (err) {
      console.error('❌ Data migration error:', err);
    }
  }

  runDataMigration();

  // Routes
  app.use('/api/achievements', achievementRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/mood', moodRoutes);
  app.use('/api/motivational', motivationalRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/store', storeRoutes);
  app.use('/api/premium-tasks', premiumTaskRoutes);
  app.use('/api/ai-chat', aiChatRoutes);
  app.use('/api/coupons', couponRoutes);
  app.use('/api/trial', trialRoutes);
  app.use('/api/admin-coupons', adminCouponRoutes);
  app.use('/api/referrals', referralRoutes);
  app.use('/api/pricing', pricingRoutes);
  app.use('/api/payments/paypal', paypalRoutes);
  app.use('/api/payments/cashfree', cashfreeRoutes);

  // Minimal current user endpoint for frontend checks
  app.get('/api/user', authenticateUser, async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .select('displayName username avatar personalQuote subscription createdAt stats');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isTrial = user?.subscription?.status === 'trial';
      const isPaid = user?.subscription?.plan && user.subscription.plan !== 'free' && user.subscription.status === 'active';
      const premium = !!(isTrial || isPaid);
      const tier = isTrial ? 'Trial' : (isPaid ? 'Premium' : 'Free');

      res.json({
        id: user._id,
        displayName: user.displayName || '',
        username: user.username || '',
        avatar: user.avatar || '',
        personalQuote: user.personalQuote || '',
        premium,
        tier,
        currentStreak: user?.stats?.taskStreak || 0,
        joinedAt: user.createdAt
      });
    } catch (err) {
      console.error('Error fetching current user:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Root endpoint for Railway health check
  app.get('/', (req, res) => {
    res.json({ 
      status: 'OK', 
      message: 'LifeBuddy Backend API', 
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'LifeBuddy API is running' });
  });

  // Referral redirect endpoint: /r/:code -> logs unique hit per IP (24h) and redirects to frontend
  app.get('/r/:code', async (req, res) => {
    const code = req.params.code;
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      const rc = await ReferralCode.findOne({ code });
      if (!rc) return res.redirect(frontend);

      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || 'unknown';
      const ua = req.get('user-agent') || '';
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await ReferralHit.findOne({ code, ip, createdAt: { $gte: since } });
      if (!existing) {
        await ReferralHit.create({ code, ip, ua });
        await User.findByIdAndUpdate(rc.user, {
          $inc: { 'trialTasks.sharedReferrals': 1 },
          $set: { 'trialTasks.lastUpdated': new Date() }
        });
      }
    } catch (err) {
      console.warn('Referral redirect error:', err.message);
    }
    return res.redirect(frontend + '/?ref=' + encodeURIComponent(code));
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    performanceMonitor.trackError(err);
    console.error(err.stack);
    res.status(500).json({ 
      message: 'Something went wrong!',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  // Start performance monitoring
  performanceMonitor.start();

  // Start server
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('[Dev] Continuing to run server without DB connection for debugging. Some routes may fail.');
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (DB connection failed)`);
    });
  }
});

module.exports = app;
