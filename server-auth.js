const express = require('express');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { auth } = require('./lib/auth');
const config = require('./auth-config');

const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB connection
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
const client = new MongoClient(uri);

// Database connection helper
async function connectToDatabase() {
    try {
        if (!client.topology || !client.topology.isConnected()) {
            await client.connect();
        }
        return client.db("MyProductsDb");
    } catch (error) {
        console.error("❌ Database connection error:", error);
        throw error;
    }
}

// Middleware
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Check email availability endpoint
app.post('/api/auth/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Check if email exists in MongoDB
        const db = await connectToDatabase();
        const existingUser = await db.collection('UserCredentials').findOne({ email: email.toLowerCase() });
        
        res.json({ exists: !!existingUser });
        
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ error: error.message || 'Failed to check email' });
    }
});

// Create verification code endpoint
app.post('/api/auth/create-verification-code', async (req, res) => {
    try {
        const { email, userName } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Generate 4-digit verification code
        const verificationCode = Math.floor(1000 + Math.random() * 9000);
        
        // Store verification code temporarily (in real app, use Redis or database)
        global.verificationCodes = global.verificationCodes || {};
        global.verificationCodes[email] = verificationCode;
        
        console.log(`Verification code created for ${email}: ${verificationCode}`);
        
        res.json({ 
            success: true, 
            verificationCode: verificationCode,
            message: 'Verification code created successfully'
        });
        
    } catch (error) {
        console.error('Create verification code error:', error);
        res.status(500).json({ error: error.message || 'Failed to create verification code' });
    }
});

// Verify code endpoint
app.post('/api/auth/verify-code', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ error: 'Email and code are required' });
        }
        
        // Check verification code
        const storedCode = global.verificationCodes?.[email];
        if (!storedCode || storedCode.toString() !== code.toString()) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }
        
        // Remove used code
        delete global.verificationCodes[email];
        
        res.json({ success: true, message: 'Code verified successfully' });
        
    } catch (error) {
        console.error('Verify code error:', error);
        res.status(500).json({ error: error.message || 'Verification failed' });
    }
});

// Complete registration endpoint
app.post('/api/auth/complete-registration', async (req, res) => {
    try {
        const { fullname, email, password } = req.body;
        
        if (!fullname || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const db = await connectToDatabase();
        
        // Check if user already exists
        const existingUser = await db.collection('UserCredentials').findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email already exists' 
            });
        }
        
        // Hash password for security
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create user credentials object matching the main server pattern
        const userCredentials = {
            fullName: fullname,
            email: email.toLowerCase(),
            password: hashedPassword,
            emailVerified: true,
            registrationDate: new Date(),
            lastUpdated: new Date(),
            status: 'active',
            verificationCompletedAt: new Date()
        };
        
        // Save to UserCredentials collection
        const result = await db.collection('UserCredentials').insertOne(userCredentials);
        
        if (result.insertedId) {
            // Generate JWT token
            const token = jwt.sign(
                { 
                    userId: result.insertedId, 
                    email: userCredentials.email,
                    fullName: userCredentials.fullName,
                    verified: true
                },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );
            
            console.log(`✅ New user registered and verified: ${userCredentials.email}`);
            
            res.json({ 
                success: true, 
                message: 'Account created and verified successfully',
                token: token,
                user: {
                    id: result.insertedId,
                    fullName: userCredentials.fullName,
                    email: userCredentials.email,
                    emailVerified: true,
                    registrationDate: userCredentials.registrationDate,
                    status: userCredentials.status
                }
            });
        } else {
            throw new Error('Failed to save user credentials');
        }
        
    } catch (error) {
        console.error('Complete registration error:', error);
        res.status(500).json({ error: error.message || 'Registration failed' });
    }
});

