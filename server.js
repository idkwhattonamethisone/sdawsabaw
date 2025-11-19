const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { securityConfig, securityMiddleware } = require('./security-config');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 5500;

if (!process.env.MONGODB_URI) {
    console.error("❌ Missing required environment variable: MONGODB_URI");
    process.exit(1);
}

const databaseName = process.env.DATABASE_NAME || 'MyProductsDb';

// Security middleware
app.use(securityMiddleware.setSecurityHeaders);
app.use(securityMiddleware.rateLimit);
app.use(securityMiddleware.sanitizeInput);

// CORS configuration
app.use(cors(securityConfig.cors));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('.')); // Serve static files from current directory

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

async function connectToDatabase() {
    try {
        if (!client.topology || !client.topology.isConnected()) {
            await client.connect();
        }
        return client.db(databaseName);
    } catch (error) {
        console.error("❌ Database connection error:", error);
        throw error;
    }
}

// MongoDB connection string
const client = new MongoClient(process.env.MONGODB_URI);

// Connect to MongoDB
async function connectToMongo() {
    try {
        await client.connect();
        
        // Test the connection immediately
        await client.db("admin").command({ ping: 1 });
        
        // Test access to our database
        const database = client.db(databaseName);
        
        // Test all three order collections
        const pendingCollection = database.collection("PendingOrders");
        const acceptedCollection = database.collection("AcceptedOrders");
        const deliveredCollection = database.collection("DeliveredOrders");
        
        const pendingCount = await pendingCollection.countDocuments({});
        const acceptedCount = await acceptedCollection.countDocuments({});
        const deliveredCount = await deliveredCollection.countDocuments({});
        
        
    } catch (error) {
        console.error("❌ Error connecting to MongoDB:", error);
        console.error("❌ Error details:", error.message);
    }
}

// API endpoint to get all products (with optional limit, pagination, and category filter)
app.get('/api/products', async (req, res) => {
    try {
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        
        // Build query filter
        let queryFilter = { isActive: true };
        
        // Category filter support - optimized to avoid regex when possible
        if (req.query.category && req.query.category !== 'all') {
            // Support normalized category buckets
            const categoryMap = {
                'paints': { $regex: /paint|painting/i },
                'tools-accessories': { $regex: /power-tools|powertools|hand-tools|handtools|tool|tools|accessor/i },
                'building-materials-aggregates': { $regex: /building-materials|aggregate|cement|sand|gravel|hollow|plywood|wood|lumber|tile|roof/i },
                'electrical-supplies': { $regex: /electrical|wire|breaker|outlet|switch/i },
                'plumbing-fixtures': { $regex: /plumbing|fixture|pipe|fitting|faucet|valve/i },
                'fasteners-consumables': { $regex: /fastener|screw|nail|bolt|nut|consumable|adhesive|sealant|tape/i }
            };
            
            // Check if it's a normalized category
            if (categoryMap[req.query.category]) {
                queryFilter.category = categoryMap[req.query.category];
            } else {
                // Direct category match (case insensitive)
                queryFilter.category = { $regex: new RegExp(`^${req.query.category}$`, 'i') };
            }
        }
        
        // Parse pagination parameters with defaults
        const limit = req.query.limit ? parseInt(req.query.limit) : 12; // Default to 12 if not specified
        const skip = req.query.skip ? parseInt(req.query.skip) : 0;
        
        // Check if sorting should be skipped (for performance on index page)
        const skipSort = req.query.skipSort === 'true' || req.query.noSort === 'true';
        
        // Check if minimal fields should be returned (for list views - much faster)
        const minimalFields = req.query.minimal === 'true' || req.query.fields === 'minimal' || skipSort;
        
        // Define projection for minimal fields (only what's needed for list views)
        const minimalProjection = {
            _id: 1,
            name: 1,
            image: 1,
            SellingPrice: 1,
            sellingPrice: 1,
            Price: 1,
            price: 1,
            stockQuantity: 1,
            category: 1,
            isActive: 1
        };
        
        // Determine sort field and direction
        let sortField = 'name';
        let sortDirection = 1;
        if (!skipSort) {
            if (req.query.sortBy) {
                switch(req.query.sortBy) {
                    case 'price-low':
                        sortField = 'SellingPrice';
                        sortDirection = 1;
                        break;
                    case 'price-high':
                        sortField = 'SellingPrice';
                        sortDirection = -1;
                        break;
                    case 'name':
                        sortField = 'name';
                        sortDirection = 1;
                        break;
                }
            }
        }
        
        // Generate ETag for caching (based on query params only - check BEFORE database query)
        // This allows server to return 304 immediately without processing
        const crypto = require('crypto');
        const cacheKey = `${limit}-${skip}-${req.query.category || 'all'}-${req.query.sortBy || 'default'}-${skipSort}-${minimalFields}`;
        const etag = crypto.createHash('md5').update(cacheKey).digest('hex');
        
        // Set caching headers
        res.setHeader('Cache-Control', 'public, max-age=60'); // Cache for 60 seconds
        res.setHeader('ETag', `"${etag}"`);
        
        // Check If-None-Match header BEFORE database query - return 304 immediately if cached
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === `"${etag}"` || ifNoneMatch === etag) {
            return res.status(304).end();
        }
        
        // Use find() with sort for better performance when possible
        // Only use aggregation if we need complex operations
        let products;
        let totalCount;
        
        // Run count in parallel with the query for better performance
        const countPromise = req.query.includeMeta === 'true' 
            ? collection.countDocuments(queryFilter)
            : Promise.resolve(0);
        
        try {
            // Try using find() first - it's faster than aggregate for simple queries
            let query = collection.find(queryFilter);
            
            // Add projection for minimal fields if requested (dramatically reduces data transfer)
            if (minimalFields) {
                query = query.project(minimalProjection);
            }
            
            // Only add sort if not skipped (for performance)
            if (!skipSort) {
                query = query.sort({ [sortField]: sortDirection });
            }
            
            query = query.skip(skip).limit(limit);
            
            products = await query.toArray();
            totalCount = await countPromise;
            
        } catch (error) {
            // If find() fails (e.g., memory limit), fall back to aggregation with allowDiskUse
            if (error.code === 292 || error.codeName === 'QueryExceededMemoryLimitNoDiskUseAllowed') {
                console.warn('⚠️ Using aggregation fallback for products query');
                
                const pipeline = [
                    { $match: queryFilter }
                ];
                
                // Add projection for minimal fields if requested
                if (minimalFields) {
                    pipeline.push({ $project: minimalProjection });
                }
                
                // Only add sort if not skipped
                if (!skipSort) {
                    pipeline.push({ $sort: { [sortField]: sortDirection } });
                }
                
                pipeline.push({ $skip: skip });
                pipeline.push({ $limit: limit });
                
                try {
                    products = await collection.aggregate(pipeline, { allowDiskUse: true }).toArray();
                    totalCount = await countPromise;
                } catch (aggError) {
                    // Last resort: fetch limited batch and sort in memory
                    if (aggError.code === 292 || aggError.codeName === 'QueryExceededMemoryLimitNoDiskUseAllowed') {
                        console.warn('⚠️ allowDiskUse not supported, using in-memory sort fallback');
                        
                        // Fetch only what we need + a small buffer for pagination
                        const fetchLimit = Math.min(skip + limit + 100, 1000); // Max 1000 for performance
                        const noSortPipeline = [
                            { $match: queryFilter }
                        ];
                        
                        // Add projection for minimal fields if requested
                        if (minimalFields) {
                            noSortPipeline.push({ $project: minimalProjection });
                        }
                        
                        noSortPipeline.push({ $limit: fetchLimit });
                        
                        let fetchedProducts = await collection.aggregate(noSortPipeline).toArray();
                        
                        // Sort in memory
                        fetchedProducts.sort((a, b) => {
                            const aVal = a[sortField];
                            const bVal = b[sortField];
                            if (sortField === 'SellingPrice') {
                                const diff = (parseFloat(aVal) || 0) - (parseFloat(bVal) || 0);
                                return diff * sortDirection;
                            }
                            const diff = (aVal || '').localeCompare(bVal || '');
                            return diff * sortDirection;
                        });
                        
                        // Apply pagination
                        products = fetchedProducts.slice(skip, skip + limit);
                        totalCount = await countPromise;
                    } else {
                        throw aggError;
                    }
                }
            } else {
                throw error;
            }
        }
        
        // Return products with pagination metadata
        if (req.query.includeMeta === 'true') {
            res.json({
                products: products,
                totalCount: totalCount,
                currentPage: Math.floor(skip / limit) + 1,
                totalPages: Math.ceil(totalCount / limit)
            });
        } else {
            res.json(products);
        }
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

// API endpoint to get a single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        const product = await collection.findOne({ 
            _id: new ObjectId(req.params.id), 
            isActive: true 
        });
        
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        
        res.json(product);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ error: "Failed to fetch product" });
    }
});

// API endpoint to bulk update stock (for checkout) - MUST BE BEFORE :id route
app.put('/api/products/bulk-stock', async (req, res) => {
    
    try {
        const { ObjectId } = require('mongodb');
        const { updates } = req.body; // Array of {id, quantity} objects
        
        
        if (!updates) {
            console.error('❌ No updates provided in request body');
            return res.status(400).json({ error: "Updates field is required" });
        }
        
        if (!Array.isArray(updates)) {
            console.error('❌ Updates is not an array:', updates);
            return res.status(400).json({ error: "Updates must be an array" });
        }
        
        
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        
        // Process each update
        const results = [];
        for (let i = 0; i < updates.length; i++) {
            const update = updates[i];
            
            // Validate the update object
            if (!update.id || typeof update.quantity !== 'number') {
                console.error('❌ Invalid update object:', update);
                return res.status(400).json({ error: "Each update must have id and quantity" });
            }
            
            // Check if the product exists first
            const existingProduct = await collection.findOne({ _id: new ObjectId(update.id) });
            if (!existingProduct) {
                console.error(`❌ Product not found: ${update.id}`);
                return res.status(404).json({ error: `Product not found: ${update.id}` });
            }
            
            
            // Check if there's enough stock
            if (existingProduct.stockQuantity < update.quantity) {
                console.error(`❌ Insufficient stock for ${existingProduct.name}. Available: ${existingProduct.stockQuantity}, Requested: ${update.quantity}`);
                return res.status(400).json({ 
                    error: `Insufficient stock for ${existingProduct.name}. Available: ${existingProduct.stockQuantity}, Requested: ${update.quantity}` 
                });
            }
            
            // Update the stock
            const result = await collection.updateOne(
                { _id: new ObjectId(update.id) },
                { $inc: { stockQuantity: -update.quantity } }
            );
            
            results.push(result);
        }
        
        res.json({ success: true, message: "Stock updated successfully", results });
    } catch (error) {
        console.error("❌ Error updating bulk stock:", error);
        console.error("❌ Error stack:", error.stack);
        res.status(500).json({ error: "Failed to update bulk stock", details: error.message });
    }
});

// API endpoint to update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const updateData = req.body;
        
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        
        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Product not found" });
        }
        
        res.json({ success: true, message: "Product updated successfully" });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: "Failed to update product" });
    }
});

// API endpoint to update product stock
app.put('/api/products/:id/stock', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { quantity } = req.body;
        
        if (typeof quantity !== 'number' || quantity < 0) {
            return res.status(400).json({ error: "Invalid quantity" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        
        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { stockQuantity: quantity } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Product not found" });
        }
        
        res.json({ success: true, message: "Stock updated successfully" });
    } catch (error) {
        console.error("Error updating stock:", error);
        res.status(500).json({ error: "Failed to update stock" });
    }
});

// API endpoint to validate stock availability before checkout
app.post('/api/products/validate-stock', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { items } = req.body; // Array of {id, quantity} objects
        
        
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: "Items array is required" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        
        const validationResults = [];
        let allValid = true;
        
        for (const item of items) {
            if (!item.id || typeof item.quantity !== 'number') {
                return res.status(400).json({ error: "Each item must have id and quantity" });
            }
            
            const product = await collection.findOne({ _id: new ObjectId(item.id) });
            
            if (!product) {
                validationResults.push({
                    id: item.id,
                    name: 'Unknown Product',
                    requestedQuantity: item.quantity,
                    availableStock: 0,
                    valid: false,
                    error: 'Product not found'
                });
                allValid = false;
                continue;
            }
            
            const isValid = product.stockQuantity >= item.quantity;
            if (!isValid) allValid = false;
            
            validationResults.push({
                id: item.id,
                name: product.name,
                requestedQuantity: item.quantity,
                availableStock: product.stockQuantity,
                valid: isValid,
                error: isValid ? null : 'Insufficient stock'
            });
        }
        
        
        res.json({
            success: true,
            allValid: allValid,
            items: validationResults
        });
        
    } catch (error) {
        console.error("❌ Error validating stock:", error);
        res.status(500).json({ error: "Failed to validate stock" });
    }
});

