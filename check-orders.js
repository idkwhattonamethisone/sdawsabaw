const { MongoClient } = require('mongodb');

// MongoDB connection string
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
const client = new MongoClient(uri);

async function checkOrders() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const database = client.db("MyProductsDb");
        const collection = database.collection("UserOrders");

        // Count total orders
        const totalOrders = await collection.countDocuments();
        console.log(`📊 Total orders in database: ${totalOrders}`);

        if (totalOrders > 0) {
            console.log('\n📦 Recent orders:');
            const recentOrders = await collection.find({})
                .sort({ createdAt: -1 })
                .limit(5)
                .toArray();

            recentOrders.forEach((order, index) => {
                console.log(`\n${index + 1}. Order ID: ${order._id}`);
                console.log(`   User: ${order.userId}`);
                console.log(`   Buyer: ${order.buyerinfo}`);
                console.log(`   Date: ${order.date_ordered}`);
                console.log(`   Items: ${order.itemsordered.length}`);
                console.log(`   Total: ₱${order.total}`);
                console.log(`   Status: ${order.status}`);
                if (order.migrated) {
                    console.log(`   📤 Migrated from localStorage`);
                }
            });
        } else {
            console.log('\n📭 No orders found in database');
            console.log('Try placing a test order or running the migration');
        }

        // Check for test orders and clean them up
        const testOrders = await collection.countDocuments({ test: true });
        if (testOrders > 0) {
            console.log(`\n🧪 Found ${testOrders} test orders, cleaning up...`);
            await collection.deleteMany({ test: true });
            console.log('✅ Test orders cleaned up');
        }

    } catch (error) {
        console.error('❌ Error checking orders:', error);
    } finally {
        await client.close();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

checkOrders(); 