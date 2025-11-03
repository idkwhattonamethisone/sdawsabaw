const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

// MongoDB connection string
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
const client = new MongoClient(uri);

async function setupStaffCredentials() {
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const database = client.db("MyProductsDb");
        const collection = database.collection("StaffCredentials");

        // Clear existing staff credentials
        await collection.deleteMany({});
        console.log('🧹 Cleared existing staff credentials');

        // Hash the password for security
        const hashedPassword = await bcrypt.hash("staff123", 12);
        console.log('🔐 Password hashed for security');

        // Insert only staff credentials (no cashier)
        const staffCredentials = {
            username: "staff",
            password: hashedPassword, // Now properly hashed
            isAdmin: false,
            isStaff: true,
            createdAt: new Date(),
            lastUpdated: new Date()
        };

        const result = await collection.insertOne(staffCredentials);
        console.log('✅ Staff credentials inserted successfully');
        console.log(`📊 Inserted ${result.insertedCount} staff account`);

        // Verify the credentials were inserted correctly
        const staffUser = await collection.findOne({ username: "staff" });

        console.log('\n📋 Verification:');
        console.log('Staff account:', {
            _id: staffUser._id,
            username: staffUser.username,
            password: '[HASHED]', // Don't show actual password
            isAdmin: staffUser.isAdmin,
            isStaff: staffUser.isStaff,
            createdAt: staffUser.createdAt
        });

        console.log('\n🎉 Staff credentials setup completed successfully!');
        console.log('You can now login with:');
        console.log('- Username: "staff", Password: "staff123" (Staff role)');
        console.log('🔒 Password is now securely hashed in the database');

    } catch (error) {
        console.error('❌ Error setting up staff credentials:', error);
    } finally {
        await client.close();
        console.log('🔌 Disconnected from MongoDB');
    }
}

// Run the setup
console.log('Setting up staff credentials...');
setupStaffCredentials(); 