// API endpoint to reserve stock temporarily (for checkout process)
app.post('/api/products/reserve-stock', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { items, reservationId, expiresInMinutes = 15 } = req.body;
        
        
        if (!items || !Array.isArray(items) || !reservationId) {
            return res.status(400).json({ error: "Items array and reservationId are required" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        const reservationsCollection = database.collection("StockReservations");
        
        const expiresAt = new Date(Date.now() + (expiresInMinutes * 60 * 1000));
        
        // Create reservation record
        const reservation = {
            reservationId: reservationId,
            items: items,
            createdAt: new Date(),
            expiresAt: expiresAt,
            status: 'active'
        };
        
        await reservationsCollection.insertOne(reservation);
        
        
        res.json({
            success: true,
            reservationId: reservationId,
            expiresAt: expiresAt,
            message: `Stock reserved for ${expiresInMinutes} minutes`
        });
        
    } catch (error) {
        console.error("❌ Error reserving stock:", error);
        res.status(500).json({ error: "Failed to reserve stock" });
    }
});

// API endpoint to restore stock (for cancelled orders)
app.post('/api/products/restore-stock', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { items, reason = 'Order cancelled' } = req.body;
        
        
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: "Items array is required" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        
        const results = [];
        
        for (const item of items) {
            if (!item.id || typeof item.quantity !== 'number') {
                return res.status(400).json({ error: "Each item must have id and quantity" });
            }
            
            const product = await collection.findOne({ _id: new ObjectId(item.id) });
            
            if (!product) {
                console.error(`❌ Product not found for restoration: ${item.id}`);
                continue;
            }
            
            // Restore stock by adding the quantity back
            const result = await collection.updateOne(
                { _id: new ObjectId(item.id) },
                { $inc: { stockQuantity: item.quantity } }
            );
            
            results.push({
                productId: item.id,
                productName: product.name,
                restoredQuantity: item.quantity,
                newStock: product.stockQuantity + item.quantity
            });
        }
        
        
        res.json({
            success: true,
            message: `Stock restored for ${results.length} products`,
            reason: reason,
            results: results
        });
        
    } catch (error) {
        console.error("❌ Error restoring stock:", error);
        res.status(500).json({ error: "Failed to restore stock" });
    }
});

