const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const os = require('os');

// n8n database path
const n8nDbPath = path.join(os.homedir(), '.n8n', 'database.sqlite');

console.log('🔐 n8n Password Reset Script');
console.log(`📍 Database location: ${n8nDbPath}`);
console.log('');

// Get new password from command line or use default
const newPassword = process.argv[2] || 'admin123';
const email = process.argv[3] || null;

try {
    // Connect to n8n database
    const db = new Database(n8nDbPath);
    
    console.log('✅ Connected to n8n database');
    
    // Check if user table exists
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE '%user%'
    `).all();
    
    console.log('📋 Found tables:', tables.map(t => t.name).join(', '));
    console.log('');
    
    // Try to find users - n8n might use different table names
    let users = [];
    
    // Check common table names
    const possibleTableNames = ['user', 'users', 'credentials_entity', 'auth_user'];
    
    for (const tableName of possibleTableNames) {
        try {
            const tableExists = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name = ?
            `).get(tableName);
            
            if (tableExists) {
                console.log(`✅ Found table: ${tableName}`);
                
                // Get all users from this table
                const allUsers = db.prepare(`SELECT * FROM ${tableName}`).all();
                console.log(`   Found ${allUsers.length} records`);
                
                if (allUsers.length > 0) {
                    console.log(`   Sample record:`, Object.keys(allUsers[0]));
                }
                
                users = allUsers;
                break;
            }
        } catch (err) {
            // Table doesn't exist, continue
        }
    }
    
    // If we found a user table, try to update password
    if (users.length > 0) {
        console.log('');
        console.log('👤 Available users:');
        users.forEach((user, index) => {
            const emailField = user.email || user.username || user.id || `User ${index + 1}`;
            console.log(`   ${index + 1}. ${emailField}`);
        });
        
        // Hash the new password
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        console.log('');
        console.log(`🔑 New password will be: ${newPassword}`);
        console.log(`🔐 Hashed password: ${hashedPassword.substring(0, 20)}...`);
        console.log('');
        
        // Determine which table and fields to use
        const user = users[0];
        const tableName = 'user'; // Try 'user' first
        const passwordField = 'password';
        const emailField = 'email';
        
        // Try to update password
        try {
            let updateQuery;
            
            if (email) {
                // Update specific user by email
                updateQuery = db.prepare(`
                    UPDATE ${tableName} 
                    SET ${passwordField} = ? 
                    WHERE ${emailField} = ?
                `);
                const result = updateQuery.run(hashedPassword, email);
                console.log(`✅ Password updated for user: ${email}`);
                console.log(`   Rows affected: ${result.changes}`);
            } else {
                // Update first user
                updateQuery = db.prepare(`
                    UPDATE ${tableName} 
                    SET ${passwordField} = ? 
                    LIMIT 1
                `);
                // SQLite doesn't support LIMIT in UPDATE, so we need to use WHERE with a condition
                // Get the first user's ID or email
                const firstUserId = user.id || user.email || Object.values(user)[0];
                const idField = user.id ? 'id' : (user.email ? 'email' : Object.keys(user)[0]);
                
                updateQuery = db.prepare(`
                    UPDATE ${tableName} 
                    SET ${passwordField} = ? 
                    WHERE ${idField} = ?
                `);
                const result = updateQuery.run(hashedPassword, firstUserId);
                console.log(`✅ Password updated for first user`);
                console.log(`   Rows affected: ${result.changes}`);
            }
            
            console.log('');
            console.log('🎉 Password reset successful!');
            console.log('');
            console.log('📝 Next steps:');
            console.log('   1. Open n8n at http://localhost:5678');
            console.log(`   2. Login with the new password: ${newPassword}`);
            console.log('   3. Change your password to something secure after logging in');
            
        } catch (err) {
            console.error('❌ Error updating password:', err.message);
            console.log('');
            console.log('🔍 Trying alternative approach...');
            
            // Show the actual table structure
            console.log('📊 Table structure:');
            const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
            tableInfo.forEach(col => {
                console.log(`   - ${col.name} (${col.type})`);
            });
        }
    } else {
        console.log('❌ No user table found in expected locations');
        console.log('');
        console.log('🔍 Available tables in database:');
        const allTables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table'
        `).all();
        allTables.forEach(table => {
            console.log(`   - ${table.name}`);
        });
    }
    
    db.close();
    
} catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('   1. Make sure n8n is not running');
    console.log('   2. Check if the database file exists at:', n8nDbPath);
    console.log('   3. Ensure you have read/write permissions');
    process.exit(1);
}

