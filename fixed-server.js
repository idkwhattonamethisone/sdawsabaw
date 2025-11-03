const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// MongoDB connection - using the WORKING connection pattern
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";

console.log("🚀 Starting server with working MongoDB connection...");

// API endpoint to get pending orders for staff - WORKING VERSION
app.get('/api/orders/pending', async (req, res) => {
    console.log('🔍 Pending orders endpoint hit!');
    
    const client = new MongoClient(uri);
    try {
        console.log('🔌 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB!');
        
        const database = client.db("MyProductsDb");
        const collection = database.collection("UserOrders");
        
        console.log('📊 Getting total order count...');
        const totalCount = await collection.countDocuments({});
        console.log(`📈 Total orders in database: ${totalCount}`);
        
        console.log('📋 Searching for orders with status: "Pending"');
        const pendingOrders = await collection.find({ status: "Pending" })
            .sort({ createdAt: -1 })
            .toArray();
        
        console.log(`✅ Found ${pendingOrders.length} pending orders`);
        
        if (pendingOrders.length > 0) {
            console.log('📦 First 3 orders:');
            pendingOrders.slice(0, 3).forEach((order, index) => {
                console.log(`   ${index + 1}. ${order._id} - ${order.buyerinfo} - ${order.status}`);
            });
        }
        
        res.json(pendingOrders);
        
    } catch (error) {
        console.error("❌ Error fetching pending orders:", error);
        res.status(500).json({ error: "Failed to fetch pending orders", details: error.message });
    } finally {
        await client.close();
    }
});

// API endpoint to update order status
app.put('/api/orders/:orderId/status', async (req, res) => {
    console.log(`🔄 Order status update requested for ${req.params.orderId}`);
    
    const client = new MongoClient(uri);
    try {
        const { ObjectId } = require('mongodb');
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ error: "Status is required" });
        }
        
        await client.connect();
        const database = client.db("MyProductsDb");
        const collection = database.collection("UserOrders");
        
        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.orderId) },
            { $set: { status: status } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        console.log(`✅ Order ${req.params.orderId} status updated to ${status}`);
        res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (error) {
        console.error("❌ Error updating order status:", error);
        res.status(500).json({ error: "Failed to update order status" });
    } finally {
        await client.close();
    }
});

// Keep the other endpoints for compatibility
app.get('/api/debug/test', (req, res) => {
    res.json({ message: 'Fixed server is working!', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
    console.log(`🌟 Fixed server running at http://localhost:${port}`);
    console.log("🔧 This version uses working MongoDB connections");
}); 