// API endpoint to get current stock levels for multiple products
app.post('/api/products/stock-levels', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { productIds } = req.body;
        
        if (!productIds || !Array.isArray(productIds)) {
            return res.status(400).json({ error: "Product IDs array is required" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("Products");
        
        const objectIds = productIds.map(id => new ObjectId(id));
        const products = await collection.find(
            { _id: { $in: objectIds } },
            { projection: { _id: 1, name: 1, stockQuantity: 1, isActive: 1 } }
        ).toArray();
        
        const stockLevels = products.map(product => ({
            id: product._id.toString(),
            name: product.name,
            stockQuantity: product.stockQuantity,
            isActive: product.isActive
        }));
        
        res.json({
            success: true,
            stockLevels: stockLevels
        });
        
    } catch (error) {
        console.error("Error fetching stock levels:", error);
        res.status(500).json({ error: "Failed to fetch stock levels" });
    }
});

// Debug endpoint to test connectivity
app.get('/api/debug/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// API endpoint to save an order
app.post('/api/orders', async (req, res) => {
    try {
        console.log('Request body keys:', Object.keys(req.body));
        
        // Handle both old format (userId, order) and new format (direct order data)
        let orderData;
        if (req.body.userId && req.body.order) {
            // Old format
            orderData = { userId: req.body.userId, ...req.body.order };
        } else {
            // New format from checkout
            orderData = req.body;
        }
        
        
        if (!orderData.userId) {
            return res.status(400).json({ error: "Missing userId" });
        }
        
        if (!orderData.cartItems || !Array.isArray(orderData.cartItems)) {
            return res.status(400).json({ error: "Missing or invalid cartItems" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        // Normalize category bucket for each cart item
        const normalizeCategory = (raw) => {
            const val = String(raw || '').toLowerCase();
            const includesAny = (list) => list.some(k => val.includes(k));
            if (includesAny(['paint','painting'])) return 'paints';
            if (includesAny(['power-tools','powertools','hand-tools','handtools','tool','tools','accessor'])) return 'tools-accessories';
            if (includesAny(['building-materials','aggregate','cement','sand','gravel','hollow','plywood','wood','lumber','tile','roof'])) return 'building-materials-aggregates';
            if (includesAny(['electrical','wire','breaker','outlet','switch'])) return 'electrical-supplies';
            if (includesAny(['plumbing','fixture','pipe','fitting','faucet','valve'])) return 'plumbing-fixtures';
            if (includesAny(['fastener','screw','nail','bolt','nut','consumable','adhesive','sealant','tape'])) return 'fasteners-consumables';
            switch (String(raw || '')) {
                case 'Power-Tools':
                case 'Hand-Tools':
                    return 'tools-accessories';
                case 'Building-Materials':
                    return 'building-materials-aggregates';
                case 'Plumbing':
                    return 'plumbing-fixtures';
                case 'Electrical':
                    return 'electrical-supplies';
                default:
                    return 'other';
            }
        };

        // Format the order for the database
        const formattedOrder = {
            userId: orderData.userId,
            orderNumber: orderData.orderNumber || `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            
            // Customer Information
            fullName: orderData.fullName || '',
            email: orderData.email || '',
            phoneNumber: orderData.phoneNumber || '',
            
            // Order Items
            itemsordered: orderData.cartItems.map(item => ({
                item_name: item.name || 'Unknown Item',
                amount_per_item: item.quantity || 1,
                price_per_item: item.price || 0,
                total_item_price: (item.price || 0) * (item.quantity || 1),
                item_id: item.id || null,
                item_image: item.image || null, // Include item image
                category_bucket: item.categoryBucket || normalizeCategory(item.category),
                category_original: item.categoryOriginal || item.category || 'unknown'
            })),
            
            // Address Information
            address: orderData.address || '',
            
            // Payment Information
            paymentMethod: orderData.paymentMethod || '',
            paymentType: orderData.paymentType || null, // Full payment or Split payment
            paymentSplitPercent: orderData.paymentSplitPercent || null, // Percentage for split payments
            paymentReference: orderData.paymentReference || '',
            paymentAmount: parseFloat(orderData.paymentAmount) || 0,
            changeUponDelivery: orderData.changeUponDelivery || false, // Toggle for change upon delivery
            proofOfPayment: orderData.proofOfPayment || null,
            
            // Order Details
            subtotal: parseFloat(orderData.subtotal) || 0, // Subtotal before delivery fee
            deliveryFee: parseFloat(orderData.deliveryFee) || 0, // Delivery fee amount
            total: parseFloat(orderData.total) || 0,
            notes: orderData.notes || 'no additional notes',
            status: orderData.status || 'active',
            
            // Dates
            orderDate: orderData.orderDate || new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            
            // Additional metadata
            source: 'checkout_page'
        };
        
        console.log('Order number:', formattedOrder.orderNumber);
        console.log('Customer:', formattedOrder.fullName);
        console.log('Status:', formattedOrder.status);
        console.log('Items count:', formattedOrder.itemsordered.length);
        
        const result = await collection.insertOne(formattedOrder);
        
        
        res.json({ 
            success: true, 
            message: "Order saved successfully", 
            orderId: result.insertedId,
            orderNumber: formattedOrder.orderNumber
        });
        
    } catch (error) {
        console.error("❌ Error saving order:", error);
        console.error("Error details:", error.message);
        res.status(500).json({ error: "Failed to save order", details: error.message });
    }
});

// API endpoint to get pending orders for staff (MUST come before /:userId route)
app.get('/api/orders/pending', async (req, res) => {
    try {
        await client.db("admin").command({ ping: 1 });
        
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        const totalCount = await collection.countDocuments({});
        
        
        // First, let's see what statuses actually exist
        const allStatuses = await collection.distinct("status");
        
        // Check for both "Pending" and "pending" (case sensitive issue?)
        const pendingUpperCase = await collection.find({ status: "Pending" }).toArray();
        const pendingLowerCase = await collection.find({ status: "pending" }).toArray();
        
        
        // Return orders with status "Pending" or "active" - include new active orders
        const pendingOrders = await collection.aggregate([
            { 
                $match: { 
                    $or: [
                        { status: "Pending" },
                        { status: "pending" },
                        { status: "active" }
                    ]
                }
            },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
        
        // Map the orders to the required format
        const formattedOrders = pendingOrders.map(order => ({
            id: order._id,
            buyer: order.fullName,
            status: order.status,
            total: order.total
        }));
        
        res.json(formattedOrders);
    } catch (error) {
        console.error("❌ Error fetching pending orders:", error);
        console.error("❌ Error details:", error.message);
        console.error("❌ Error stack:", error.stack);
        res.status(500).json({ error: "Failed to fetch pending orders", details: error.message });
    }
});

// API endpoint to get comprehensive staff statistics from all collections including walk-ins
app.get('/api/orders/stats/staff-overview', async (req, res) => {
    try {
        
        const database = client.db(databaseName);
        
        // Get counts from all collections
        const pendingCollection = database.collection("PendingOrders");
        const acceptedCollection = database.collection("AcceptedOrders");
        const deliveredCollection = database.collection("DeliveredOrders");
        
        // Count all orders in each collection
        const totalPending = await pendingCollection.countDocuments({});
        const totalAccepted = await acceptedCollection.countDocuments({});
        const totalDelivered = await deliveredCollection.countDocuments({});
        
        
        // Calculate total revenue from both accepted and delivered orders
        const acceptedOrders = await acceptedCollection.find({}).toArray();
        const deliveredOrders = await deliveredCollection.find({}).toArray();
        
        const totalRevenue = [
            ...acceptedOrders,
            ...deliveredOrders
        ].reduce((sum, order) => {
            return sum + (parseFloat(order.total) || 0);
        }, 0);
        
        const stats = {
            totalPending,
            totalAccepted, 
            totalDelivered,
            totalRevenue,
            totalOrders: totalPending + totalAccepted + totalDelivered
        };
        
        
        res.json(stats);
    } catch (error) {
        console.error("Error fetching staff comprehensive statistics:", error);
        res.status(500).json({ error: "Failed to fetch staff comprehensive statistics" });
    }
});

// API endpoint to get orders statistics for a user (by userId, email, or fullName)
app.get('/api/orders/stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get email and fullName from query parameters if provided
        const { email, fullName } = req.query;
        
        // Handle both string and number userIds
        const userIdAsString = String(userId);
        const userIdAsNumber = isNaN(userId) ? null : Number(userId);
        
        // Build query that matches by userId, email, or fullName
        const queryConditions = [];
        
        // Add userId conditions only if userId is not 'by-email' and is a valid identifier
        if (userId !== 'by-email') {
            if (userIdAsNumber !== null) {
                queryConditions.push({ userId: userIdAsString }, { userId: userIdAsNumber });
            } else {
                queryConditions.push({ userId: userIdAsString });
            }
        }
        
        // Add email condition if provided
        if (email) {
            queryConditions.push({ email: email });
        }
        
        // Add fullName condition if provided
        if (fullName) {
            queryConditions.push({ fullName: fullName });
        }
        
        // Create query with $or to match any condition, or use single condition if only one
        const userQuery = queryConditions.length > 1 ? { $or: queryConditions } : (queryConditions.length === 1 ? queryConditions[0] : {});
        
        const database = client.db(databaseName);
        
        // Count orders in each collection
        const pendingCount = await database.collection("PendingOrders").countDocuments(userQuery);
        const acceptedCount = await database.collection("AcceptedOrders").countDocuments(userQuery);
        const deliveredCount = await database.collection("DeliveredOrders").countDocuments(userQuery);
        const walkInCount = await database.collection("WalkInOrders").countDocuments(userQuery);
        
        const cancellationQueryConditions = [];
        if (userId !== 'by-email') {
            if (userIdAsNumber !== null) {
                cancellationQueryConditions.push(
                    { userId: userIdAsNumber },
                    { userIdString: userIdAsString },
                    { userIdNumber: userIdAsNumber }
                );
            } else {
                cancellationQueryConditions.push(
                    { userId: userIdAsString },
                    { userIdString: userIdAsString }
                );
            }
        }

        if (email) {
            cancellationQueryConditions.push({ customerEmail: email });
        }

        if (fullName) {
            cancellationQueryConditions.push({ customerName: fullName });
        }

        const cancellationQuery = cancellationQueryConditions.length > 1
            ? { $or: cancellationQueryConditions }
            : (cancellationQueryConditions.length === 1 ? cancellationQueryConditions[0] : {});

        const cancellationCount = await database.collection("CancellationRequests").countDocuments(cancellationQuery);
        
        // Calculate total spent across all collections
        const collections = [
            { name: "PendingOrders", collection: database.collection("PendingOrders") },
            { name: "AcceptedOrders", collection: database.collection("AcceptedOrders") },
            { name: "DeliveredOrders", collection: database.collection("DeliveredOrders") },
            { name: "WalkInOrders", collection: database.collection("WalkInOrders") }
        ];
        
        let totalSpent = 0;
        for (const { collection } of collections) {
            const orders = await collection.find(userQuery).toArray();
            for (const order of orders) {
                totalSpent += parseFloat(order.total) || 0;
            }
        }
        
        res.json({
            totalOrders: pendingCount + acceptedCount + deliveredCount + walkInCount + cancellationCount,
            pendingOrders: pendingCount,
            approvedOrders: acceptedCount,
            deliveredOrders: deliveredCount,
            walkInOrders: walkInCount,
            cancellationRequests: cancellationCount,
            totalSpent: totalSpent
        });
    } catch (error) {
        console.error("Error fetching order statistics:", error);
        res.status(500).json({ error: "Failed to fetch order statistics" });
    }
});

// API endpoint to get all orders from all collections for staff dashboard
app.get('/api/orders/all-staff', async (req, res) => {
    try {
        console.log('🎯 HIT: /api/orders/all-staff endpoint - this is the correct route!');
        
        const minimal = req.query.minimal === 'true';
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
        
        const database = client.db(databaseName);
        const pendingCollection = database.collection("PendingOrders");
        const acceptedCollection = database.collection("AcceptedOrders");
        const deliveredCollection = database.collection("DeliveredOrders");
        const walkInCollection = database.collection("WalkInOrders");
        const returnedCollection = database.collection("ReturnedOrders");
        
        const minimalProjection = {
            _id: 1,
            orderNumber: 1,
            buyerinfo: 1,
            fullName: 1,
            email: 1,
            phoneNumber: 1,
            total: 1,
            status: 1,
            paymentMethod: 1,
            paymentType: 1,
            paymentAmount: 1,
            paymentSplitPercent: 1,
            changeUponDelivery: 1,
            paymentVerified: 1,
            address: 1,
            delivery_address: 1,
            notes: 1,
            createdAt: 1,
            orderDate: 1,
            original_date: 1,
            deliveryFee: 1,
            serviceFee: 1,
            itemsordered: {
                $map: {
                    input: { $ifNull: ['$itemsordered', []] },
                    as: 'item',
                    in: {
                        item_name: '$$item.item_name',
                        amount_per_item: '$$item.amount_per_item',
                        per_item_price: '$$item.per_item_price',
                        total_item_price: '$$item.total_item_price',
                        unit: '$$item.unit'
                    }
                }
            },
            hasProofOfPayment: {
                $gt: [
                    { $strLenCP: { $ifNull: ['$proofOfPayment', ''] } },
                    0
                ]
            }
        };
        
        const buildPipeline = () => {
            const pipeline = [{ $match: {} }];
            if (minimal) {
                pipeline.push({ $project: minimalProjection });
            }
            pipeline.push({ $sort: { createdAt: -1 } });
            if (limit && limit > 0) {
                pipeline.push({ $limit: limit });
            }
            return pipeline;
        };
        
        const pipeline = buildPipeline();
        
        // Fetch orders from collections (including returned orders)
        const [pendingOrders, acceptedOrders, deliveredOrders, walkInOrders, returnedOrders] = await Promise.all([
            pendingCollection.aggregate(pipeline, { allowDiskUse: true }).toArray(),
            acceptedCollection.aggregate(pipeline, { allowDiskUse: true }).toArray(),
            deliveredCollection.aggregate(pipeline, { allowDiskUse: true }).toArray(),
            walkInCollection.aggregate(pipeline, { allowDiskUse: true }).toArray(),
            returnedCollection.aggregate(pipeline, { allowDiskUse: true }).toArray()
        ]);
        
        const enhanceOrder = (order, collection, displayStatus) => {
            const base = {
                ...order,
                collection,
                displayStatus
            };
            
            if (minimal) {
                return {
                    ...base,
                    hasProofOfPayment: order.hasProofOfPayment || false,
                    proofOfPayment: undefined
                };
            }
            
            return base;
        };
        
        // Add collection info to each order for identification
        const allOrders = [
            ...pendingOrders.map(order => enhanceOrder(order, 'pending', order.status === 'active' ? 'pending' : order.status)),
            ...acceptedOrders.map(order => enhanceOrder(order, 'accepted', 'approved')),
            ...deliveredOrders.map(order => enhanceOrder(order, 'delivered', 'delivered')),
            ...walkInOrders.map(order => enhanceOrder(order, 'walkin', 'completed')),
            ...returnedOrders.map(order => {
                const enhanced = enhanceOrder(order, 'returned', 'returned');
                enhanced.isReturned = true; // Flag for view-only
                // Map return-specific fields to standard order fields for display
                enhanced.originalOrderId = order.originalOrderId;
                enhanced.returnReason = order.customerReason || order.returnReason;
                enhanced.returnType = order.returnType;
                enhanced.returnedAt = order.processedAt || order.returnedAt;
                enhanced.returnProcessedBy = order.processedBy || 'staff';
                enhanced.staffNotes = order.staffNotes;
                enhanced.staffDecisionImage = order.staffDecisionImage;
                enhanced.customerImage = order.customerImage;
                enhanced.staffDecision = order.staffDecision || order.status;
                // If originalOrderSnapshot exists, merge its fields for display
                if (order.originalOrderSnapshot) {
                    const original = order.originalOrderSnapshot;
                    // Merge order fields from original snapshot
                    enhanced.itemsordered = original.itemsordered || enhanced.itemsordered;
                    enhanced.fullName = original.fullName || enhanced.fullName || order.customerName;
                    enhanced.buyerinfo = original.buyerinfo || enhanced.buyerinfo;
                    enhanced.email = original.email || enhanced.email || order.customerEmail;
                    enhanced.phoneNumber = original.phoneNumber || enhanced.phoneNumber || order.customerPhone;
                    enhanced.address = original.address || enhanced.address;
                    enhanced.delivery_address = original.delivery_address || enhanced.delivery_address;
                    enhanced.total = original.total || enhanced.total;
                    enhanced.subtotal = original.subtotal || enhanced.subtotal;
                    enhanced.deliveryFee = original.deliveryFee || enhanced.deliveryFee;
                    enhanced.serviceFee = original.serviceFee || enhanced.serviceFee;
                    enhanced.paymentMethod = original.paymentMethod || enhanced.paymentMethod;
                    enhanced.paymentType = original.paymentType || enhanced.paymentType;
                    enhanced.paymentAmount = original.paymentAmount || enhanced.paymentAmount;
                    enhanced.paymentSplitPercent = original.paymentSplitPercent || enhanced.paymentSplitPercent;
                    enhanced.changeUponDelivery = original.changeUponDelivery !== undefined ? original.changeUponDelivery : enhanced.changeUponDelivery;
                    enhanced.paymentVerified = original.paymentVerified !== undefined ? original.paymentVerified : enhanced.paymentVerified;
                    enhanced.notes = original.notes || enhanced.notes;
                    enhanced.createdAt = original.createdAt || enhanced.createdAt || order.submittedAt;
                    enhanced.orderDate = original.orderDate || enhanced.orderDate;
                    enhanced.original_date = original.original_date || enhanced.original_date;
                    enhanced.proofOfPayment = original.proofOfPayment || enhanced.proofOfPayment;
                    enhanced.userId = original.userId || enhanced.userId;
                }
                return enhanced;
            })
        ];
        
        // Sort all orders by creation date (newest first)
        allOrders.sort((a, b) => new Date(b.createdAt || b.orderDate || b.returnedAt) - new Date(a.createdAt || a.orderDate || a.returnedAt));
        
        res.json(allOrders);
        
    } catch (error) {
        console.error("❌ Error fetching all orders for staff:", error);
        res.status(500).json({ error: "Failed to fetch all orders for staff dashboard" });
    }
});

// API endpoint to get detailed order information (search across collections)
app.get('/api/orders/details/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const database = client.db(databaseName);
        
        const collections = [
            { name: 'pending', displayStatus: 'pending', collection: database.collection("PendingOrders") },
            { name: 'accepted', displayStatus: 'approved', collection: database.collection("AcceptedOrders") },
            { name: 'delivered', displayStatus: 'delivered', collection: database.collection("DeliveredOrders") },
            { name: 'walkin', displayStatus: 'completed', collection: database.collection("WalkInOrders") },
            { name: 'returned', displayStatus: 'returned', collection: database.collection("ReturnedOrders") }
        ];
        
        let detailedOrder = null;
        
        for (const { name, displayStatus, collection } of collections) {
            let found = null;
            try {
                found = await collection.findOne({ _id: new ObjectId(orderId) });
            } catch (error) {
                // Ignore ObjectId errors and try next collection
            }
            
            if (found) {
                detailedOrder = {
                    ...found,
                    collection: name,
                    displayStatus: found.displayStatus || displayStatus
                };
                break;
            }
        }
        
        if (!detailedOrder) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        res.json(detailedOrder);
    } catch (error) {
        console.error("❌ Error fetching order details:", error);
        res.status(500).json({ error: "Failed to fetch order details" });
    }
});

// API endpoint to get return requests for staff review
app.get('/api/orders/return-requests', async (req, res) => {
    try {
        const database = client.db(databaseName);
        const returnRequestsCollection = database.collection("ReturnRequests");

        const returnRequests = await returnRequestsCollection.aggregate([
            { $match: {} },
            { $sort: { submittedAt: -1 } }
        ], { allowDiskUse: true }).toArray();

        res.json({
            success: true,
            count: returnRequests.length,
            returnRequests: returnRequests
        });

    } catch (error) {
        console.error("❌ Error fetching return requests:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch return requests",
            error: error.message
        });
    }
});

// API endpoint to get all user orders from all collections (by userId, email, or fullName)
app.get('/api/orders/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Add special check for all-staff
        if (userId === 'all-staff') {
            console.log('❌ ERROR: all-staff request is hitting the wrong route! This should go to /api/orders/all-staff');
            return res.status(400).json({ 
                error: "This endpoint is for specific user orders. Use /api/orders/all-staff for staff dashboard orders." 
            });
        }
        
        // Get email and fullName from query parameters if provided
        const { email, fullName } = req.query;
        
        // Handle both string and number userIds
        const userIdAsString = String(userId);
        const userIdAsNumber = isNaN(userId) ? null : Number(userId);
        
        const database = client.db(databaseName);
        
        // Fetch from all order collections
        const pendingCollection = database.collection("PendingOrders");
        const acceptedCollection = database.collection("AcceptedOrders");
        const deliveredCollection = database.collection("DeliveredOrders");
        const walkInCollection = database.collection("WalkInOrders");
        
        // Build query that matches by userId, email, or fullName
        const queryConditions = [];
        
        // Add userId conditions only if userId is not 'by-email' and is a valid identifier
        if (userId !== 'by-email') {
            if (userIdAsNumber !== null) {
                queryConditions.push({ userId: userIdAsString }, { userId: userIdAsNumber });
            } else {
                queryConditions.push({ userId: userIdAsString });
            }
        }
        
        // Add email condition if provided
        if (email) {
            queryConditions.push({ email: email });
        }
        
        // Add fullName condition if provided
        if (fullName) {
            queryConditions.push({ fullName: fullName });
        }
        
        // Create query with $or to match any condition, or use single condition if only one
        const userQuery = queryConditions.length > 1 ? { $or: queryConditions } : (queryConditions.length === 1 ? queryConditions[0] : {});
        
        // Get orders from each collection
        const pendingOrders = await pendingCollection.aggregate([
            { $match: userQuery },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
        
        const acceptedOrders = await acceptedCollection.aggregate([
            { $match: userQuery },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
            
        const deliveredOrders = await deliveredCollection.aggregate([
            { $match: userQuery },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
        
        const walkInOrders = await walkInCollection.aggregate([
            { $match: userQuery },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
        
        
        // Debug: Show what userIds exist in the pending collection
        const allPendingOrders = await pendingCollection.find({}).toArray();
        const existingUserIds = [...new Set(allPendingOrders.map(order => order.userId))];
        
        // Add status to each order based on collection
        const pendingWithStatus = pendingOrders.map(order => ({
            ...order,
            status: order.status || 'pending',
            collection: 'pending'
        }));

        const acceptedWithStatus = acceptedOrders.map(order => ({
            ...order,
            status: order.status || 'approved',
            collection: 'accepted'
        }));

        const deliveredWithStatus = deliveredOrders.map(order => ({
            ...order,
            status: order.status || 'delivered',
            collection: 'delivered'
        }));

        const walkInWithStatus = walkInOrders.map(order => ({
            ...order,
            status: order.status || 'completed',
            collection: 'walkin'
        }));

        const normalizeCancellationStatus = (status) => {
            const statusLower = (status || '').toLowerCase();
            switch (statusLower) {
                case 'pending_review':
                case 'pending':
                    return 'cancel_requested';
                case 'approved':
                    return 'cancel_approved';
                case 'rejected':
                    return 'cancel_rejected';
                case 'processed':
                    return 'cancel_processed';
                default:
                    return statusLower || 'cancel_requested';
            }
        };

        // Ensure cancellationRequests exists by querying the collection
        let cancellationRequests = [];
        try {
            const cancellationQueryConditions = [];
            if (userId !== 'by-email') {
                if (userIdAsNumber !== null) {
                    cancellationQueryConditions.push(
                        { userId: userIdAsNumber },
                        { userIdString: userIdAsString },
                        { userIdNumber: userIdAsNumber }
                    );
                } else {
                    cancellationQueryConditions.push(
                        { userId: userIdAsString },
                        { userIdString: userIdAsString }
                    );
                }
            }
            if (email) {
                cancellationQueryConditions.push({ customerEmail: email });
            }
            if (fullName) {
                cancellationQueryConditions.push({ customerName: fullName });
            }
            const cancellationQuery = cancellationQueryConditions.length > 1
                ? { $or: cancellationQueryConditions }
                : (cancellationQueryConditions.length === 1 ? cancellationQueryConditions[0] : {});
            cancellationRequests = await database
                .collection("CancellationRequests")
                .aggregate([
                    { $match: cancellationQuery },
                    { $sort: { submittedAt: -1 } }
                ], { allowDiskUse: true }).toArray();
        } catch (e) {
            console.error('❌ Error fetching CancellationRequests:', e);
            cancellationRequests = [];
        }

        const cancellationWithStatus = cancellationRequests.map(request => {
            const normalizedStatus = normalizeCancellationStatus(request.status);
            const payment = request.payment || {};
            return {
                ...request,
                status: normalizedStatus,
                displayStatus: normalizedStatus,
                collection: 'cancellation',
                fullName: request.customerName || request.fullName,
                email: request.customerEmail || request.email,
                itemsordered: Array.isArray(request.itemsordered) ? request.itemsordered : [],
                payment,
                paymentMethod: request.paymentMethod || payment.method || null,
                paymentType: request.paymentType || payment.type || null,
                paymentSplitPercent: request.paymentSplitPercent || payment.splitPercent || null,
                paymentReference: request.paymentReference || payment.reference || null,
                paymentAmount: request.paymentAmount || payment.amount || null,
                changeUponDelivery: request.changeUponDelivery || payment.changeUponDelivery || null,
                proofOfPayment: request.proofOfPayment || payment.proof || null,
                address: request.address || (request.shipping && request.shipping.address) || null,
                phoneNumber: request.phoneNumber || (request.shipping && request.shipping.phoneNumber) || null,
                total: request.originalOrderTotal ?? request.total ?? 0,
                orderDate: request.submittedAt || request.originalOrderDate,
                createdAt: request.submittedAt || request.originalOrderDate,
                originalOrderDate: request.originalOrderDate || null,
                hasPendingCancellation: normalizedStatus === 'cancel_requested'
            };
        });

        // Combine all orders
        const allOrders = [...pendingWithStatus, ...acceptedWithStatus, ...deliveredWithStatus, ...walkInWithStatus, ...cancellationWithStatus];
        
        // Debug logging to help trace 500s
        try {
            console.log('[User Orders] totals => pending:', pendingOrders.length, 'accepted:', acceptedOrders.length, 'delivered:', deliveredOrders.length, 'walkin:', walkInOrders.length, 'cancellations:', cancellationRequests.length);
        } catch (e) {}
        
        // Convert to the format expected by the frontend
        let formattedOrders = [];
        try {
            formattedOrders = allOrders.map((order, idx) => {
                const itemsArray = Array.isArray(order.itemsordered) ? order.itemsordered : [];
                const safePayment = order.payment || null;
                const safeDate = order.orderDate || order.createdAt || order.submittedAt || order.originalOrderDate || null;
                const safeShippingPhone = (order && order.phoneNumber) || (order && order.shipping && order.shipping.phoneNumber) || '';
                const safeAddress = (order && order.address) || (order && order.shipping && order.shipping.address) || null;
                return {
                    items: itemsArray.map(item => ({
                        name: item && item.item_name,
                        quantity: item && item.amount_per_item,
                        price: item && item.price_per_item,
                        image: (item && item.item_image) || null
                    })),
                    date: safeDate,
                    status: order && order.status,
                    payment: safePayment,
                    paymentMethod: order && order.paymentMethod,
                    paymentType: order && order.paymentType,
                    paymentSplitPercent: order && order.paymentSplitPercent,
                    paymentReference: order && order.paymentReference,
                    paymentAmount: order && order.paymentAmount,
                    changeUponDelivery: order && order.changeUponDelivery,
                    proofOfPayment: order && order.proofOfPayment,
                    shipping: { 
                        address: safeAddress,
                        phoneNumber: safeShippingPhone
                    },
                    notes: order && order.notes,
                    _id: order && order._id,
                    collection: order && order.collection,
                    orderNumber: order && order.orderNumber,
                    fullName: (order && (order.fullName || order.customerName)) || null,
                    email: (order && (order.email || order.customerEmail)) || null,
                    total: (order && (order.total ?? order.originalOrderTotal)) ?? 0,
                    reason: order && order.reason,
                    additionalComments: order && order.additionalComments,
                    submittedAt: order && order.submittedAt,
                    originalOrderDate: order && order.originalOrderDate,
                    displayStatus: (order && (order.displayStatus || order.status)) || null,
                    hasPendingCancellation: !!(order && order.hasPendingCancellation)
                };
            });
        } catch (mapErr) {
            console.error('❌ Error mapping formatted orders:', mapErr);
            // Fallback to empty array on mapping error to avoid 500
            formattedOrders = [];
        }
         
        // Sort by date (newest first)
        try {
            formattedOrders.sort((a, b) => {
                const da = a && a.date ? new Date(a.date) : new Date(0);
                const db = b && b.date ? new Date(b.date) : new Date(0);
                return db - da;
            });
        } catch (e) {}
         
        res.json(formattedOrders);
    } catch (error) {
        console.error("Error fetching user orders:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

// API endpoint to update order payment details
app.put('/api/orders/:orderId/payment', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { paymentUpdates } = req.body;
        
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.orderId) },
            { $set: { payment: paymentUpdates } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        res.json({ success: true, message: "Payment details updated successfully" });
    } catch (error) {
        console.error("Error updating order payment:", error);
        res.status(500).json({ error: "Failed to update payment details" });
    }
});

// API endpoint to get all orders (for debugging)
app.get('/api/orders', async (req, res) => {
    try {
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        const allOrders = await collection.aggregate([
            { $match: {} },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
        
        if (allOrders.length > 0) {
        }
        
        res.json(allOrders);
    } catch (error) {
        console.error("Error fetching all orders:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

// API endpoint to update order status
app.put('/api/orders/:orderId/status', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ error: "Status is required" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.orderId) },
            { $set: { status: status } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ error: "Failed to update order status" });
    }
});

// API endpoint to get orders with proof of payment (for staff review)
app.get('/api/orders/with-proof', async (req, res) => {
    try {
        
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        // Find orders that have proofOfPayment field and it's not null/empty
        const ordersWithProof = await collection.aggregate([
            { 
                $match: { 
                    proofOfPayment: { $exists: true, $ne: null, $ne: "" },
                    status: { $in: ["active", "Pending", "pending"] }
                }
            },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
        
        
        // Format orders for staff review
        const formattedOrders = ordersWithProof.map(order => ({
            _id: order._id,
            orderNumber: order.orderNumber,
            fullName: order.fullName,
            email: order.email,
            phoneNumber: order.phoneNumber,
            address: order.address,
            paymentMethod: order.paymentMethod,
            paymentReference: order.paymentReference,
            paymentAmount: order.paymentAmount,
            total: order.total,
            status: order.status,
            notes: order.notes,
            proofOfPayment: order.proofOfPayment,
            orderDate: order.orderDate,
            createdAt: order.createdAt,
            itemsordered: order.itemsordered
        }));
        
        res.json(formattedOrders);
    } catch (error) {
        console.error("❌ Error fetching orders with proof:", error);
        res.status(500).json({ error: "Failed to fetch orders with proof of payment" });
    }
});

// API endpoint to update order payment verification status
app.put('/api/orders/:orderId/verify-payment', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { verified, verifiedBy, verificationNotes } = req.body;
        
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        const updateData = {
            paymentVerified: verified,
            paymentVerifiedBy: verifiedBy,
            paymentVerificationNotes: verificationNotes || '',
            paymentVerificationDate: new Date(),
            updatedAt: new Date()
        };
        
        // If payment is verified, update status to "confirmed"
        if (verified) {
            updateData.status = "confirmed";
        }
        
        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.orderId) },
            { $set: updateData }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        res.json({ 
            success: true, 
            message: `Payment ${verified ? 'verified' : 'rejected'} successfully` 
        });
    } catch (error) {
        console.error("Error updating payment verification:", error);
        res.status(500).json({ error: "Failed to update payment verification" });
    }
});

// API endpoint to migrate localStorage orders to MongoDB
app.post('/api/orders/migrate', async (req, res) => {
    try {
        const { userCarts } = req.body;
        
        if (!userCarts || typeof userCarts !== 'object') {
            return res.status(400).json({ error: "Invalid userCarts data" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        let totalMigrated = 0;
        let errors = [];
        
        // Process each user's orders
        for (const [userId, orders] of Object.entries(userCarts)) {
            if (!Array.isArray(orders)) continue;
            
            for (const order of orders) {
                try {
                    // Check if order already exists (avoid duplicates)
                    const existingOrder = await collection.findOne({
                        userId: userId,
                        original_date: order.date,
                        "itemsordered.item_name": (order.items && order.items[0] && order.items[0].name) || ''
                    });
                    
                    if (existingOrder) {
                        console.log(`Order already exists for user ${userId}, skipping`);
                        continue;
                    }
                    
                    // Format the order according to MongoDB structure
                    const formattedOrder = {
                        userId: userId,
                        itemsordered: (order.items || []).map(item => ({
                            item_name: item.name || item.item_name || 'Unknown Item',
                            item_image: item.image || item.item_image || null, // Include item image
                            amount_per_item: item.quantity || item.amount_per_item || 1,
                            price_per_item: item.price || item.price_per_item || 0,
                            total_item_price: (item.price || 0) * (item.quantity || 1)
                        })),
                        date_ordered: new Date(order.date).toLocaleDateString('en-US', {
                            month: '2-digit',
                            day: '2-digit',
                            year: '2-digit'
                        }),
                        buyerinfo: order.buyerinfo || order.username || `user_${userId}`,
                        address: (order.shipping && order.shipping.address) || order.address || '',
                        total: (order.items || []).reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0) + 150,
                        status: order.status || 'Pending',
                        payment: order.payment || {},
                        shipping: order.shipping || {},
                        notes: order.notes || '',
                        original_date: order.date,
                        createdAt: new Date(order.date),
                        migrated: true
                    };
                    
                    await collection.insertOne(formattedOrder);
                    totalMigrated++;
                    
                } catch (orderError) {
                    console.error(`Error migrating order for user ${userId}:`, orderError);
                    errors.push(`User ${userId}: ${orderError.message}`);
                }
            }
        }
        
        res.json({ 
            success: true, 
            message: `Successfully migrated ${totalMigrated} orders`,
            totalMigrated,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error("Error migrating orders:", error);
        res.status(500).json({ error: "Failed to migrate orders" });
    }
});

// API endpoint for staff login
app.post('/api/staff/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Input validation and sanitization
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: "Username and password are required" 
            });
        }
        
        // Sanitize inputs
        const sanitizedUsername = String(username).trim().toLowerCase();
        const sanitizedPassword = String(password).trim();
        
        // Validate input length and format
        if (sanitizedUsername.length < 3 || sanitizedUsername.length > 50) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid username format" 
            });
        }
        
        if (sanitizedPassword.length < 6 || sanitizedPassword.length > 128) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid password format" 
            });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("AdminUsers");
        
        // Find user with matching username
        const staffUser = await collection.findOne({ 
            username: sanitizedUsername
        });
        
        if (!staffUser) {
            return res.status(401).json({ 
                success: false, 
                message: "Invalid credentials" 
            });
        }
        
        // Verify password using bcrypt (handle both 'password' and 'passwordHash' fields)
        const passwordField = staffUser.password || staffUser.passwordHash;
        if (!passwordField) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials - password not set"
            });
        }
        const passwordMatch = await bcrypt.compare(sanitizedPassword, passwordField);
        
        if (!passwordMatch) {
            return res.status(401).json({ 
                success: false, 
                message: "Invalid credentials" 
            });
        }
        
        // Update last login time
        await collection.updateOne(
            { _id: staffUser._id },
            { 
                $set: { 
                    lastLogin: new Date(),
                    lastUpdated: new Date()
                }
            }
        );
        
        // Return success with user info (excluding password)
        const { password: _, ...userInfo } = staffUser;
        res.json({
            success: true,
            message: `Staff login successful for ${staffUser.username}`,
            user: userInfo
        });
        
    } catch (error) {
        console.error("Error during staff login:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error during login" 
        });
    }
});

// API endpoint to save a user address
app.post('/api/user-addresses', async (req, res) => {
    try {
        const { userId, email, addressData } = req.body;
        
        // Support both userId and email for address association
        if (!addressData) {
            return res.status(400).json({ success: false, error: 'Missing addressData' });
        }
        
        if (!userId && !email) {
            return res.status(400).json({ success: false, error: 'Missing userId or email' });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection('UserAddresses');

        console.log(`📮 Saving address to database: ${databaseName}, collection: UserAddresses`);
        console.log('📮 User identifier:', { userId, email });

        // Build query for finding existing addresses to unset default
        const userQuery = {};
        if (userId) {
            // Convert userId to number if possible
            if (!isNaN(userId)) {
                userQuery.userId = Number(userId);
            } else {
                userQuery.userId = userId;
            }
        }
        if (email) {
            userQuery.email = email;
        }

        // If this address is set as default, unset all others for this user
        if (addressData.isDefault) {
            console.log('📮 Unsetting other default addresses for user');
            await collection.updateMany(
                { ...userQuery, isDefault: true },
                { $set: { isDefault: false } }
            );
        }

        // Build document to save - include both userId and email if available
        const doc = {
            ...addressData,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        // Add userId and/or email to the document
        if (userId) {
            // Convert userId to number if possible
            if (!isNaN(userId)) {
                doc.userId = Number(userId);
            } else {
                doc.userId = userId;
            }
        }
        if (email) {
            doc.email = email;
        }
        
        console.log('📮 Document to save:', JSON.stringify(doc, null, 2));
        
        const result = await collection.insertOne(doc);
        console.log('✅ Address saved successfully! Inserted ID:', result.insertedId);
        console.log(`📮 Database: ${databaseName}, Collection: UserAddresses`);
        
        res.json({ success: true, message: 'Address saved successfully', addressId: result.insertedId });
    } catch (error) {
        console.error('Error saving user address:', error);
        res.status(500).json({ success: false, error: 'Failed to save address' });
    }
});

// API endpoint to get user addresses by userId or email
app.get('/api/user-addresses', async (req, res) => {
    try {
        const { userId, email } = req.query;
        
        // Support both userId and email for address lookup
        if (!userId && !email) {
            return res.status(400).json({ error: 'Missing userId or email' });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection('UserAddresses');
        
        // Build query - support both userId and email
        const query = {};
        if (userId) {
            // Convert userId to number if possible
            if (!isNaN(userId)) {
                query.userId = Number(userId);
            } else {
                query.userId = userId;
            }
        }
        if (email) {
            query.email = email;
        }
        
        const addresses = await collection.aggregate([
            { $match: query },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
        res.json(addresses);
    } catch (error) {
        console.error('Error fetching user addresses:', error);
        res.status(500).json({ error: 'Failed to fetch addresses' });
    }
});

// API endpoint to delete a user address
app.delete('/api/user-addresses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const database = client.db(databaseName);
        const collection = database.collection('UserAddresses');
        
        console.log('🗑️ Deleting address with id:', id);
        
        // Try to find address by id field first (custom id like "addr_...")
        let address = await collection.findOne({ id });
        
        // If not found by id, try by _id (in case the id passed is actually a MongoDB ObjectId)
        if (!address && id.match(/^[0-9a-fA-F]{24}$/)) {
            try {
                address = await collection.findOne({ _id: new ObjectId(id) });
            } catch (err) {
                // Invalid ObjectId format, continue
            }
        }
        
        if (!address) {
            console.log('❌ Address not found with id:', id);
            return res.status(404).json({ success: false, error: 'Address not found' });
        }
        
        // Delete the address using _id (MongoDB's primary key)
        const result = await collection.deleteOne({ _id: address._id });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'Address not found' });
        }
        
        console.log('✅ Address deleted successfully:', id);
        res.json({ success: true, message: 'Address deleted successfully' });
    } catch (error) {
        console.error('Error deleting user address:', error);
        res.status(500).json({ success: false, error: 'Failed to delete address' });
    }
});

// API endpoint to set an address as default
app.put('/api/user-addresses/:id/default', async (req, res) => {
    try {
        const { id } = req.params;
        const database = client.db(databaseName);
        const collection = database.collection('UserAddresses');
        
        // Try to find address by id field first (custom id like "addr_...")
        let address = await collection.findOne({ id });
        
        // If not found by id, try by _id (in case the id passed is actually a MongoDB ObjectId)
        if (!address && id.match(/^[0-9a-fA-F]{24}$/)) {
            try {
                address = await collection.findOne({ _id: new ObjectId(id) });
            } catch (err) {
                // Invalid ObjectId format, continue
            }
        }
        
        if (!address) {
            return res.status(404).json({ success: false, error: 'Address not found' });
        }

        // Build query to find user's other addresses (support both userId and email)
        const userQuery = {};
        if (address.userId) userQuery.userId = address.userId;
        if (address.email) userQuery.email = address.email;

        // Unset all other defaults for this user
        await collection.updateMany(
            { ...userQuery, isDefault: true },
            { $set: { isDefault: false } }
        );

        // Set this address as default (use _id for the update)
        await collection.updateOne(
            { _id: address._id },
            { $set: { isDefault: true } }
        );

        res.json({ success: true, message: 'Default address updated' });
    } catch (error) {
        console.error('Error updating default address:', error);
        res.status(500).json({ success: false, error: 'Failed to update default address' });
    }
});

// API endpoint to add order to AcceptedOrders collection
app.post('/api/orders/accepted', async (req, res) => {
    try {
        
        const orderData = req.body;
        
        if (!orderData) {
            return res.status(400).json({ error: "Order data is required" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("AcceptedOrders");
        
        // Ensure the order has the correct status and approval metadata
        const acceptedOrder = {
            ...orderData,
            status: 'approved',
            approvedAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await collection.insertOne(acceptedOrder);
        
        
        res.json({ 
            success: true, 
            message: "Order moved to AcceptedOrders successfully", 
            insertedId: result.insertedId,
            orderId: result.insertedId
        });
        
    } catch (error) {
        console.error("❌ Error adding order to AcceptedOrders:", error);
        res.status(500).json({ error: "Failed to add order to AcceptedOrders" });
    }
});

// API endpoint to get specific order from AcceptedOrders (for verification)
app.get('/api/orders/accepted/:orderId', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const orderId = req.params.orderId;
        
        const database = client.db(databaseName);
        const collection = database.collection("AcceptedOrders");
        
        const order = await collection.findOne({ _id: new ObjectId(orderId) });
        
        if (!order) {
            return res.status(404).json({ error: "Order not found in AcceptedOrders" });
        }
        
        res.json(order);
        
    } catch (error) {
        console.error("❌ Error fetching order from AcceptedOrders:", error);
        res.status(500).json({ error: "Failed to fetch order from AcceptedOrders" });
    }
});

// API endpoint to delete order from PendingOrders collection
app.delete('/api/orders/pending/:orderId', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const orderId = req.params.orderId;
        
        
        const database = client.db(databaseName);
        const collection = database.collection("PendingOrders");
        
        const result = await collection.deleteOne({ _id: new ObjectId(orderId) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Order not found in PendingOrders" });
        }
        
        
        res.json({ 
            success: true, 
            message: "Order removed from PendingOrders successfully",
            deletedCount: result.deletedCount
        });
        
    } catch (error) {
        console.error("❌ Error deleting order from PendingOrders:", error);
        res.status(500).json({ error: "Failed to delete order from PendingOrders" });
    }
});

// API endpoint to add order to DeliveredOrders collection
app.post('/api/orders/delivered', async (req, res) => {
    try {
        
        const orderData = req.body;
        
        if (!orderData) {
            return res.status(400).json({ error: "Order data is required" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("DeliveredOrders");
        
        // Ensure the order has the correct status and delivery metadata
        const deliveredOrder = {
            ...orderData,
            status: 'delivered',
            deliveredAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await collection.insertOne(deliveredOrder);
        
        
        res.json({ 
            success: true, 
            message: "Order moved to DeliveredOrders successfully", 
            insertedId: result.insertedId,
            orderId: result.insertedId
        });
        
    } catch (error) {
        console.error("❌ Error adding order to DeliveredOrders:", error);
        res.status(500).json({ error: "Failed to add order to DeliveredOrders" });
    }
});

// API endpoint to get specific order from DeliveredOrders (for verification)
app.get('/api/orders/delivered/:orderId', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const orderId = req.params.orderId;
        
        const database = client.db(databaseName);
        const collection = database.collection("DeliveredOrders");
        
        const order = await collection.findOne({ _id: new ObjectId(orderId) });
        
        if (!order) {
            return res.status(404).json({ error: "Order not found in DeliveredOrders" });
        }
        
        res.json(order);
        
    } catch (error) {
        console.error("❌ Error fetching order from DeliveredOrders:", error);
        res.status(500).json({ error: "Failed to fetch order from DeliveredOrders" });
    }
});

// API endpoint to delete order from AcceptedOrders collection
app.delete('/api/orders/accepted/:orderId', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const orderId = req.params.orderId;
        
        
        const database = client.db(databaseName);
        const collection = database.collection("AcceptedOrders");
        
        const result = await collection.deleteOne({ _id: new ObjectId(orderId) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Order not found in AcceptedOrders" });
        }
        
        
        res.json({ 
            success: true, 
            message: "Order removed from AcceptedOrders successfully",
            deletedCount: result.deletedCount
        });
        
    } catch (error) {
        console.error("❌ Error deleting order from AcceptedOrders:", error);
        res.status(500).json({ error: "Failed to delete order from AcceptedOrders" });
    }
});

// API endpoint to save walk-in orders from POS
app.post('/api/orders/walkin', async (req, res) => {
    try {
        
        const orderData = req.body;
        
        if (!orderData) {
            return res.status(400).json({ error: "Order data is required" });
        }
        
        // Validate required fields
        if (!orderData.fullName || !orderData.itemsordered || !Array.isArray(orderData.itemsordered)) {
            return res.status(400).json({ error: "Missing required fields: fullName and itemsordered" });
        }
        
        const database = client.db(databaseName);
        const collection = database.collection("WalkInOrders");
        
        // Ensure walk-in order has proper structure and timestamps
        const walkInOrder = {
            ...orderData,
            source: 'pos_walkin',
            collection: 'walkin',
            status: orderData.status || 'completed',
            displayStatus: orderData.displayStatus || 'completed',
            createdAt: new Date(),
            updatedAt: new Date(),
            staffProcessed: true,
            posTimestamp: new Date()
        };
        
        const result = await collection.insertOne(walkInOrder);
        
        
        res.json({ 
            success: true, 
            message: "Walk-in order saved successfully", 
            insertedId: result.insertedId,
            orderId: result.insertedId
        });
        
    } catch (error) {
        console.error("❌ Error saving walk-in order:", error);
        res.status(500).json({ error: "Failed to save walk-in order", details: error.message });
    }
});

// API endpoint to get all walk-in orders
app.get('/api/orders/walkin', async (req, res) => {
    try {
        
        const database = client.db(databaseName);
        const collection = database.collection("WalkInOrders");
        
        const walkInOrders = await collection.aggregate([
            { $match: {} },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();
        
        
        res.json(walkInOrders);
        
    } catch (error) {
        console.error("❌ Error fetching walk-in orders:", error);
        res.status(500).json({ error: "Failed to fetch walk-in orders" });
    }
});

// API endpoint to get walk-in orders stats
app.get('/api/orders/walkin/stats', async (req, res) => {
    try {
        
        const database = client.db(databaseName);
        const collection = database.collection("WalkInOrders");
        
        const totalCount = await collection.countDocuments({});
        
        // Get revenue from walk-in orders
        const revenueResult = await collection.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$total" },
                    avgOrderValue: { $avg: "$total" }
                }
            }
        ]).toArray();
        
        const stats = {
            totalWalkInOrders: totalCount,
            totalRevenue: revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0,
            averageOrderValue: revenueResult.length > 0 ? revenueResult[0].avgOrderValue : 0
        };
        
        
        res.json(stats);
        
    } catch (error) {
        console.error("❌ Error fetching walk-in order stats:", error);
        res.status(500).json({ error: "Failed to fetch walk-in order stats" });
    }
});

// Duplicate endpoint removed - using the one above that supports both userId and email

// API endpoint for comprehensive staff dashboard statistics
app.get('/api/orders/stats/comprehensive', async (req, res) => {
    try {
        
        const database = client.db(databaseName);
        
        // Get counts from all order collections
        const pendingCollection = database.collection("PendingOrders");
        const acceptedCollection = database.collection("AcceptedOrders");
        const deliveredCollection = database.collection("DeliveredOrders");
        const walkInCollection = database.collection("WalkInOrders");
        
        const [pendingCount, acceptedCount, deliveredCount, walkInCount] = await Promise.all([
            pendingCollection.countDocuments({}),
            acceptedCollection.countDocuments({}),
            deliveredCollection.countDocuments({}),
            walkInCollection.countDocuments({})
        ]);
        
        // Calculate revenue from accepted and delivered orders
        const acceptedRevenue = await acceptedCollection.aggregate([
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]).toArray();
        
        const deliveredRevenue = await deliveredCollection.aggregate([
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]).toArray();
        
        const walkInRevenue = await walkInCollection.aggregate([
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]).toArray();
        
        const totalRevenue = 
            (acceptedRevenue.length > 0 ? acceptedRevenue[0].total : 0) +
            (deliveredRevenue.length > 0 ? deliveredRevenue[0].total : 0) +
            (walkInRevenue.length > 0 ? walkInRevenue[0].total : 0);
        
        // Count total delivered products (items in delivered orders)
        const deliveredProductsResult = await deliveredCollection.aggregate([
            { $unwind: "$itemsordered" },
            { $group: { _id: null, totalProducts: { $sum: "$itemsordered.amount_per_item" } } }
        ]).toArray();
        
        const walkInProductsResult = await walkInCollection.aggregate([
            { $unwind: "$itemsordered" },
            { $group: { _id: null, totalProducts: { $sum: "$itemsordered.amount_per_item" } } }
        ]).toArray();
        
        const totalDeliveredProducts = 
            (deliveredProductsResult.length > 0 ? deliveredProductsResult[0].totalProducts : 0) +
            (walkInProductsResult.length > 0 ? walkInProductsResult[0].totalProducts : 0);
        
        const stats = {
            totalPending: pendingCount,
            totalAccepted: acceptedCount,
            totalDelivered: deliveredCount,
            totalWalkIn: walkInCount,
            totalRevenue: totalRevenue,
            totalDeliveredProducts: totalDeliveredProducts,
            lastUpdated: new Date()
        };
        
        
        res.json(stats);
        
    } catch (error) {
        console.error("❌ Error fetching comprehensive staff statistics:", error);
        res.status(500).json({ error: "Failed to fetch comprehensive staff statistics" });
    }
});

// API endpoint to get all collections data for staff (enhanced)
app.get('/api/orders/all-collections', async (req, res) => {
    try {
        
        const database = client.db(databaseName);
        const pendingCollection = database.collection("PendingOrders");
        const acceptedCollection = database.collection("AcceptedOrders");
        const deliveredCollection = database.collection("DeliveredOrders");
        const walkInCollection = database.collection("WalkInOrders");
        
        // Fetch from all collections in parallel
        const [pendingOrders, acceptedOrders, deliveredOrders, walkInOrders] = await Promise.all([
            pendingCollection.find({}).toArray(),
            acceptedCollection.find({}).toArray(),
            deliveredCollection.find({}).toArray(),
            walkInCollection.find({}).toArray()
        ]);
        
        // Add collection and display status metadata
        const allOrders = [
            ...pendingOrders.map(order => ({
                ...order,
                collection: 'pending',
                displayStatus: order.status === 'active' ? 'pending' : order.status
            })),
            ...acceptedOrders.map(order => ({
                ...order,
                collection: 'accepted',
                displayStatus: 'approved'
            })),
            ...deliveredOrders.map(order => ({
                ...order,
                collection: 'delivered',
                displayStatus: 'delivered'
            })),
            ...walkInOrders.map(order => ({
                ...order,
                collection: 'walkin',
                displayStatus: 'completed'
            }))
        ];
        
        // Sort by most recent first
        allOrders.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.orderDate || a.original_date || 0);
            const dateB = new Date(b.createdAt || b.orderDate || b.original_date || 0);
            return dateB - dateA;
        });
        
        
        res.json(allOrders);
        
    } catch (error) {
        console.error("❌ Error fetching orders from all collections:", error);
        res.status(500).json({ error: "Failed to fetch orders from all collections" });
    }
});

// API endpoint to update order status (enhanced for collection movement)
app.put('/api/orders/:orderId/status', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const orderId = req.params.orderId;
        const { status, updatedBy } = req.body;
        
        
        if (!status) {
            return res.status(400).json({ error: "Status is required" });
        }
        
        const database = client.db(databaseName);
        
        // Try to find the order in all collections
        const collections = [
            { name: 'PendingOrders', collection: database.collection("PendingOrders") },
            { name: 'AcceptedOrders', collection: database.collection("AcceptedOrders") },
            { name: 'DeliveredOrders', collection: database.collection("DeliveredOrders") }
        ];
        
        let order = null;
        let foundInCollection = null;
        
        for (const { name, collection } of collections) {
            order = await collection.findOne({ _id: new ObjectId(orderId) });
            if (order) {
                foundInCollection = { name, collection };
                break;
            }
        }
        
        if (!order) {
            return res.status(404).json({ error: "Order not found in any collection" });
        }
        
        
        // Update the order in its current collection
        const updateData = {
            status: status,
            updatedAt: new Date(),
            updatedBy: updatedBy || 'staff'
        };
        
        const result = await foundInCollection.collection.updateOne(
            { _id: new ObjectId(orderId) },
            { $set: updateData }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Failed to update order" });
        }
        
        
        res.json({ 
            success: true, 
            message: `Order status updated to ${status}`,
            orderId: orderId,
            collection: foundInCollection.name
        });
        
    } catch (error) {
        console.error("❌ Error updating order status:", error);
        res.status(500).json({ error: "Failed to update order status" });
    }
});

// API endpoint to get order analytics for dashboard
app.get('/api/orders/analytics', async (req, res) => {
    try {
        
        const { startDate, endDate } = req.query;
        
        const database = client.db(databaseName);
        
        // Build date filter if provided
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
        }
        
        const collections = [
            { name: 'pending', collection: database.collection("PendingOrders") },
            { name: 'accepted', collection: database.collection("AcceptedOrders") },
            { name: 'delivered', collection: database.collection("DeliveredOrders") },
            { name: 'walkin', collection: database.collection("WalkInOrders") }
        ];
        
        const analytics = {};
        
        for (const { name, collection } of collections) {
            const count = await collection.countDocuments(dateFilter);
            const revenue = await collection.aggregate([
                { $match: dateFilter },
                { $group: { _id: null, total: { $sum: "$total" } } }
            ]).toArray();
            
            analytics[name] = {
                count: count,
                revenue: revenue.length > 0 ? revenue[0].total : 0
            };
        }
        
        // Calculate totals
        analytics.totals = {
            orders: Object.values(analytics).reduce((sum, item) => sum + item.count, 0),
            revenue: Object.values(analytics).reduce((sum, item) => sum + item.revenue, 0)
        };
        
        
        res.json(analytics);
        
    } catch (error) {
        console.error("❌ Error fetching order analytics:", error);
        res.status(500).json({ error: "Failed to fetch order analytics" });
    }
});

// API endpoint to move orders between collections (for staff dashboard status updates)
app.post('/api/orders/move', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { orderId, operation, fromCollection, toCollection, denialReason, returnReason, returnImage } = req.body;
        
        
        if (!orderId || !operation || !fromCollection || !toCollection) {
            return res.status(400).json({ error: "Missing required fields: orderId, operation, fromCollection, toCollection" });
        }
        
        const database = client.db(databaseName);
        
        // Map collection names to actual MongoDB collection names
        const collectionMapping = {
            'orders': 'PendingOrders',
            'pending': 'PendingOrders',
            'accepted': 'AcceptedOrders',
            'delivered': 'DeliveredOrders',
            'denied': 'DeniedOrders',
            'returned': 'ReturnedOrders'
        };
        
        const sourceCollectionName = collectionMapping[fromCollection];
        const targetCollectionName = collectionMapping[toCollection];
        
        if (!sourceCollectionName || !targetCollectionName) {
            return res.status(400).json({ error: "Invalid collection names" });
        }
        
        const sourceCollection = database.collection(sourceCollectionName);
        const targetCollection = database.collection(targetCollectionName);
        
        // Find the order in the source collection
        const order = await sourceCollection.findOne({ _id: new ObjectId(orderId) });
        
        if (!order) {
            return res.status(404).json({ error: `Order not found in ${sourceCollectionName}` });
        }
        
        // Prepare the order for the target collection
        let updatedOrder = { ...order };
        delete updatedOrder._id; // Remove the _id so MongoDB can assign a new one
        
        // Update order based on the target status
        switch (toCollection) {
            case 'pending':
                updatedOrder.status = 'pending';
                updatedOrder.displayStatus = 'pending';
                break;
            case 'accepted':
                updatedOrder.status = 'approved';
                updatedOrder.displayStatus = 'approved';
                updatedOrder.approvedAt = new Date();
                break;
            case 'delivered':
                updatedOrder.status = 'delivered';
                updatedOrder.displayStatus = 'delivered';
                updatedOrder.deliveredAt = new Date();
                break;
            case 'denied':
                updatedOrder.status = 'denied';
                updatedOrder.displayStatus = 'denied';
                updatedOrder.deniedAt = new Date();
                if (denialReason) {
                    updatedOrder.denialReason = denialReason;
                }
                break;
            case 'returned':
                updatedOrder.status = 'returned';
                updatedOrder.displayStatus = 'returned';
                updatedOrder.returnedAt = new Date();
                
                // Handle return documentation
                if (returnReason) {
                    updatedOrder.returnReason = returnReason;
                }
                
                if (returnImage) {
                    updatedOrder.returnImage = returnImage;
                    updatedOrder.returnImageUploadedAt = new Date();
                    console.log(`📷 Return documentation image saved (${returnImage.length} characters)`);
                }
                
                // Add return processing metadata
                updatedOrder.returnProcessedBy = 'staff';
                updatedOrder.returnProcessingDate = new Date();
                
                break;
        }
        
        updatedOrder.updatedAt = new Date();
        updatedOrder.lastModifiedBy = 'staff';
        
        // Insert into target collection
        const insertResult = await targetCollection.insertOne(updatedOrder);
        
        if (!insertResult.insertedId) {
            throw new Error('Failed to insert order into target collection');
        }
        
        // Remove from source collection
        const deleteResult = await sourceCollection.deleteOne({ _id: new ObjectId(orderId) });
        
        if (deleteResult.deletedCount === 0) {
            // If deletion failed, we should remove the inserted order to maintain consistency
            await targetCollection.deleteOne({ _id: insertResult.insertedId });
            throw new Error('Failed to remove order from source collection');
        }
        
        
        res.json({
            success: true,
            message: `Order successfully moved to ${toCollection}`,
            newOrderId: insertResult.insertedId,
            operation: operation,
            ...(returnReason && { returnReason }),
            ...(returnImage && { returnImageSaved: true })
        });
        
    } catch (error) {
        console.error("❌ Error moving order between collections:", error);
        res.status(500).json({ error: "Failed to move order between collections", details: error.message });
    }
});

// API endpoint to get return documentation for an order
app.get('/api/orders/:orderId/return-documentation', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { orderId } = req.params;
        
        
        if (!orderId) {
            return res.status(400).json({ error: "Order ID is required" });
        }
        
        const database = client.db(databaseName);
        const returnedOrdersCollection = database.collection("ReturnedOrders");
        
        // Find the returned order
        const returnedOrder = await returnedOrdersCollection.findOne({ 
            _id: new ObjectId(orderId) 
        });
        
        if (!returnedOrder) {
            return res.status(404).json({ error: "Returned order not found" });
        }
        
        // Extract return documentation
        const returnDocumentation = {
            orderId: returnedOrder._id,
            orderNumber: returnedOrder.orderNumber || `ORD-${returnedOrder._id.toString().slice(-6)}`,
            customerName: returnedOrder.fullName || returnedOrder.buyerinfo || 'N/A',
            returnReason: returnedOrder.returnReason || 'No reason provided',
            returnImage: returnedOrder.returnImage || null,
            returnedAt: returnedOrder.returnedAt || returnedOrder.returnProcessingDate,
            returnProcessedBy: returnedOrder.returnProcessedBy || 'staff',
            returnImageUploadedAt: returnedOrder.returnImageUploadedAt || null
        };
        
        
        res.json(returnDocumentation);
        
    } catch (error) {
        console.error("❌ Error fetching return documentation:", error);
        res.status(500).json({ error: "Failed to fetch return documentation", details: error.message });
    }
});

// API endpoint to get all returned orders with documentation
app.get('/api/orders/returned', async (req, res) => {
    try {

        const database = client.db(databaseName);
        const returnedOrdersCollection = database.collection("ReturnedOrders");

        // Get all returned orders, sorted by most recent first
        const returnedOrders = await returnedOrdersCollection.aggregate([
            { $match: {} },
            { $sort: { returnedAt: -1 } }
        ], { allowDiskUse: true }).toArray();

        // Format the returned orders with documentation info
        const formattedOrders = returnedOrders.map(order => ({
            _id: order._id,
            orderNumber: order.orderNumber || `ORD-${order._id.toString().slice(-6)}`,
            customerName: order.fullName || order.buyerinfo || 'N/A',
            customerEmail: order.email || 'N/A',
            customerPhone: order.phoneNumber || 'N/A',
            total: order.total || 0,
            itemsCount: (order.itemsordered || []).length,
            returnReason: order.returnReason || 'No reason provided',
            hasReturnImage: !!(order.returnImage),
            returnedAt: order.returnedAt || order.returnProcessingDate,
            returnProcessedBy: order.returnProcessedBy || 'staff',
            originalOrderDate: order.orderDate || order.createdAt || order.original_date,
            paymentMethod: order.paymentMethod || 'N/A',
            // Only include these for summary, actual image data retrieved separately
            returnImageAvailable: !!(order.returnImage),
            returnImageUploadedAt: order.returnImageUploadedAt || null
        }));


        res.json({
            success: true,
            count: formattedOrders.length,
            returnedOrders: formattedOrders
        });

    } catch (error) {
        console.error("❌ Error fetching returned orders:", error);
        res.status(500).json({ error: "Failed to fetch returned orders", details: error.message });
    }
});

// API endpoint to submit return/exchange request from order history
app.post('/api/orders/return-request', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const {
            orderId,
            returnType,
            selectedItems,
            reason,
            additionalComments,
            returnImage
        } = req.body;

        console.log('Return request data:', {
            orderId,
            returnType,
            selectedItems: selectedItems ? selectedItems.length : 0,
            reason,
            hasImage: !!returnImage
        });

        if (!orderId || !returnType || !selectedItems || selectedItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: orderId, returnType, and selectedItems"
            });
        }

        const database = client.db(databaseName);

        // Find the original order in any collection
        const collections = [
            { name: 'DeliveredOrders', collection: database.collection("DeliveredOrders") },
            { name: 'AcceptedOrders', collection: database.collection("AcceptedOrders") },
            { name: 'PendingOrders', collection: database.collection("PendingOrders") }
        ];

        let originalOrder = null;
        let sourceCollection = null;

        for (const { name, collection } of collections) {
            originalOrder = await collection.findOne({ _id: new ObjectId(orderId) });
            if (originalOrder) {
                sourceCollection = { name, collection };
                break;
            }
        }

        if (!originalOrder) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Create return request record
        const returnRequest = {
            originalOrderId: orderId,
            orderNumber: originalOrder.orderNumber || `ORD-${orderId.slice(-6)}`,
            customerName: originalOrder.fullName || originalOrder.buyerinfo || 'N/A',
            customerEmail: originalOrder.email || 'N/A',
            customerPhone: originalOrder.phoneNumber || 'N/A',
            returnType: returnType, // 'return' or 'exchange'
            selectedItems: selectedItems,
            reason: reason,
            additionalComments: additionalComments || '',
            returnImage: returnImage || null,
            originalOrderTotal: originalOrder.total || 0,
            originalOrderDate: originalOrder.orderDate || originalOrder.createdAt,
            status: 'pending_review', // pending_review, approved, rejected, processed
            submittedAt: new Date(),
            submittedBy: 'customer',
            sourceCollection: sourceCollection.name
        };

        // Save return request to ReturnRequests collection
        const returnRequestsCollection = database.collection("ReturnRequests");
        const result = await returnRequestsCollection.insertOne(returnRequest);


        // Create staff notification for new return request
        const staffNotificationsCollection = database.collection("StaffNotifications");
        const notification = {
            id: `return_${result.insertedId}_${Date.now()}`,
            title: '🔄 New Return/Exchange Request',
            message: `${returnRequest.customerName} submitted a ${returnType} request for order ${returnRequest.orderNumber}`,
            type: 'return_request',
            orderId: orderId,
            requestId: result.insertedId,
            customerName: returnRequest.customerName,
            customerEmail: returnRequest.customerEmail,
            orderNumber: returnRequest.orderNumber,
            returnType: returnType,
            reason: reason,
            read: false,
            createdAt: new Date(),
            priority: 'medium'
        };

        await staffNotificationsCollection.insertOne(notification);
        console.log(`🔔 Staff notification created for return request: ${notification.id}`);

        res.json({
            success: true,
            message: "Return/exchange request submitted successfully",
            requestId: result.insertedId,
            status: 'pending_review'
        });

    } catch (error) {
        console.error("❌ Error processing return request:", error);
        res.status(500).json({
            success: false,
            message: "Failed to submit return request",
            error: error.message
        });
    }
});

// API endpoint to submit cancellation request from order history
app.post('/api/orders/cancel-request', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const {
            orderId,
            reason,
            additionalComments
        } = req.body;

        console.log('Return request data:', {
            orderId,
            reason,
            additionalComments: (additionalComments && additionalComments.substring(0, 50) + '...') || ''
        });

        if (!orderId || !reason) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: orderId and reason"
            });
        }

        const database = client.db(databaseName);

        // Find the original order in any collection
        const collections = [
            { name: 'PendingOrders', collection: database.collection("PendingOrders") },
            { name: 'AcceptedOrders', collection: database.collection("AcceptedOrders") }
        ];

        let originalOrder = null;
        let sourceCollection = null;

        for (const { name, collection } of collections) {
            originalOrder = await collection.findOne({ _id: new ObjectId(orderId) });
            if (originalOrder) {
                sourceCollection = { name, collection };
                break;
            }
        }

        if (!originalOrder) {
            return res.status(404).json({
                success: false,
                message: "Order not found or cannot be cancelled"
            });
        }

        // Check if order can be cancelled (only pending and accepted orders)
        const currentStatus = originalOrder.status || 'pending';
        if (!['pending', 'active', 'approved'].includes(currentStatus.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "This order cannot be cancelled at this stage"
            });
        }

        // Create cancellation request record
        const cancellationRequest = {
            originalOrderId: orderId,
            userId: originalOrder.userId || null,
            userIdString: originalOrder.userId !== undefined && originalOrder.userId !== null ? String(originalOrder.userId) : null,
            userIdNumber: originalOrder.userId !== undefined && originalOrder.userId !== null && !isNaN(Number(originalOrder.userId)) ? Number(originalOrder.userId) : null,
            orderNumber: originalOrder.orderNumber || `ORD-${orderId.slice(-6)}`,
            customerName: originalOrder.fullName || originalOrder.buyerinfo || 'N/A',
            customerEmail: originalOrder.email || 'N/A',
            customerPhone: originalOrder.phoneNumber || 'N/A',
            itemsordered: originalOrder.itemsordered || [],
            payment: originalOrder.payment || null,
            paymentMethod: originalOrder.paymentMethod || (originalOrder.payment && originalOrder.payment.method) || null,
            paymentType: originalOrder.paymentType || (originalOrder.payment && originalOrder.payment.type) || null,
            paymentSplitPercent: originalOrder.paymentSplitPercent || (originalOrder.payment && originalOrder.payment.splitPercent) || null,
            paymentReference: originalOrder.paymentReference || (originalOrder.payment && originalOrder.payment.reference) || null,
            paymentAmount: originalOrder.paymentAmount || (originalOrder.payment && originalOrder.payment.amount) || null,
            changeUponDelivery: originalOrder.changeUponDelivery || (originalOrder.payment && originalOrder.payment.changeUponDelivery) || null,
            proofOfPayment: originalOrder.proofOfPayment || (originalOrder.payment && originalOrder.payment.proof) || null,
            reason: reason,
            additionalComments: additionalComments || '',
            originalOrderTotal: originalOrder.total || 0,
            originalOrderDate: originalOrder.orderDate || originalOrder.createdAt,
            originalOrderStatus: currentStatus,
            status: 'pending_review', // pending_review, approved, rejected, processed
            submittedAt: new Date(),
            submittedBy: 'customer',
            sourceCollection: sourceCollection.name,
            notes: originalOrder.notes || '',
            address: originalOrder.address || null,
            shipping: originalOrder.shipping || null,
            phoneNumber: originalOrder.phoneNumber || (originalOrder.shipping && originalOrder.shipping.phoneNumber) || null
        };

        // Save cancellation request to CancellationRequests collection
        const cancellationRequestsCollection = database.collection("CancellationRequests");
        const result = await cancellationRequestsCollection.insertOne(cancellationRequest);

        // Remove the original order from its source collection now that the cancellation request is stored
        const deleteResult = await sourceCollection.collection.deleteOne({ _id: new ObjectId(orderId) });
        if (deleteResult.deletedCount === 0) {
            console.error(`❌ Failed to remove original order ${orderId} from ${sourceCollection.name} after creating cancellation request. Rolling back cancellation request.`);
            await cancellationRequestsCollection.deleteOne({ _id: result.insertedId });
            return res.status(500).json({
                success: false,
                message: "Failed to remove the original order after creating the cancellation request. Please try again."
            });
        }


        // Create staff notification for new cancellation request
        const staffNotificationsCollection = database.collection("StaffNotifications");
        const notification = {
            id: `cancel_${result.insertedId}_${Date.now()}`,
            title: '🚫 New Cancellation Request',
            message: `${cancellationRequest.customerName} requested to cancel order ${cancellationRequest.orderNumber}`,
            type: 'cancellation_request',
            orderId: orderId,
            requestId: result.insertedId,
            customerName: cancellationRequest.customerName,
            customerEmail: cancellationRequest.customerEmail,
            orderNumber: cancellationRequest.orderNumber,
            reason: reason,
            read: false,
            createdAt: new Date(),
            priority: 'high'
        };

        await staffNotificationsCollection.insertOne(notification);
        console.log(`🔔 Staff notification created for cancellation request: ${notification.id}`);

        res.json({
            success: true,
            message: "Cancellation request submitted successfully",
            requestId: result.insertedId,
            status: 'pending_review'
        });

    } catch (error) {
        console.error("❌ Error processing cancellation request:", error);
        res.status(500).json({
            success: false,
            message: "Failed to submit cancellation request",
            error: error.message
        });
    }
});


// API endpoint to check if orders have pending cancellation requests
app.post('/api/orders/check-cancellation-requests', async (req, res) => {
    try {
        const { orderIds } = req.body;
        
        if (!orderIds || !Array.isArray(orderIds)) {
            return res.status(400).json({
                success: false,
                message: "orderIds array is required"
            });
        }

        const database = client.db(databaseName);
        const cancellationRequestsCollection = database.collection("CancellationRequests");
        const { ObjectId } = require('mongodb');

        // Convert orderIds to ObjectIds
        const objectIds = orderIds.map(id => {
            try {
                return new ObjectId(id);
            } catch (e) {
                return null;
            }
        }).filter(id => id !== null);

        // Find pending cancellation requests for these orders
        const pendingCancellations = await cancellationRequestsCollection.find({
            originalOrderId: { $in: objectIds },
            status: { $in: ['pending_review', 'pending'] }
        }).toArray();

        // Create a map of orderId -> hasPendingCancellation
        const cancellationMap = {};
        pendingCancellations.forEach(cancellation => {
            cancellationMap[cancellation.originalOrderId.toString()] = true;
        });

        res.json({
            success: true,
            cancellationMap: cancellationMap
        });

    } catch (error) {
        console.error("❌ Error checking cancellation requests:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to get cancellation requests for staff review
app.get('/api/orders/cancellation-requests', async (req, res) => {
    try {

        const database = client.db(databaseName);
        const cancellationRequestsCollection = database.collection("CancellationRequests");

        const cancellationRequests = await cancellationRequestsCollection.aggregate([
            { $match: {} },
            { $sort: { submittedAt: -1 } }
        ], { allowDiskUse: true }).toArray();


        res.json({
            success: true,
            count: cancellationRequests.length,
            cancellationRequests: cancellationRequests
        });

    } catch (error) {
        console.error("❌ Error fetching cancellation requests:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch cancellation requests",
            error: error.message
        });
    }
});

// API endpoint to process return request (approve/reject)
app.put('/api/orders/return-request/:requestId', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { requestId } = req.params;
        const { action, staffNotes, returnImage } = req.body; // action: 'approve' or 'reject'

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Invalid action. Must be 'approve' or 'reject'"
            });
        }

        const database = client.db(databaseName);
        const returnRequestsCollection = database.collection("ReturnRequests");
        const returnedOrdersCollection = database.collection("ReturnedOrders");

        const requestObjectId = new ObjectId(requestId);

        // Find the return request
        const returnRequest = await returnRequestsCollection.findOne({ _id: requestObjectId });

        if (!returnRequest) {
            return res.status(404).json({
                success: false,
                message: "Return request not found"
            });
        }

        // Gather original order details (if still present in any collection)
        const orderCollections = [
            database.collection("DeliveredOrders"),
            database.collection("AcceptedOrders"),
            database.collection("PendingOrders"),
            database.collection("Orders")
        ];
        let originalOrder = null;
        let originalOrderCollectionName = null;
        for (const collection of orderCollections) {
            try {
                const found = await collection.findOne({ _id: new ObjectId(returnRequest.originalOrderId) });
                if (found) {
                    originalOrder = found;
                    originalOrderCollectionName = collection.collectionName;
                    break;
                }
            } catch (err) {
                // Ignore invalid ObjectId or not found
            }
        }

        const processedAt = new Date();
        const decisionStatus = action === 'approve' ? 'accepted' : 'rejected';

        const archivedRecord = {
            requestId: requestObjectId,
            status: decisionStatus,
            action,
            staffNotes: staffNotes || '',
            staffDecisionImage: returnImage || null,
            originalOrderId: returnRequest.originalOrderId || null,
            orderNumber: returnRequest.orderNumber || originalOrder?.orderNumber || (returnRequest.originalOrderId ? `ORD-${String(returnRequest.originalOrderId).slice(-6)}` : null),
            customerName: returnRequest.customerName || originalOrder?.fullName || originalOrder?.customerName || originalOrder?.buyerinfo || 'N/A',
            customerEmail: returnRequest.customerEmail || originalOrder?.email || 'N/A',
            customerPhone: returnRequest.customerPhone || originalOrder?.phoneNumber || 'N/A',
            returnType: returnRequest.returnType || 'return',
            customerReason: returnRequest.reason || returnRequest.returnReason || '',
            selectedItems: returnRequest.selectedItems || returnRequest.itemsordered || originalOrder?.itemsordered || [],
            customerImage: returnRequest.returnImage || null,
            staffDecision: decisionStatus,
            originalOrderCollection: originalOrderCollectionName,
            submittedAt: returnRequest.submittedAt || returnRequest.createdAt || processedAt,
            processedAt,
            processedBy: 'staff',
            requestSnapshot: returnRequest,
            originalOrderSnapshot: originalOrder || null
        };

        const archiveResult = await returnedOrdersCollection.insertOne(archivedRecord);
        if (!archiveResult.acknowledged) {
            throw new Error('Failed to archive return request');
        }

        // Remove the original return request only after successful archive
        const deleteResult = await returnRequestsCollection.deleteOne({ _id: requestObjectId });
        if (deleteResult.deletedCount === 0) {
            await returnedOrdersCollection.deleteOne({ _id: archiveResult.insertedId }).catch(() => {});
            throw new Error('Failed to remove original return request');
        }

        // If the return was accepted and we located the original order, remove it from its collection
        if (action === 'approve' && originalOrder && originalOrderCollectionName) {
            const sourceCollection = database.collection(originalOrderCollectionName);
            await sourceCollection.deleteOne({ _id: new ObjectId(returnRequest.originalOrderId) }).catch(() => {});
        }

        // Create notifications for both user and staff
        const userId = returnRequest.userId || originalOrder?.userId || originalOrder?.customerId || null;
        const orderNumber = archivedRecord.orderNumber;
        const customerName = archivedRecord.customerName;

        // Create user notification
        if (userId) {
            try {
                const userNotificationsCollection = database.collection("UserNotifications");
                const isAccepted = action === 'approve';
                const userNotification = {
                    userId: userId,
                    title: isAccepted ? '↩️ Return Request Approved' : '🚫 Return Request Rejected',
                    message: isAccepted 
                        ? `Your return request for order ${orderNumber} has been approved. ${staffNotes ? `Staff notes: ${staffNotes}` : 'We will begin processing the return shortly.'}`
                        : `Your return request for order ${orderNumber} has been rejected. ${staffNotes ? `Reason: ${staffNotes}` : 'Please contact us if you would like to discuss this decision.'}`,
                    type: isAccepted ? 'order_return_approved' : 'order_return_rejected',
                    orderId: returnRequest.originalOrderId || null,
                    orderNumber: orderNumber,
                    requestId: requestId,
                    returnType: archivedRecord.returnType,
                    staffNotes: staffNotes || null,
                    read: false,
                    createdAt: processedAt
                };

                await userNotificationsCollection.insertOne(userNotification);
                console.log(`✅ User notification created for return request: ${userNotification.title} (userId: ${userId})`);
            } catch (error) {
                console.error("❌ Error creating user notification:", error);
                // Don't fail the entire request if notification creation fails
            }
        }

        // Create staff notification
        try {
            const staffNotificationsCollection = database.collection("StaffNotifications");
            const isAccepted = action === 'approve';
            const staffNotification = {
                title: isAccepted ? '✅ Return Request Processed (Approved)' : '❌ Return Request Processed (Rejected)',
                message: `Return request for order ${orderNumber} (${customerName}) has been ${isAccepted ? 'approved' : 'rejected'}. ${staffNotes ? `Notes: ${staffNotes}` : ''}`,
                type: isAccepted ? 'return_processed_approved' : 'return_processed_rejected',
                orderId: returnRequest.originalOrderId || null,
                orderNumber: orderNumber,
                requestId: requestId,
                customerName: customerName,
                customerEmail: archivedRecord.customerEmail,
                returnType: archivedRecord.returnType,
                decision: decisionStatus,
                staffNotes: staffNotes || null,
                archivedId: archiveResult.insertedId,
                read: false,
                createdAt: processedAt,
                priority: 'medium'
            };

            await staffNotificationsCollection.insertOne(staffNotification);
            console.log(`✅ Staff notification created for return request: ${staffNotification.title}`);
        } catch (error) {
            console.error("❌ Error creating staff notification:", error);
            // Don't fail the entire request if notification creation fails
        }

        res.json({
            success: true,
            message: `Return request ${action}d successfully`,
            status: decisionStatus,
            archivedId: archiveResult.insertedId
        });

    } catch (error) {
        console.error("❌ Error processing return request:", error);
        res.status(500).json({
            success: false,
            message: "Failed to process return request",
            error: error.message
        });
    }
});

// API endpoint to process cancellation request (approve/reject)
app.put('/api/orders/cancellation-request/:requestId', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { requestId } = req.params;
        const { action, staffNotes } = req.body; // action: 'approve' or 'reject'


        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Invalid action. Must be 'approve' or 'reject'"
            });
        }

        const database = client.db(databaseName);
        const cancellationRequestsCollection = database.collection("CancellationRequests");

        // Find the cancellation request
        const cancellationRequest = await cancellationRequestsCollection.findOne({ _id: new ObjectId(requestId) });

        if (!cancellationRequest) {
            return res.status(404).json({
                success: false,
                message: "Cancellation request not found"
            });
        }

        // Update the cancellation request status
        const updateData = {
            status: action === 'approve' ? 'approved' : 'rejected',
            processedAt: new Date(),
            processedBy: 'staff',
            staffNotes: staffNotes || ''
        };

        await cancellationRequestsCollection.updateOne(
            { _id: new ObjectId(requestId) },
            { $set: updateData }
        );

        // If approved, move the original order to CancelledOrders collection
        if (action === 'approve') {
            // Find and move the original order to CancelledOrders
            const collections = [
                { name: 'PendingOrders', collection: database.collection("PendingOrders") },
                { name: 'AcceptedOrders', collection: database.collection("AcceptedOrders") }
            ];

            for (const { collection } of collections) {
                const originalOrder = await collection.findOne({ _id: new ObjectId(cancellationRequest.originalOrderId) });
                if (originalOrder) {
                    // Move to CancelledOrders
                    const cancelledOrder = {
                        ...originalOrder,
                        cancellationReason: cancellationRequest.reason,
                        cancelledAt: new Date(),
                        cancellationProcessedBy: 'staff',
                        cancellationRequestId: requestId
                    };

                    delete cancelledOrder._id; // Remove _id for new document

                    const cancelledCollection = database.collection("CancelledOrders");
                    await cancelledCollection.insertOne(cancelledOrder);

                    // Remove from original collection
                    await collection.deleteOne({ _id: new ObjectId(cancellationRequest.originalOrderId) });

                    break;
                }
            }
        }


        res.json({
            success: true,
            message: `Cancellation request ${action}d successfully`,
            status: updateData.status
        });

    } catch (error) {
        console.error("❌ Error processing cancellation request:", error);
        res.status(500).json({
            success: false,
            message: "Failed to process cancellation request",
            error: error.message
        });
    }
});

// Email transporter configuration
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'sanricomercantileofficial@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'your-app-password' // Use environment variable for security
    }
});

// Send verification email endpoint
app.post('/api/auth/send-verification', async (req, res) => {
    try {
        const { email, code, fromEmail } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and verification code are required' 
            });
        }
        
        const mailOptions = {
            from: fromEmail || 'sanricomercantileofficial@gmail.com',
            to: email,
            subject: 'Verify Your Email - Sanrico Mercantile Inc.',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Email Verification</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f8f9fa; }
                        .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
                        .header { background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); padding: 40px 20px; text-align: center; }
                        .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
                        .content { padding: 40px 20px; text-align: center; }
                        .verification-code { background: #f8f9fa; border: 2px dashed #3498db; border-radius: 8px; padding: 20px; margin: 30px 0; font-size: 36px; font-weight: bold; color: #2c3e50; letter-spacing: 8px; }
                        .footer { background: #2c3e50; color: #ffffff; padding: 20px; text-align: center; font-size: 14px; }
                        .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 20px 0; color: #856404; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Email Verification</h1>
                        </div>
                        <div class="content">
                            <h2>Welcome to Sanrico Mercantile Inc.!</h2>
                            <p>Thank you for creating an account with us. To complete your registration, please enter the verification code below:</p>
                            
                            <div class="verification-code">${code}</div>
                            
                            <p>Enter this code on the verification page to activate your account.</p>
                            
                            <div class="warning">
                                <strong>Security Notice:</strong><br>
                                • This code expires in 15 minutes<br>
                                • Never share this code with anyone<br>
                                • If you didn't request this, please ignore this email
                            </div>
                            
                            <p>If you have any questions, please contact our support team.</p>
                        </div>
                        <div class="footer">
                            <p>&copy; 2024 Sanrico Mercantile Inc. All rights reserved.</p>
                            <p>This is an automated message, please do not reply to this email.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        
        await emailTransporter.sendMail(mailOptions);
        
        res.json({ 
            success: true, 
            message: 'Verification email sent successfully' 
        });
        
    } catch (error) {
        console.error('Email sending error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send verification email' 
        });
    }
});

// Create and store verification code in AuthCodes collection
app.post('/api/auth/create-verification-code', async (req, res) => {
    try {
        const { email, userName } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }
        
        // Generate 4-digit verification code
        const verificationCode = Math.floor(1000 + Math.random() * 9000);
        
        const database = client.db(databaseName);
        const authCodesCollection = database.collection("AuthCodes");
        
        // Check if there's an existing code for this email
        await authCodesCollection.deleteMany({ email: email.toLowerCase() });
        
        // Create new verification code entry
        const codeEntry = {
            email: email.toLowerCase(),
            verificationCode: verificationCode,
            userName: userName || '',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes expiry
            used: false,
            attempts: 0,
            maxAttempts: 5
        };
        
        const result = await authCodesCollection.insertOne(codeEntry);
        
        if (result.insertedId) {
            
            res.json({ 
                success: true, 
                message: 'Verification code created successfully',
                codeId: result.insertedId,
                verificationCode: verificationCode // For immediate email sending
            });
        } else {
            throw new Error('Failed to save verification code');
        }
        
    } catch (error) {
        console.error('Error creating verification code:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create verification code' 
        });
    }
});

// Send verification email endpoint via n8n webhook
app.post('/api/auth/send-verification-email', async (req, res) => {
    try {
        const { email, userName, verificationCode, code } = req.body;
        
        // Use either 'code' or 'verificationCode' parameter
        const finalCode = code || verificationCode;
        
        if (!email || !finalCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and verification code are required' 
            });
        }
        
        console.log(`📧 Sending verification email via n8n for ${email}`);
        
        const emailData = {
            to: email,
            verificationCode: finalCode,
            userName: userName || '',
            type: 'verification'
        };
        
        // Send email via n8n webhook
        const n8nResponse = await fetch('http://localhost:5678/webhook/send-verification-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: email,
                verificationCode: finalCode,
                userName: userName || '',
                type: 'verification'
            })
        });
        
        if (!n8nResponse.ok) {
            console.error('❌ n8n webhook failed:', n8nResponse.status);
            throw new Error('Email service temporarily unavailable');
        }
        
        const n8nResult = await n8nResponse.json();
        
        res.json({ 
            success: true, 
            message: 'Verification email sent successfully' 
        });
        
    } catch (error) {
        console.error('❌ Email sending error:', error);
        
        // No fallback - force n8n only
        console.error('❌ N8N webhook failed. Error details:', error.message);
        
        res.status(500).json({ 
            success: false, 
            message: 'Email service unavailable. Please ensure n8n workflow is active and try again.' 
        });
    }
});

// Verify code from AuthCodes collection
app.post('/api/auth/verify-code', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and verification code are required' 
            });
        }
        
        const database = client.db(databaseName);
        const authCodesCollection = database.collection("AuthCodes");
        
        // Find the verification code entry
        const codeEntry = await authCodesCollection.findOne({ 
            email: email.toLowerCase(),
            used: false
        });
        
        if (!codeEntry) {
            return res.status(400).json({ 
                success: false, 
                message: 'No valid verification code found for this email' 
            });
        }
        
        // Check if code has expired
        if (new Date() > codeEntry.expiresAt) {
            await authCodesCollection.updateOne(
                { _id: codeEntry._id },
                { $set: { used: true, expiredAt: new Date() } }
            );
            return res.status(400).json({ 
                success: false, 
                message: 'Verification code has expired. Please request a new one.' 
            });
        }
        
        // Check if max attempts reached
        if (codeEntry.attempts >= codeEntry.maxAttempts) {
            await authCodesCollection.updateOne(
                { _id: codeEntry._id },
                { $set: { used: true, maxAttemptsReached: true } }
            );
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum verification attempts exceeded. Please request a new code.' 
            });
        }
        
        // Verify the code
        if (String(codeEntry.verificationCode) !== String(code)) {
            // Increment attempts
            await authCodesCollection.updateOne(
                { _id: codeEntry._id },
                { $inc: { attempts: 1 } }
            );
            
            const remainingAttempts = codeEntry.maxAttempts - (codeEntry.attempts + 1);
            return res.status(400).json({ 
                success: false, 
                message: `Invalid verification code. ${remainingAttempts} attempts remaining.` 
            });
        }
        
        // Code is valid - mark as used
        await authCodesCollection.updateOne(
            { _id: codeEntry._id },
            { 
                $set: { 
                    used: true, 
                    verifiedAt: new Date(),
                    successful: true
                } 
            }
        );
        
        
        res.json({ 
            success: true, 
            message: 'Verification code verified successfully',
            userName: codeEntry.userName
        });
        
    } catch (error) {
        console.error('Error verifying code:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify code' 
        });
    }
});

// Check email existence endpoint
app.post('/api/auth/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }
        
        // Check if email exists in UserCredentials collection
        const db = await connectToDatabase();
        const existingUser = await db.collection('UserCredentials').findOne({ email: email.toLowerCase() });
        
        res.json({ 
            success: true, 
            exists: !!existingUser 
        });
        
    } catch (error) {
        console.error('Email check error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error checking email' 
        });
    }
});

// Invalidate all verification codes for an email (cancel registration)
app.post('/api/auth/invalidate-codes', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }
        
        const db = await connectToDatabase();
        const authCodesCollection = db.collection('AuthCodes');
        
        // Mark all active codes for this email as used/invalid
        const result = await authCodesCollection.updateMany(
            { 
                email: email.toLowerCase(),
                used: false,
                expiresAt: { $gt: new Date() }
            },
            { 
                $set: { 
                    used: true,
                    cancelledAt: new Date(),
                    cancelled: true
                } 
            }
        );
        
        
        res.json({ 
            success: true, 
            message: 'All verification codes invalidated',
            invalidatedCount: result.modifiedCount
        });
        
    } catch (error) {
        console.error('Error invalidating codes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error invalidating verification codes' 
        });
    }
});

// Complete registration endpoint (after email verification)
app.post('/api/auth/complete-registration', async (req, res) => {
    try {
        const { fullname, email, password } = req.body;
        
        if (!fullname || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        // Enforce password policy: 7–12 chars, include a digit, an uppercase, and one of . or !
        const passwordPolicy = /^(?=.{7,12}$)(?=.*\d)(?=.*[A-Z])(?=.*[\.!]).*$/;
        if (!passwordPolicy.test(String(password))) {
            return res.status(400).json({
                success: false,
                message: 'Password must be 7–12 chars and include a number, an uppercase letter, and one of . or !'
            });
        }
        
        const db = await connectToDatabase();
        
        // Check if user already exists in UserCredentials collection
        const existingUser = await db.collection('UserCredentials').findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email already exists' 
            });
        }
        
        // Hash password for security
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create user credentials object for UserCredentials collection
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
        
        // Save to UserCredentials collection (only after successful verification)
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
            
            // Log successful registration
            
            // Return success response
            res.status(201).json({
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
        console.error('❌ Registration completion error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to complete registration' 
        });
    }
});

// User login endpoint - Updated to use UserCredentials collection
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Input validation and sanitization
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }
        
        // Sanitize inputs
        const sanitizedEmail = String(email).trim().toLowerCase();
        const sanitizedPassword = String(password).trim();
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedEmail)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }
        
        // Validate password length
        if (sanitizedPassword.length < 6 || sanitizedPassword.length > 128) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid password format' 
            });
        }
        
        const db = await connectToDatabase();
        
        // Find user in UserCredentials collection
        const user = await db.collection('UserCredentials').findOne({ 
            email: sanitizedEmail 
        });
        
        if (!user) {
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
        
        // Verify password
        const passwordMatch = await bcrypt.compare(sanitizedPassword, user.password);
        
        if (!passwordMatch) {
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
        
        // Generate JWT token with strong secret
        const jwtSecret = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-key-here-change-this-in-production-123456789012345678901234567890';
        const token = jwt.sign(
            { 
                userId: user._id, 
                email: user.email,
                fullName: user.fullName,
                verified: user.emailVerified,
                iat: Math.floor(Date.now() / 1000)
            },
            jwtSecret,
            { 
                expiresIn: '7d',
                issuer: 'sanrico-mercantile',
                audience: 'sanrico-users'
            }
        );
        
        // Log successful login
        
        // Return success response (don't include password)
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
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Login failed. Please try again.' 
        });
    }
});

// API endpoint to get staff notifications
app.get('/api/staff/notifications', async (req, res) => {
    try {
        console.log('🔔 Fetching staff notifications');

        const database = client.db(databaseName);
        const staffNotificationsCollection = database.collection("StaffNotifications");

        // Get all unread notifications, sorted by creation date (newest first)
        const notifications = await staffNotificationsCollection.aggregate([
            { $match: { read: false } },
            { $sort: { createdAt: -1 } }
        ], { allowDiskUse: true }).toArray();


        res.json({
            success: true,
            count: notifications.length,
            notifications: notifications
        });

    } catch (error) {
        console.error("❌ Error fetching staff notifications:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch staff notifications",
            error: error.message
        });
    }
});

// API endpoint to mark staff notification as read
app.put('/api/staff/notifications/:notificationId/read', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { notificationId } = req.params;

        console.log(`📖 Marking notification ${notificationId} as read`);

        const database = client.db(databaseName);
        const staffNotificationsCollection = database.collection("StaffNotifications");

        const result = await staffNotificationsCollection.updateOne(
            { _id: new ObjectId(notificationId) },
            { $set: { read: true, readAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }


        res.json({
            success: true,
            message: "Notification marked as read"
        });

    } catch (error) {
        console.error("❌ Error marking notification as read:", error);
        res.status(500).json({
            success: false,
            message: "Failed to mark notification as read",
            error: error.message
        });
    }
});

// API endpoint to get all staff notifications (for history)
app.get('/api/staff/notifications/all', async (req, res) => {
    try {

        const database = client.db(databaseName);
        const staffNotificationsCollection = database.collection("StaffNotifications");

        // Get all notifications, sorted by creation date (newest first)
        const notifications = await staffNotificationsCollection.aggregate([
            { $match: {} },
            { $sort: { createdAt: -1 } },
            { $limit: 100 } // Limit to last 100 notifications
        ], { allowDiskUse: true }).toArray();


        res.json({
            success: true,
            count: notifications.length,
            notifications: notifications
        });

    } catch (error) {
        console.error("❌ Error fetching all staff notifications:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch all staff notifications",
            error: error.message
        });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    connectToMongo();
});
