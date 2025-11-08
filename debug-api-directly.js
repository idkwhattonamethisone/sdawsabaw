const { MongoClient } = require('mongodb');
const http = require('http');

async function debugApiVsDatabase() {
    console.log('🔍 Testing API vs Direct Database Access\n');
    
    // Test 1: Direct API call
    console.log('📡 Test 1: Calling API endpoint directly...');
    try {
        const response = await fetch('http://localhost:3000/api/orders/pending');
        const apiData = await response.json();
        console.log(`✅ API Response Status: ${response.status}`);
        console.log(`📊 API returned ${Array.isArray(apiData) ? apiData.length : 'non-array'} orders`);
        console.log('📦 API Data preview:', JSON.stringify(apiData.slice(0, 2), null, 2));
    } catch (error) {
        console.error('❌ API call failed:', error.message);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Direct MongoDB access (same as API)
    console.log('💾 Test 2: Direct MongoDB query (same as server code)...');
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const database = client.db("MyProductsDb");
        const collection = database.collection("UserOrders");
        
        // Test MongoDB connection
        console.log('🏓 Testing MongoDB connection...');
        await client.db("admin").command({ ping: 1 });
        console.log('✅ MongoDB ping successful');
        
        // Get total count
        const totalCount = await collection.countDocuments({});
        console.log(`📈 Total orders in database: ${totalCount}`);
        
        // Exact same query as server
        console.log('📋 Running exact server query: { status: "Pending" }');
        const pendingOrders = await collection.find({ status: "Pending" })
            .sort({ createdAt: -1 })
            .toArray();
        
        console.log(`✅ Direct query found ${pendingOrders.length} pending orders`);
        
        if (pendingOrders.length > 0) {
            console.log('📦 First 2 orders from direct query:');
            pendingOrders.slice(0, 2).forEach((order, index) => {
                console.log(`   ${index + 1}. ID: ${order._id}`);
                console.log(`      Buyer: ${order.buyerinfo}`);
                console.log(`      Status: "${order.status}"`);
                console.log(`      Total: ${order.total}`);
            });
        }
        
        console.log('\n🔍 Checking connection states...');
        console.log('Database name from direct connection:', database.databaseName);
        console.log('Collection name:', collection.collectionName);
        
    } catch (error) {
        console.error('❌ Direct MongoDB query failed:', error.message);
    } finally {
        await client.close();
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎯 SUMMARY:');
    console.log('If API returns 0 but direct query returns 15,');
    console.log('then the server MongoDB connection has an issue.');
}

// Handle fetch for Node.js
if (typeof fetch === 'undefined') {
    global.fetch = async (url) => {
        return new Promise((resolve, reject) => {
            const request = http.get(url, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    resolve({
                        status: response.statusCode,
                        json: async () => JSON.parse(data)
                    });
                });
            });
            request.on('error', reject);
        });
    };
}

debugApiVsDatabase(); 