const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// MongoDB connection string
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
const client = new MongoClient(uri);

// Create images directory if it doesn't exist
const IMAGES_DIR = path.join(__dirname, 'images', 'products');
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    console.log(`📁 Created directory: ${IMAGES_DIR}`);
}

// Extract base64 image and save as file
function saveBase64Image(base64String, productId, productName) {
    try {
        // Parse base64 string (format: data:image/png;base64,...)
        const matches = base64String.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
            console.log(`   ⚠️  Invalid base64 format for product: ${productName}`);
            return null;
        }

        const imageType = matches[1]; // png, jpeg, jpg, etc.
        const imageData = matches[2];
        
        // Sanitize product name for filename
        const sanitizedName = productName
            .replace(/[^a-z0-9]/gi, '_')
            .substring(0, 50)
            .toLowerCase();
        
        // Generate filename: productId_sanitizedName.extension
        const filename = `${productId}_${sanitizedName}.${imageType}`;
        const filepath = path.join(IMAGES_DIR, filename);
        
        // Convert base64 to buffer and save
        const buffer = Buffer.from(imageData, 'base64');
        fs.writeFileSync(filepath, buffer);
        
        // Return relative URL path
        return `images/products/${filename}`;
    } catch (error) {
        console.error(`   ❌ Error saving image for ${productName}:`, error.message);
        return null;
    }
}

// Get image size in KB
function getImageSize(base64String) {
    if (!base64String) return 0;
    // Base64 is ~33% larger than binary, so divide by 1.33
    const size = (base64String.length * 3) / 4 / 1024;
    return size;
}

async function extractBase64Images() {
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
            console.log('✨ No base64 images found! Database is already optimized.');
            return;
        }

        // Calculate total size savings
        let totalBase64Size = 0;
        let totalSaved = 0;
        let totalFailed = 0;
        const updates = [];

        console.log('📦 Processing images...\n');

        for (const product of productsWithBase64) {
            const base64Size = getImageSize(product.image);
            totalBase64Size += base64Size;

            console.log(`   Processing: ${product.name}`);
            console.log(`     Base64 size: ${base64Size.toFixed(2)} KB`);

            // Save image to file
            const imageUrl = saveBase64Image(
                product.image,
                product._id.toString(),
                product.name || 'unnamed'
            );

            if (imageUrl) {
                // Get file size after saving
                const filepath = path.join(IMAGES_DIR, path.basename(imageUrl));
                const fileSize = fs.existsSync(filepath) 
                    ? (fs.statSync(filepath).size / 1024).toFixed(2)
                    : 0;
                
                console.log(`     Saved as: ${imageUrl} (${fileSize} KB)`);
                console.log(`     Size reduction: ${(base64Size - parseFloat(fileSize)).toFixed(2)} KB`);

                // Prepare update (remove base64, use URL)
                updates.push({
                    filter: { _id: product._id },
                    update: { $set: { image: imageUrl } }
                });

                totalSaved++;
            } else {
                console.log(`     ❌ Failed to save image`);
                totalFailed++;
            }
            console.log('');
        }

        // Show summary
        console.log('\n📊 Summary:');
        console.log(`   Total products with base64: ${productsWithBase64.length}`);
        console.log(`   Successfully extracted: ${totalSaved}`);
        console.log(`   Failed: ${totalFailed}`);
        console.log(`   Total base64 size: ${totalBase64Size.toFixed(2)} KB (${(totalBase64Size / 1024).toFixed(2)} MB)`);
        
        // Estimate file size (base64 is ~33% larger)
        const estimatedFileSize = totalBase64Size / 1.33;
        const sizeReduction = totalBase64Size - estimatedFileSize;
        console.log(`   Estimated file size: ${estimatedFileSize.toFixed(2)} KB`);
        console.log(`   Size reduction: ${sizeReduction.toFixed(2)} KB (${(sizeReduction / 1024).toFixed(2)} MB)`);
        console.log(`   Database size reduction: ~${(sizeReduction * 1.33).toFixed(2)} KB`);

        if (updates.length === 0) {
            console.log('\n⚠️  No images were successfully extracted. Nothing to update.');
            return;
        }

        // Ask for confirmation
        console.log('\n⚠️  WARNING: This will replace base64 images with file URLs in the database!');
        
        // Check if --confirm flag is passed
        const confirmFlag = process.argv.includes('--confirm') || process.argv.includes('-y');
        
        if (!confirmFlag) {
            console.log('\n💡 To actually update the database, run:');
            console.log('   npm run extract-images -- --confirm');
            console.log('   or');
            console.log('   node extract-base64-images.js --confirm');
            console.log('\n📝 Preview of updates (first 5):');
            updates.slice(0, 5).forEach(({ filter, update }) => {
                const product = productsWithBase64.find(p => p._id.toString() === filter._id.toString());
                console.log(`   - ${product.name}: ${product.image.substring(0, 50)}... → ${update.$set.image}`);
            });
        } else {
            console.log('\n💾 Updating database...');
            
            // Update all products in batch
            let updatedCount = 0;
            for (const { filter, update } of updates) {
                try {
                    await collection.updateOne(filter, update);
                    updatedCount++;
                } catch (error) {
                    console.error(`   ❌ Failed to update ${filter._id}:`, error.message);
                }
            }

            console.log(`\n✅ Successfully updated ${updatedCount} products!`);
            console.log(`   Images saved to: ${IMAGES_DIR}`);
            console.log(`   Database documents are now much smaller!`);
            
            // Verify the update
            const remainingBase64 = await collection.countDocuments({
                image: { $regex: /^data:image/ }
            });
            console.log(`   Products still with base64: ${remainingBase64}`);
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
extractBase64Images()
    .then(() => {
        console.log('\n🎉 Script completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });

