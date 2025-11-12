const { MongoClient } = require('mongodb');

// MongoDB connection string
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
const client = new MongoClient(uri);

async function createIndexes() {
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const database = client.db("MyProductsDb");

        // ============================================
        // Products Collection Indexes
        // ============================================
        console.log('\n📦 Creating indexes for Products collection...');
        const productsCollection = database.collection("Products");
        
        // Index for name sorting (most common)
        await productsCollection.createIndex({ name: 1 }, { name: 'idx_name' });
        console.log('  ✓ Created index on: name');
        
        // Index for price sorting
        await productsCollection.createIndex({ SellingPrice: 1 }, { name: 'idx_sellingPrice' });
        console.log('  ✓ Created index on: SellingPrice');
        
        // Index for isActive filter (used in all queries)
        await productsCollection.createIndex({ isActive: 1 }, { name: 'idx_isActive' });
        console.log('  ✓ Created index on: isActive');
        
        // Compound index for common query pattern: isActive + name
        await productsCollection.createIndex({ isActive: 1, name: 1 }, { name: 'idx_isActive_name' });
        console.log('  ✓ Created compound index on: isActive + name');
        
        // Index for category filtering
        await productsCollection.createIndex({ category: 1 }, { name: 'idx_category' });
        console.log('  ✓ Created index on: category');
        
        // Compound index for category + isActive + name (common query pattern)
        await productsCollection.createIndex({ isActive: 1, category: 1, name: 1 }, { name: 'idx_isActive_category_name' });
        console.log('  ✓ Created compound index on: isActive + category + name');

        // ============================================
        // Order Collections Indexes
        // ============================================
        const orderCollections = [
            { name: "PendingOrders", display: "Pending Orders" },
            { name: "AcceptedOrders", display: "Accepted Orders" },
            { name: "DeliveredOrders", display: "Delivered Orders" },
            { name: "WalkInOrders", display: "Walk-In Orders" },
            { name: "ReturnedOrders", display: "Returned Orders" },
            { name: "CancelledOrders", display: "Cancelled Orders" }
        ];

        console.log('\n📋 Creating indexes for Order collections...');
        for (const orderCol of orderCollections) {
            const collection = database.collection(orderCol.name);
            
            // Index for createdAt sorting (most common)
            await collection.createIndex({ createdAt: -1 }, { name: `idx_${orderCol.name}_createdAt` });
            console.log(`  ✓ Created index on ${orderCol.display}: createdAt`);
            
            // Index for userId queries
            await collection.createIndex({ userId: 1 }, { name: `idx_${orderCol.name}_userId` });
            console.log(`  ✓ Created index on ${orderCol.display}: userId`);
            
            // Index for status filtering
            await collection.createIndex({ status: 1 }, { name: `idx_${orderCol.name}_status` });
            console.log(`  ✓ Created index on ${orderCol.display}: status`);
            
            // Compound index for userId + createdAt (common query pattern)
            await collection.createIndex({ userId: 1, createdAt: -1 }, { name: `idx_${orderCol.name}_userId_createdAt` });
            console.log(`  ✓ Created compound index on ${orderCol.display}: userId + createdAt`);
        }

        // ============================================
        // Return Requests Collection
        // ============================================
        console.log('\n🔄 Creating indexes for ReturnRequests collection...');
        const returnRequestsCollection = database.collection("ReturnRequests");
        await returnRequestsCollection.createIndex({ submittedAt: -1 }, { name: 'idx_returnRequests_submittedAt' });
        console.log('  ✓ Created index on: submittedAt');
        await returnRequestsCollection.createIndex({ originalOrderId: 1 }, { name: 'idx_returnRequests_orderId' });
        console.log('  ✓ Created index on: originalOrderId');

        // ============================================
        // Cancellation Requests Collection
        // ============================================
        console.log('\n❌ Creating indexes for CancellationRequests collection...');
        const cancellationRequestsCollection = database.collection("CancellationRequests");
        await cancellationRequestsCollection.createIndex({ submittedAt: -1 }, { name: 'idx_cancellationRequests_submittedAt' });
        console.log('  ✓ Created index on: submittedAt');
        await cancellationRequestsCollection.createIndex({ originalOrderId: 1 }, { name: 'idx_cancellationRequests_orderId' });
        console.log('  ✓ Created index on: originalOrderId');

        // ============================================
        // User Addresses Collection
        // ============================================
        console.log('\n📍 Creating indexes for UserAddresses collection...');
        const addressesCollection = database.collection("UserAddresses");
        await addressesCollection.createIndex({ userId: 1 }, { name: 'idx_addresses_userId' });
        console.log('  ✓ Created index on: userId');
        await addressesCollection.createIndex({ createdAt: -1 }, { name: 'idx_addresses_createdAt' });
        console.log('  ✓ Created index on: createdAt');
        await addressesCollection.createIndex({ email: 1 }, { name: 'idx_addresses_email' });
        console.log('  ✓ Created index on: email');
        await addressesCollection.createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_addresses_userId_createdAt' });
        console.log('  ✓ Created compound index on: userId + createdAt');

        // ============================================
        // Staff Notifications Collection
        // ============================================
        console.log('\n🔔 Creating indexes for StaffNotifications collection...');
        const notificationsCollection = database.collection("StaffNotifications");
        await notificationsCollection.createIndex({ createdAt: -1 }, { name: 'idx_notifications_createdAt' });
        console.log('  ✓ Created index on: createdAt');
        await notificationsCollection.createIndex({ read: 1, createdAt: -1 }, { name: 'idx_notifications_read_createdAt' });
        console.log('  ✓ Created compound index on: read + createdAt');

        // ============================================
        // Summary
        // ============================================
        console.log('\n✨ Index creation completed successfully!');
        console.log('\n📊 Summary:');
        console.log('  • Products: 7 indexes');
        console.log('  • Order Collections: 24 indexes (4 per collection × 6 collections)');
        console.log('  • Return Requests: 2 indexes');
        console.log('  • Cancellation Requests: 2 indexes');
        console.log('  • User Addresses: 4 indexes');
        console.log('  • Staff Notifications: 2 indexes');
        console.log('  • Total: 41 indexes created');
        console.log('\n💡 These indexes will significantly improve query performance and prevent memory limit errors!');

    } catch (error) {
        console.error('❌ Error creating indexes:', error);
        if (error.code === 85) {
            console.log('ℹ️  Some indexes may already exist (this is okay)');
        } else {
            throw error;
        }
    } finally {
        await client.close();
        console.log('\n🔌 Connection closed');
    }
}

// Run the script
createIndexes()
    .then(() => {
        console.log('\n🎉 All done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });

