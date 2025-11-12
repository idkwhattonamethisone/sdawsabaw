const { MongoClient } = require('mongodb');

// MongoDB connection string
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
const client = new MongoClient(uri);

async function checkDatabasePerformance() {
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const database = client.db("MyProductsDb");
        const collection = database.collection("Products");

        // Get collection stats
        console.log('📊 Collection Statistics:');
        const stats = await database.command({ collStats: "Products" });
        
        console.log(`   Total documents: ${stats.count.toLocaleString()}`);
        console.log(`   Collection size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Average document size: ${(stats.avgObjSize / 1024).toFixed(2)} KB`);
        console.log(`   Total indexes: ${stats.nindexes}`);
        console.log(`   Index size: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);

        // Check for large documents
        console.log('\n🔍 Checking for large documents...');
        const largeDocs = await collection.find({})
            .sort({ $natural: -1 })
            .limit(5)
            .toArray();
        
        const docSizes = largeDocs.map(doc => {
            const size = Buffer.byteLength(JSON.stringify(doc)) / 1024;
            return { name: doc.name || 'Unnamed', size: size.toFixed(2) + ' KB' };
        });
        
        console.log('   Sample document sizes:');
        docSizes.forEach(({ name, size }) => {
            console.log(`     - ${name.substring(0, 50)}: ${size}`);
        });

        // Check for products with base64 images (huge size)
        console.log('\n🖼️  Checking for base64 images (major performance issue)...');
        const productsWithBase64 = await collection.find({
            image: { $regex: /^data:image/ }
        }).limit(10).toArray();
        
        if (productsWithBase64.length > 0) {
            console.log(`   ⚠️  Found ${productsWithBase64.length} products with base64 images!`);
            console.log('   These can be HUGE (hundreds of KB each). Consider converting to URLs.');
            console.log('   Sample products:');
            productsWithBase64.slice(0, 5).forEach(p => {
                const imgSize = p.image ? (p.image.length / 1024).toFixed(2) : 0;
                console.log(`     - ${p.name}: ${imgSize} KB image`);
            });
        } else {
            console.log('   ✅ No base64 images found (good!)');
        }

        // Check indexes
        console.log('\n📇 Checking indexes...');
        const indexes = await collection.indexes();
        console.log(`   Total indexes: ${indexes.length}`);
        
        const indexNames = indexes.map(idx => idx.name);
        const importantIndexes = ['idx_name', 'idx_sellingPrice', 'idx_isActive', 'idx_category', 'idx_isActive_name'];
        const missingIndexes = importantIndexes.filter(name => !indexNames.includes(name));
        
        if (missingIndexes.length > 0) {
            console.log(`   ⚠️  Missing important indexes: ${missingIndexes.join(', ')}`);
            console.log('   💡 Run: npm run create-indexes');
        } else {
            console.log('   ✅ Important indexes present');
        }
        
        console.log('\n   Current indexes:');
        indexes.forEach(idx => {
            const keys = Object.keys(idx.key).join(', ');
            console.log(`     - ${idx.name}: ${keys}`);
        });

        // Check for products with very long descriptions
        console.log('\n📝 Checking for products with very long descriptions...');
        const longDescProducts = await collection.aggregate([
            {
                $project: {
                    name: 1,
                    descLength: { $strLenCP: { $ifNull: ['$description', ''] } }
                }
            },
            { $match: { descLength: { $gt: 1000 } } },
            { $sort: { descLength: -1 } },
            { $limit: 5 }
        ]).toArray();
        
        if (longDescProducts.length > 0) {
            console.log(`   ⚠️  Found products with very long descriptions (>1KB):`);
            longDescProducts.forEach(p => {
                console.log(`     - ${p.name}: ${p.descLength} characters`);
            });
        } else {
            console.log('   ✅ No extremely long descriptions found');
        }

        // Performance recommendations
        console.log('\n💡 Performance Recommendations:');
        const recommendations = [];
        
        if (stats.count > 1000) {
            recommendations.push(`   ⚠️  Too many products (${stats.count}). Consider reducing to <500 for better performance.`);
        }
        
        if (stats.avgObjSize > 50) {
            recommendations.push(`   ⚠️  Large average document size (${(stats.avgObjSize / 1024).toFixed(2)} KB). Consider removing large fields.`);
        }
        
        if (missingIndexes.length > 0) {
            recommendations.push(`   ⚠️  Missing indexes. Run: npm run create-indexes`);
        }
        
        if (productsWithBase64.length > 0) {
            recommendations.push(`   ⚠️  Base64 images found. Convert to URLs to reduce size by 90%+.`);
        }
        
        if (stats.count > 90) {
            recommendations.push(`   ⚠️  Too many products. Run: npm run remove-duplicates -- --confirm (reduces to 90)`);
        }
        
        if (recommendations.length === 0) {
            console.log('   ✅ Database looks optimized!');
        } else {
            recommendations.forEach(rec => console.log(rec));
        }

        // Estimate query performance
        console.log('\n⚡ Query Performance Estimate:');
        const hasIndexes = indexes.length > 1; // More than just _id index
        const productCount = stats.count;
        
        if (!hasIndexes && productCount > 100) {
            console.log('   ⚠️  Queries will be SLOW - scanning all documents');
            console.log('   💡 Create indexes: npm run create-indexes');
        } else if (hasIndexes && productCount < 500) {
            console.log('   ✅ Queries should be fast with indexes');
        } else if (productCount > 500) {
            console.log('   ⚠️  Large collection - queries may be slow even with indexes');
            console.log('   💡 Reduce product count: npm run remove-duplicates -- --confirm');
        }

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await client.close();
        console.log('\n🔌 Connection closed');
    }
}

// Run the script
checkDatabasePerformance()
    .then(() => {
        console.log('\n🎉 Diagnostic completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });

