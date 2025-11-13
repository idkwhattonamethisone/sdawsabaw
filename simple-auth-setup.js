/**
 * 🎯 ALTERNATIVE: Simple Authentication with Email Verification
 * 
 * This is a simpler approach using your existing MongoDB setup
 * instead of Better Auth, while still providing the email verification
 * and professional UI you requested.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');
// Load environment variables
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration
const config = {
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/sanrico-mercantile',
    DATABASE_NAME: process.env.DATABASE_NAME || 'MyProductsDb',
    JWT_SECRET: process.env.JWT_SECRET || 'your_super_secure_jwt_secret_key_here',
    SENDER_EMAIL: process.env.SENDER_EMAIL || 'sanricomercantileofficial@gmail.com',
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/send-verification-email'
};

// MongoDB connection
let db;
MongoClient.connect(config.MONGODB_URI)
    .then(client => {
        db = client.db(config.DATABASE_NAME);
        console.log('📊 Connected to MongoDB');
        console.log(`📧 Using email: ${config.SENDER_EMAIL}`);
        console.log(`🔗 n8n webhook: ${config.N8N_WEBHOOK_URL}`);
    })
    .catch(error => {
        console.error('❌ MongoDB connection failed:', error);
        console.log('\n🔧 Please check:');
        console.log('   1. MongoDB is running');
        console.log('   2. Connection string is correct');
        console.log('   3. Database permissions are set');
        process.exit(1);
    });

// Store verification codes (use Redis in production)
const verificationCodes = new Map();

// Generate verification code
function generateVerificationCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Send verification email via n8n
async function sendVerificationEmail(email, code, type = 'verification') {
    try {
        const response = await fetch(config.N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: email,
                from: config.SENDER_EMAIL,
                subject: type === 'verification' ? 
                    'Verify Your Email - Sanrico Mercantile' : 
                    'Password Reset - Sanrico Mercantile',
                verificationCode: code,
                userName: email,
                type: type
            })
        });
        
        return response.ok;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
}

// 🔐 REGISTRATION ENDPOINT
app.post('/api/simple-auth/register', async (req, res) => {
    try {
        const { email, password, fullName } = req.body;
        
        // Validate input
        if (!email || !password || !fullName) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        // Enforce password policy: 7–12 chars, include a digit, an uppercase, and one of . or !
        const passwordPolicy = /^(?=.{7,12}$)(?=.*\d)(?=.*[A-Z])(?=.*[\.!]).*$/;
        if (!passwordPolicy.test(String(password))) {
            return res.status(400).json({ 
                error: 'Password must be 7–12 chars and include a number, an uppercase letter, and one of . or !'
            });
        }
        
        // Check if user exists
        const existingUser = await db.collection('UserCredentials').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Generate verification code
        const verificationCode = generateVerificationCode();
        
        // Create user (unverified)
        const newUser = {
            email,
            password: hashedPassword,
            fullName,
            isStaff: false,
            emailVerified: false,
            createdAt: new Date(),
            verificationCode: verificationCode,
            verificationExpires: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        };
        
        await db.collection('UserCredentials').insertOne(newUser);
        
        // Send verification email
        const emailSent = await sendVerificationEmail(email, verificationCode);
        
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send verification email' });
        }
        
        res.json({ 
            success: true, 
            message: 'Account created! Please check your email for verification code.',
            needsVerification: true
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// 🔑 LOGIN ENDPOINT
app.post('/api/simple-auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await db.collection('UserCredentials').findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const passwordValid = await bcrypt.compare(password, user.password);
        if (!passwordValid) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check if email is verified
        if (!user.emailVerified) {
            // Generate new verification code
            const verificationCode = generateVerificationCode();
            
            await db.collection('UserCredentials').updateOne(
                { email },
                { 
                    $set: { 
                        verificationCode,
                        verificationExpires: new Date(Date.now() + 10 * 60 * 1000)
                    }
                }
            );
            
            // Send verification email
            await sendVerificationEmail(email, verificationCode);
            
            return res.status(403).json({ 
                error: 'Please verify your email address to continue',
                needsVerification: true
            });
        }
        
        // Create session token
        const token =             jwt.sign(
            { userId: user._id, email: user.email },
            config.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                isStaff: user.isStaff
            },
            token
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ✉️ EMAIL VERIFICATION ENDPOINT
app.post('/api/simple-auth/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        const user = await db.collection('UserCredentials').findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        
        // Check verification code and expiration
        if (user.verificationCode !== code || 
            new Date() > user.verificationExpires) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }
        
        // Mark email as verified
        await db.collection('UserCredentials').updateOne(
            { email },
            { 
                $set: { emailVerified: true },
                $unset: { verificationCode: "", verificationExpires: "" }
            }
        );
        
        res.json({ success: true, message: 'Email verified successfully!' });
        
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// 🔄 RESEND VERIFICATION CODE
app.post('/api/simple-auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await db.collection('UserCredentials').findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        
        if (user.emailVerified) {
            return res.status(400).json({ error: 'Email already verified' });
        }
        
        // Generate new verification code
        const verificationCode = generateVerificationCode();
        
        await db.collection('UserCredentials').updateOne(
            { email },
            { 
                $set: { 
                    verificationCode,
                    verificationExpires: new Date(Date.now() + 10 * 60 * 1000)
                }
            }
        );
        
        // Send verification email
        const emailSent = await sendVerificationEmail(email, verificationCode);
        
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send verification email' });
        }
        
        res.json({ success: true, message: 'New verification code sent!' });
        
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Failed to resend verification code' });
    }
});

// 🔒 PASSWORD RESET
app.post('/api/simple-auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await db.collection('UserCredentials').findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        
        // Generate reset token
        const resetToken = jwt.sign(
            { userId: user._id, email: user.email },
            config.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        // Send password reset email
        const emailSent = await sendVerificationEmail(
            email, 
            resetToken, 
            'password-reset'
        );
        
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send reset email' });
        }
        
        res.json({ success: true, message: 'Password reset email sent!' });
        
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to send reset email' });
    }
});

// 🛡️ SESSION CHECK MIDDLEWARE
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, config.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// 👤 GET USER SESSION
app.get('/api/simple-auth/session', authenticateToken, async (req, res) => {
    try {
        const user = await db.collection('UserCredentials').findOne(
            { _id: req.user.userId },
            { projection: { password: 0, verificationCode: 0 } }
        );
        
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get session' });
    }
});

// 🚪 LOGOUT
app.post('/api/simple-auth/logout', (req, res) => {
    // In a more sophisticated setup, you'd invalidate the token
    res.json({ success: true, message: 'Logged out successfully' });
});

// Start the server
const PORT = process.env.AUTH_PORT || 3001;

app.listen(PORT, () => {
    console.log(`
🎯 SIMPLE AUTH SERVER RUNNING!

🚀 Server: http://localhost:${PORT}
📊 Database: ${config.DATABASE_NAME}
📧 Email: ${config.SENDER_EMAIL}
🔗 n8n webhook: ${config.N8N_WEBHOOK_URL}

✅ Endpoints available:
   • POST /api/simple-auth/register     - User registration
   • POST /api/simple-auth/login        - User login
   • POST /api/simple-auth/verify-email - Email verification
   • POST /api/simple-auth/resend-verification - Resend code
   • POST /api/simple-auth/forgot-password - Password reset
   • GET  /api/simple-auth/session      - Check session
   • POST /api/simple-auth/logout       - Logout

📧 Email verification with 4-digit codes
🔐 Secure password hashing with bcryptjs
💾 Stores users in MongoDB 'UserCredentials' collection
🎨 Works with existing verification dialog UI

🎉 Ready to authenticate users!
`);
});

module.exports = app;