// Invalidate codes endpoint
app.post('/api/auth/invalidate-codes', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Remove verification codes for this email
        if (global.verificationCodes) {
            delete global.verificationCodes[email];
        }
        
        res.json({ success: true, message: 'Codes invalidated successfully' });
        
    } catch (error) {
        console.error('Invalidate codes error:', error);
        res.status(500).json({ error: error.message || 'Failed to invalidate codes' });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        const db = await connectToDatabase();
        
        console.log(`Login attempt for: ${email}`);
        
        // Find user in UserCredentials collection
        const user = await db.collection('UserCredentials').findOne({ 
            email: email.toLowerCase() 
        });
        
        if (!user) {
            console.log(`Login failed: User not found for ${email}`);
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Check if account is active
        if (user.status !== 'active') {
            return res.status(401).json({ 
                success: false, 
                message: 'Account is not active' 
            });
        }
        
        // Verify password using bcrypt
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            console.log(`Login failed: Password mismatch for ${email}`);
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Check if email is verified
        if (!user.emailVerified) {
            return res.status(401).json({ 
                success: false, 
                message: 'Please verify your email before logging in' 
            });
        }
        
        // Update last login time
        await db.collection('UserCredentials').updateOne(
            { _id: user._id },
            { 
                $set: { 
                    lastLogin: new Date(),
                    lastUpdated: new Date()
                }
            }
        );
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id, 
                email: user.email,
                fullName: user.fullName,
                verified: user.emailVerified
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );
        
        console.log(`✅ User logged in: ${user.email}`);
        
        res.json({ 
            success: true, 
            message: 'Login successful',
            token: token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                emailVerified: user.emailVerified,
                registrationDate: user.registrationDate,
                lastLogin: new Date(),
                status: user.status
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message || 'Login failed' });
    }
});

// Custom verification endpoint
app.post('/api/auth/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ error: 'Email and code are required' });
        }
        
        // Use custom verification function
        const result = await auth.verifyEmailCode(email, code);
        
        res.json({ success: true, message: 'Email verified successfully' });
        
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(400).json({ error: error.message || 'Verification failed' });
    }
});

// Send verification email endpoint
app.post('/api/auth/send-verification-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Generate new verification code
        const verificationCode = Math.floor(1000 + Math.random() * 9000);
        
        // Send email via n8n webhook
        const response = await fetch(config.N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: email,
                from: config.SENDER_EMAIL,
                subject: 'Verify Your Email - Sanrico Mercantile',
                verificationCode: verificationCode,
                userName: email,
                type: 'verification'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send verification email');
        }

        // Store verification code
        global.verificationCodes = global.verificationCodes || {};
        global.verificationCodes[email] = verificationCode;
        
        res.json({ success: true, message: 'Verification email sent' });
        
    } catch (error) {
        console.error('Send verification email error:', error);
        res.status(500).json({ error: error.message || 'Failed to send email' });
    }
});

// Password reset endpoint
app.post('/api/auth/send-password-reset', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Generate reset token
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        // Send password reset email via n8n webhook
        const response = await fetch(config.N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: email,
                from: config.SENDER_EMAIL,
                subject: 'Password Reset - Sanrico Mercantile',
                resetToken: resetToken,
                resetLink: `${config.BETTER_AUTH_URL}/reset-password?token=${resetToken}`,
                userName: email,
                type: 'password-reset'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send password reset email');
        }
        
        res.json({ success: true, message: 'Password reset email sent' });
        
    } catch (error) {
        console.error('Send password reset email error:', error);
        res.status(500).json({ error: error.message || 'Failed to send email' });
    }
});

// Better Auth API routes (catch-all for remaining /api/auth/* routes)
app.all('/api/auth/*', async (req, res) => {
    try {
        console.log(`${req.method} ${req.url}`);
        
        // Create a standard Request object for Better Auth
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const request = new Request(url.toString(), {
            method: req.method,
            headers: {
                ...req.headers,
                'content-type': req.headers['content-type'] || 'application/json'
            },
            body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
        });

        // Handle the request with Better Auth
        const response = await auth.handler(request);
        
        // Convert Response to Express response
        const responseBody = await response.text();
        
        // Set headers
        response.headers.forEach((value, key) => {
            res.setHeader(key, value);
        });
        
        res.status(response.status).send(responseBody);
        
    } catch (error) {
        console.error('Auth API Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve static files and handle client-side routing
app.get('*', (req, res) => {
    // For client-side routing, serve the appropriate HTML file
    const requestedFile = req.path;
    
    if (requestedFile.endsWith('.html') || requestedFile === '/') {
        const filePath = requestedFile === '/' ? 'index.html' : requestedFile.substring(1);
        res.sendFile(path.join(__dirname, filePath));
    } else {
        res.status(404).send('File not found');
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📧 Using email: ${config.SENDER_EMAIL}`);
    console.log(`🔗 n8n webhook: ${config.N8N_WEBHOOK_URL}`);
    console.log(`🗄️ Database: ${config.DATABASE_URL}`);
});

module.exports = app; 