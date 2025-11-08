const { MongoClient } = require('mongodb');

async function debugPendingOrders() {
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log("✅ Connected to MongoDB");
        
        const database = client.db("MyProductsDb");
        const collection = database.collection("UserOrders");
        
        // First, check all orders
        console.log("\n🔍 Checking all orders in the database...");
        const allOrders = await collection.find({}).toArray();
        console.log(`📊 Total orders in database: ${allOrders.length}`);
        
        // Check what statuses exist
        console.log("\n📈 Status breakdown:");
        const statusCounts = {};
        allOrders.forEach(order => {
            const status = order.status;
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        Object.keys(statusCounts).forEach(status => {
            console.log(`   "${status}": ${statusCounts[status]} orders`);
            console.log(`   Status length: ${status.length}, char codes: [${Array.from(status).map(c => c.charCodeAt(0)).join(', ')}]`);
        });
        
        // Try different variations of "Pending"
        console.log("\n🔍 Testing different Pending variations...");
        
        const variations = ["Pending", "pending", "PENDING", "Pending ", " Pending"];
        
        for (const variation of variations) {
            const count = await collection.countDocuments({ status: variation });
            if (count > 0) {
                console.log(`✅ Found ${count} orders with status: "${variation}"`);
                
                // Show first example
                const example = await collection.findOne({ status: variation });
                console.log(`   Example order: ${example._id} - "${example.buyerinfo}" - Status: "${example.status}"`);
            } else {
                console.log(`❌ No orders found with status: "${variation}"`);
            }
        }
        
        // Check for regex pattern
        console.log("\n🔍 Checking with regex (case-insensitive)...");
        const regexPending = await collection.find({ status: /pending/i }).toArray();
        console.log(`📋 Found ${regexPending.length} orders with status matching /pending/i`);
        
        if (regexPending.length > 0) {
            console.log("   Examples:");
            regexPending.slice(0, 3).forEach(order => {
                console.log(`   - ${order._id}: "${order.status}"`);
            });
        }
        
    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        await client.close();
        console.log("\n🔌 Database connection closed");
    }
}

debugPendingOrders(); 