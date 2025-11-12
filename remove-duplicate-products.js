const { MongoClient } = require('mongodb');

// MongoDB connection string
const uri = "mongodb+srv://24uglyandrew:weaklings162@sanricofree.tesbmqx.mongodb.net/";
const client = new MongoClient(uri);

// Calculate similarity between two strings (0-1, where 1 is identical)
function stringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1;
    
    // One contains the other (high similarity)
    if (s1.includes(s2) || s2.includes(s1)) {
        const longer = Math.max(s1.length, s2.length);
        const shorter = Math.min(s1.length, s2.length);
        return shorter / longer;
    }
    
    // Calculate Levenshtein distance
    const distance = levenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);
    return 1 - (distance / maxLen);
}

// Levenshtein distance calculation
function levenshteinDistance(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2;
    if (len2 === 0) return len1;

    // Initialize matrix
    for (let i = 0; i <= len2; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len1; j++) {
        matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1       // deletion
                );
            }
        }
    }

    return matrix[len2][len1];
}

// Normalize product name for comparison (remove extra spaces, special chars)
function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ') // Multiple spaces to single space
        .replace(/[^\w\s]/g, '') // Remove special characters
        .trim();
}

// Calculate product quality score (higher = better product to keep)
function calculateProductScore(product) {
    let score = 0;

    // Image quality (2 points for custom image)
    if (product.image && product.image !== 'images/sanrico_logo_1.png' && !product.image.includes('sanrico_logo')) {
        score += 2;
    }

    // Price information (1 point)
    const hasPrice = product.SellingPrice || product.sellingPrice || product.Price || product.price;
    if (hasPrice) {
        score += 1;
        // Bonus for higher price (indicates more valuable product)
        const price = parseFloat(product.SellingPrice || product.sellingPrice || product.Price || product.price || 0);
        if (price > 0) score += Math.min(price / 1000, 2); // Max 2 bonus points
    }

    // Description quality (1-2 points)
    if (product.description && product.description.length > 10) {
        score += 1;
        if (product.description.length > 50) score += 1; // Bonus for longer descriptions
    }

    // Stock information (1 point, bonus for higher stock)
    if (product.stockQuantity !== undefined && product.stockQuantity !== null) {
        score += 1;
        if (product.stockQuantity > 0) score += 1; // Bonus for in-stock items
        if (product.stockQuantity > 10) score += 0.5; // Extra bonus for good stock
    }

    // Active status (1 point)
    if (product.isActive !== false) {
        score += 1;
    }

    // Category information (0.5 points)
    if (product.category && product.category.trim().length > 0) {
        score += 0.5;
    }

    // Name quality (0.5 points for longer, more descriptive names)
    if (product.name && product.name.length > 10) {
        score += 0.5;
    }

    // Prefer newer products (if has createdAt) - small bonus
    if (product.createdAt) {
        const age = Date.now() - new Date(product.createdAt).getTime();
        const daysOld = age / (1000 * 60 * 60 * 24);
        if (daysOld < 30) score += 0.5; // Bonus for recent products
    }

    return score;
}

// Determine which product to keep (prefer one with more complete data)
function chooseProductToKeep(products) {
    return products.reduce((best, current) => {
        const bestScore = calculateProductScore(best);
        const currentScore = calculateProductScore(current);
        return currentScore > bestScore ? current : best;
    });
}

async function removeDuplicateProducts() {
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const database = client.db("MyProductsDb");
        const collection = database.collection("Products");

        const TARGET_PRODUCT_COUNT = 90;

        // Get all products
        console.log('\n📦 Fetching all products...');
        const allProducts = await collection.find({}).toArray();
        console.log(`   Found ${allProducts.length} total products`);
        
        if (allProducts.length <= TARGET_PRODUCT_COUNT) {
            console.log(`\n✨ Already at or below target of ${TARGET_PRODUCT_COUNT} products!`);
            console.log(`   No deletion needed.`);
            return;
        }

        // Group products by normalized name
        const productsByName = new Map();
        
        for (const product of allProducts) {
            if (!product.name) continue;
            
            const normalized = normalizeName(product.name);
            if (!normalized) continue;
            
            if (!productsByName.has(normalized)) {
                productsByName.set(normalized, []);
            }
            productsByName.get(normalized).push(product);
        }

        // Find exact duplicates (same normalized name)
        const exactDuplicates = [];
        for (const [normalizedName, products] of productsByName.entries()) {
            if (products.length > 1) {
                exactDuplicates.push({ normalizedName, products });
            }
        }

        console.log(`\n🔍 Found ${exactDuplicates.length} groups of exact duplicates`);

        // Find similar products (different normalized names but similar)
        const similarGroups = [];
        const processed = new Set();
        
        const productArray = Array.from(productsByName.entries());
        for (let i = 0; i < productArray.length; i++) {
            const [name1, products1] = productArray[i];
            if (processed.has(name1)) continue;
            
            const similar = [products1];
            
            for (let j = i + 1; j < productArray.length; j++) {
                const [name2, products2] = productArray[j];
                if (processed.has(name2)) continue;
                
                // Check similarity between names
                const similarity = stringSimilarity(name1, name2);
                
                // If similarity is high (>= 0.85), consider them duplicates
                if (similarity >= 0.85) {
                    similar.push(products2);
                    processed.add(name2);
                }
            }
            
            if (similar.length > 1) {
                // Flatten the array of product arrays
                const allSimilar = similar.flat();
                similarGroups.push(allSimilar);
                processed.add(name1);
            }
        }

        console.log(`🔍 Found ${similarGroups.length} groups of similar products`);

        // Process exact duplicates
        let exactDuplicatesDeleted = 0;
        const exactDuplicatesToDelete = [];

        for (const { normalizedName, products } of exactDuplicates) {
            const toKeep = chooseProductToKeep(products);
            const toDelete = products.filter(p => p._id.toString() !== toKeep._id.toString());
            
            exactDuplicatesDeleted += toDelete.length;
            exactDuplicatesToDelete.push(...toDelete.map(p => p._id));
            
            console.log(`   "${normalizedName}": Keeping 1, deleting ${toDelete.length}`);
        }

        // Process similar products
        let similarDeleted = 0;
        const similarToDelete = [];

        for (const products of similarGroups) {
            const toKeep = chooseProductToKeep(products);
            const toDelete = products.filter(p => p._id.toString() !== toKeep._id.toString());
            
            similarDeleted += toDelete.length;
            similarToDelete.push(...toDelete.map(p => p._id));
            
            const names = products.map(p => p.name).join(', ');
            console.log(`   Similar group: Keeping 1, deleting ${toDelete.length} (${names.substring(0, 60)}...)`);
        }

        // After removing duplicates, if still above target, remove lowest quality products
        const productsAfterDedupe = allProducts.filter(p => {
            const allToDelete = [...exactDuplicatesToDelete, ...similarToDelete];
            return !allToDelete.some(id => id.toString() === p._id.toString());
        });

        console.log(`\n📊 After removing duplicates: ${productsAfterDedupe.length} products remaining`);
        
        let finalToDelete = [...exactDuplicatesToDelete, ...similarToDelete];
        let productsToKeep = productsAfterDedupe;

        // If still above target, remove lowest quality products
        if (productsAfterDedupe.length > TARGET_PRODUCT_COUNT) {
            console.log(`\n🎯 Target: ${TARGET_PRODUCT_COUNT} products`);
            console.log(`   Need to remove ${productsAfterDedupe.length - TARGET_PRODUCT_COUNT} more products`);
            
            // Score all remaining products
            const scoredProducts = productsAfterDedupe.map(product => ({
                product,
                score: calculateProductScore(product)
            }));

            // Sort by score (highest first)
            scoredProducts.sort((a, b) => b.score - a.score);

            // Keep top TARGET_PRODUCT_COUNT products
            const topProducts = scoredProducts.slice(0, TARGET_PRODUCT_COUNT);
            const bottomProducts = scoredProducts.slice(TARGET_PRODUCT_COUNT);

            productsToKeep = topProducts.map(sp => sp.product);
            const lowQualityToDelete = bottomProducts.map(sp => sp.product._id);

            finalToDelete = [...finalToDelete, ...lowQualityToDelete];

            console.log(`\n📉 Removing ${bottomProducts.length} lowest quality products:`);
            console.log(`   Lowest scores: ${bottomProducts.slice(0, 5).map(sp => `${sp.product.name} (score: ${sp.score.toFixed(1)})`).join(', ')}`);
            console.log(`   Highest scores kept: ${topProducts.slice(-5).map(sp => `${sp.product.name} (score: ${sp.score.toFixed(1)})`).join(', ')}`);
        }

        const totalToDelete = finalToDelete.length;

        if (totalToDelete === 0) {
            console.log('\n✨ No products to delete! Database is clean.');
            return;
        }

        // Show summary
        console.log('\n📊 Summary:');
        console.log(`   Exact duplicates: ${exactDuplicatesDeleted} products to delete`);
        console.log(`   Similar products: ${similarDeleted} products to delete`);
        if (productsAfterDedupe.length > TARGET_PRODUCT_COUNT) {
            console.log(`   Low quality products: ${productsAfterDedupe.length - TARGET_PRODUCT_COUNT} products to delete`);
        }
        console.log(`   Total to delete: ${totalToDelete} products`);
        console.log(`   Products remaining: ${TARGET_PRODUCT_COUNT} (target achieved)`);

        // Show sample of what would be deleted
        console.log('\n📋 Sample products that would be deleted (first 10):');
        const sampleToDelete = finalToDelete.slice(0, 10);
        for (const id of sampleToDelete) {
            const product = allProducts.find(p => p._id.toString() === id.toString());
            if (product) {
                const score = calculateProductScore(product);
                console.log(`   - ${product.name} (score: ${score.toFixed(1)}, ID: ${id})`);
            }
        }
        if (finalToDelete.length > 10) {
            console.log(`   ... and ${finalToDelete.length - 10} more`);
        }

        // Ask for confirmation
        console.log('\n⚠️  WARNING: This will permanently delete products from the database!');
        
        // Check if --confirm flag is passed
        const confirmFlag = process.argv.includes('--confirm') || process.argv.includes('-y');
        
        if (!confirmFlag) {
            console.log('\n💡 To actually delete duplicates, run:');
            console.log('   npm run remove-duplicates -- --confirm');
            console.log('   or');
            console.log('   node remove-duplicate-products.js --confirm');
        } else {
            console.log('\n🗑️  Deleting products to reach target of 90...');
            if (finalToDelete.length > 0) {
                const result = await collection.deleteMany({ _id: { $in: finalToDelete } });
                console.log(`\n✅ Successfully deleted ${result.deletedCount} products!`);
                
                // Verify final count
                const finalCount = await collection.countDocuments({});
                console.log(`   Products remaining: ${finalCount} (target: ${TARGET_PRODUCT_COUNT})`);
                
                if (finalCount <= TARGET_PRODUCT_COUNT) {
                    console.log(`   🎯 Target achieved!`);
                } else {
                    console.log(`   ⚠️  Still ${finalCount - TARGET_PRODUCT_COUNT} above target. Run again to remove more.`);
                }
            }
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
removeDuplicateProducts()
    .then(() => {
        console.log('\n🎉 Script completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });

