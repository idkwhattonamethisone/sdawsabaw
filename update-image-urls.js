const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// MongoDB connection string
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
const client = new MongoClient(uri);

const IMAGES_DIR = path.join(__dirname, 'images', 'products');

async function updateImageUrls() {
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const database = client.db("MyProductsDb");
        const collection = database.collection("Products");

        // Find all products with base64 images
        console.log('🔍 Finding products with base64 images...');
        const productsWithBase64 = await collection.find({
            image: { $regex: /^data:image/ }
        }).toArray();

        console.log(`   Found ${productsWithBase64.length} products with base64 images\n`);

        if (productsWithBase64.length === 0) {
            console.log('✨ No base64 images found in database! All images are already converted.');
            return;
        }

        // Check if images directory exists
        if (!fs.existsSync(IMAGES_DIR)) {
            console.log('❌ Images directory not found!');
            console.log(`   Expected: ${IMAGES_DIR}`);
            console.log('   💡 Run: npm run extract-images -- --confirm (to extract images first)');
            return;
        }

        // Get list of extracted image files
        const extractedFiles = fs.readdirSync(IMAGES_DIR);
        console.log(`📁 Found ${extractedFiles.length} extracted image files\n`);

        // Create a map of product ID to image file
        const imageMap = new Map();
        extractedFiles.forEach(filename => {
            // Filename format: productId_sanitizedName.extension
            const match = filename.match(/^([^_]+)_/);
            if (match) {
                const productId = match[1];
                const imageUrl = `images/products/${filename}`;
                imageMap.set(productId, imageUrl);
            }
        });

        console.log(`   Mapped ${imageMap.size} product IDs to image files\n`);

        // Update products
        let updatedCount = 0;
        let notFoundCount = 0;
        const updates = [];

        console.log('🔄 Matching products with extracted images...\n');

        for (const product of productsWithBase64) {
            const productId = product._id.toString();
            const imageUrl = imageMap.get(productId);

            if (imageUrl) {
                // Verify file exists
                const filepath = path.join(IMAGES_DIR, path.basename(imageUrl));
                if (fs.existsSync(filepath)) {
                    updates.push({
                        filter: { _id: product._id },
                        update: { $set: { image: imageUrl } },
                        productName: product.name
                    });
                    console.log(`   ✓ ${product.name}: ${imageUrl}`);
                } else {
                    console.log(`   ⚠️  ${product.name}: File not found at ${filepath}`);
                    notFoundCount++;
                }
            } else {
                console.log(`   ⚠️  ${product.name}: No extracted image found (ID: ${productId})`);
                notFoundCount++;
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Products with base64: ${productsWithBase64.length}`);
        console.log(`   Images found and ready to update: ${updates.length}`);
        console.log(`   Images not found: ${notFoundCount}`);

        if (updates.length === 0) {
            console.log('\n⚠️  No matching images found to update.');
            console.log('   💡 Make sure you ran: npm run extract-images -- --confirm');
            return;
        }

        // Ask for confirmation
        console.log('\n⚠️  WARNING: This will replace base64 images with file URLs in the database!');
        
        // Check if --confirm flag is passed
        const confirmFlag = process.argv.includes('--confirm') || process.argv.includes('-y');
        
        if (!confirmFlag) {
            console.log('\n💡 To actually update the database, run:');
            console.log('   npm run update-images -- --confirm');
            console.log('   or');
            console.log('   node update-image-urls.js --confirm');
            console.log('\n📝 Preview of updates (first 5):');
            updates.slice(0, 5).forEach(({ productName, update }) => {
                console.log(`   - ${productName}: → ${update.$set.image}`);
            });
        } else {
            console.log('\n💾 Updating database...\n');
            
            // Update all products
            for (const { filter, update, productName } of updates) {
                try {
                    const result = await collection.updateOne(filter, update);
                    if (result.modifiedCount > 0) {
                        updatedCount++;
                        console.log(`   ✓ Updated: ${productName}`);
                    } else {
                        console.log(`   ⚠️  No change: ${productName}`);
                    }
                } catch (error) {
                    console.error(`   ❌ Failed to update ${productName}:`, error.message);
                }
            }

            console.log(`\n✅ Successfully updated ${updatedCount} products!`);
            
            // Verify the update
            const remainingBase64 = await collection.countDocuments({
                image: { $regex: /^data:image/ }
            });
            console.log(`   Products still with base64: ${remainingBase64}`);
            
            if (remainingBase64 === 0) {
                console.log(`   🎉 All base64 images converted to file URLs!`);
            }

            // Calculate size reduction
            const avgBase64Size = 272.65; // KB (from your diagnostic)
            const estimatedReduction = (updatedCount * avgBase64Size * 0.9) / 1024; // 90% reduction
            console.log(`   Estimated database size reduction: ~${estimatedReduction.toFixed(2)} MB`);
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
updateImageUrls()
    .then(() => {
        console.log('\n🎉 Script completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });

