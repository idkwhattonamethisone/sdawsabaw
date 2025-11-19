function formatPHPPrice(price) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(price);
}

class Auth {
    static googleRegister(idToken) {
        const payload = this.decodeGoogleToken(idToken);
        if (!payload.email) {
            return { success: false, message: 'Invalid Google token' };
        }

        const users = this.getUsers();
        if (users.find(user => user.email === payload.email)) {
            return { success: false, message: 'Email already registered' };
        }

        const username = payload.email.split('@')[0];
        const user = {
            id: Date.now(),
            fullName: payload.name || 'Google User',
            email: payload.email,
            username: username,
            profilePicture: payload.picture || null,
            createdAt: new Date().toISOString(),
            isGoogleAccount: true,
            usernameChanged: false  // Track if username has been changed
        };

        users.push(user);
        localStorage.setItem('users', JSON.stringify(users));
        this.setCurrentUser(user);
        return { success: true, message: 'Google registration successful' };
    }

    static googleLogin(idToken) {
        const payload = this.decodeGoogleToken(idToken);
        if (!payload.email) {
            return { success: false, message: 'Invalid Google token' };
        }

        const users = this.getUsers();
        const userIndex = users.findIndex(u => u.email === payload.email && u.isGoogleAccount);
        
        if (userIndex === -1) {
            return { success: false, message: 'User not registered with Google' };
        }
        
        // Update user with latest Google profile data
        if (payload.picture && users[userIndex].profilePicture !== payload.picture) {
            users[userIndex].profilePicture = payload.picture;
            localStorage.setItem('users', JSON.stringify(users));
        }
        
        this.setCurrentUser(users[userIndex]);
        return { success: true, message: 'Google login successful' };
    }

    static decodeGoogleToken(idToken) {
        try {
            const base64Url = idToken.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('Error decoding Google token:', e);
            return {};
        }
    }

    static async staffLogin(staffId, password) {
        try {
            // Call the MongoDB-based staff login API
            const response = await fetch('http://localhost:3000/api/staff/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: staffId,
                    password: password
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Create user object from MongoDB response
                const staffUser = {
                    id: result.user._id,
                    fullName: result.user.username, 
                    username: result.user.username,
                    staffId: result.user.username,
                    isStaff: result.user.isStaff,
                    isAdmin: result.user.isAdmin,
                    createdAt: new Date().toISOString()
                };
                
                this.setCurrentUser(staffUser);
                return { success: true, message: `Staff login successful for ${staffUser.username}` };
            } else {
                return { success: false, message: result.message };
            }
        } catch (error) {
            console.error('Error during staff login:', error);
            return { success: false, message: 'Login failed. Please check your credentials and try again.' };
        }
    }

    static logout() {
        try {
            // First remove any user-specific data
            const currentUser = this.getCurrentUser();
            if (currentUser) {
                
                // Clear any user-specific cart
                const userId = currentUser.id;
                const cartKey = `cart_${userId}`;
                localStorage.removeItem(cartKey);
            }
            
            // Then clear the current user from localStorage
            localStorage.removeItem('currentUser');
            localStorage.removeItem('staffAuth');
            return { success: true, message: 'Logout successful' };
        } catch (error) {
            console.error('Error during logout:', error);
            return { success: false, message: 'Logout failed due to an error: ' + error.message };
        }
    }

    static getCurrentUser() {
        return JSON.parse(localStorage.getItem('currentUser'));
    }

    static setCurrentUser(user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        // If this is a staff user, also set a backup flag
        if (user && user.isStaff) {
            localStorage.setItem('staffAuth', 'true');
        }
    }

    static getUsers() {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        
        // Migration: Add usernameChanged field to existing users who don't have it
        let needsUpdate = false;
        users.forEach(user => {
            if (user.usernameChanged === undefined) {
                user.usernameChanged = false;
                needsUpdate = true;
            }
        });
        
        if (needsUpdate) {
            localStorage.setItem('users', JSON.stringify(users));
        }
        
        return users;
    }

    static isLoggedIn() {
        return !!this.getCurrentUser();
    }

    static updateUserDetails(userId, fullName, email) {
        const users = this.getUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            return { success: false, message: 'User not found' };
        }

        if (users.some(u => u.email === email && u.id !== userId)) {
            return { success: false, message: 'Email already in use' };
        }

        users[userIndex].fullName = fullName;
        users[userIndex].email = email;
        users[userIndex].username = email.split('@')[0];
        localStorage.setItem('users', JSON.stringify(users));

        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.id === userId) {
            this.setCurrentUser(users[userIndex]);
        }

        return { success: true, message: 'Details updated successfully' };
    }

    static getUserAddress(userId) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.id === userId);
        return user?.address || '';
    }

    static getUserPhone(userId) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.id === userId);
        return user?.phoneNumber || '';
    }

    static updateUserProfile(userId, updates) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            users[userIndex] = { ...users[userIndex], ...updates };
            if (updates.email) {
                users[userIndex].username = updates.email.split('@')[0];
            }
            localStorage.setItem('users', JSON.stringify(users));
            const currentUser = this.getCurrentUser();
            if (currentUser && currentUser.id === userId) {
                this.setCurrentUser(users[userIndex]);
            }
        }
    }

    static updateUsername(userId, newUsername) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
            return { success: false, message: 'User not found' };
        }

        const user = users[userIndex];
        
        // Check if username has already been changed
        if (user.usernameChanged) {
            return { success: false, message: 'Username can only be changed once' };
        }

        // Check if username is already taken
        if (users.some(u => u.username === newUsername && u.id !== userId)) {
            return { success: false, message: 'Username already taken' };
        }

        // Validate username format
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(newUsername)) {
            return { success: false, message: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores' };
        }

        // Update username and mark as changed
        users[userIndex].username = newUsername;
        users[userIndex].usernameChanged = true;
        localStorage.setItem('users', JSON.stringify(users));

        // Update current user if this is the logged-in user
        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.id === userId) {
            this.setCurrentUser(users[userIndex]);
        }

        return { success: true, message: 'Username updated successfully' };
    }

    static getUserProfilePicture(userId) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.id === userId);
        if (!user) return null;
        
        // Priority: Custom uploaded image > Google profile picture > null
        return user.customProfilePicture || user.profilePicture || null;
    }

    static getUserGender(userId) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.id === userId);
        return user ? user.gender : null;
    }

    static updateUserGender(userId, gender) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
            return { success: false, message: 'User not found' };
        }

        // Update gender
        users[userIndex].gender = gender;
        localStorage.setItem('users', JSON.stringify(users));

        // Update current user if this is the logged-in user
        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.id === userId) {
            this.setCurrentUser(users[userIndex]);
        }

        return { success: true, message: 'Gender updated successfully' };
    }

    static addToCart(product) {
        if (!this.isLoggedIn()) {
            return { success: false, message: 'Please log in to add items to the cart.' };
        }
        const normalizeCategory = (raw) => {
            const val = String(raw || '').toLowerCase();
            const includesAny = (list) => list.some(k => val.includes(k));
            if (includesAny(['paint', 'painting'])) return 'paints';
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
        const productWithCategory = {
            ...product,
            category: product.category || 'unknown',
            categoryBucket: normalizeCategory(product.category)
        };
        const cart = new Cart();
        const result = cart.addItem(productWithCategory);
        this.updateCartCount();
        
        // Dispatch custom event to update cart tab
        window.dispatchEvent(new Event('cartUpdated'));
        
        return result;
    }

    static getCartCount() {
        const cart = new Cart();
        return cart.getItemCount();
    }

    static updateCartCount() {
        const cartCountElement = document.getElementById('cartCount');
        if (cartCountElement) {
            cartCountElement.textContent = this.getCartCount();
        }
        
        // Update cart tooltip with subtotal
        const cartBtn = document.getElementById('cartBtn');
        if (cartBtn) {
            const currentUser = this.getCurrentUser();
            const userId = currentUser ? currentUser.id : 'guest';
            const cartKey = `cart_${userId}`;
            
            try {
                const cartData = JSON.parse(localStorage.getItem(cartKey) || '{}');
                const items = cartData.items || [];
                const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                cartBtn.setAttribute('data-tooltip', formatPHPPrice(subtotal));
            } catch (error) {
                console.error('Error calculating cart subtotal for tooltip:', error);
                cartBtn.setAttribute('data-tooltip', '₱0.00');
            }
        }
    }

    static async getUserOrders(userId) {
        try {
            // Try to get from MongoDB first
            const response = await fetch(`http://localhost:3000/api/orders/${userId}`);
            if (response.ok) {
                const orders = await response.json();
                return orders;
            } else {
                console.warn('Failed to fetch orders from MongoDB, falling back to localStorage');
                // Fallback to localStorage
                const userCarts = JSON.parse(localStorage.getItem('userCarts') || '{}');
                return userCarts[userId] || [];
            }
        } catch (error) {
            console.error('Error fetching orders from MongoDB:', error);
            // Fallback to localStorage
            try {
                const userCarts = JSON.parse(localStorage.getItem('userCarts') || '{}');
                return userCarts[userId] || [];
            } catch (localError) {
                console.error('Error parsing userCarts from localStorage:', localError);
                return [];
            }
        }
    }

    static async updateOrderPaymentDetails(userId, orderIndex, paymentUpdates) {
        try {
            // First try to get orders from MongoDB
            const orders = await this.getUserOrders(userId);
            
            if (orders[orderIndex] && orders[orderIndex]._id) {
                // Update in MongoDB if order has MongoDB _id
                const response = await fetch(`http://localhost:3000/api/orders/${orders[orderIndex]._id}/payment`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ paymentUpdates })
                });
                
                if (response.ok) {
                    return { success: true, message: 'Payment details updated successfully in MongoDB' };
                } else {
                    console.warn('Failed to update in MongoDB, falling back to localStorage');
                }
            }
            
            // Fallback to localStorage update
            const userCarts = JSON.parse(localStorage.getItem('userCarts') || '{}');
            if (userCarts[userId] && userCarts[userId][orderIndex]) {
                userCarts[userId][orderIndex].payment = {
                    ...userCarts[userId][orderIndex].payment,
                    ...paymentUpdates
                };
                localStorage.setItem('userCarts', JSON.stringify(userCarts));
                return { success: true, message: 'Payment details updated successfully in localStorage' };
            }
            
            return { success: false, message: 'Order not found' };
        } catch (error) {
            console.error('Error updating order payment details:', error);
            return { success: false, message: 'Failed to update payment details' };
        }
    }

    static async checkout(paymentDetails = {}) {
        if (!this.isLoggedIn()) {
            return { success: false, message: 'Please login to checkout.' };
        }
    
        const myCart = new Cart();
        if (myCart.getItemCount() === 0) {
            return { success: false, message: 'Your cart is empty.' };
        }
    
        const currentUser = this.getCurrentUser();
        const order = {
            items: myCart.getItems(),
            notes: myCart.notes,
            date: new Date().toISOString(),
            payment: paymentDetails,
            status: 'Pending',
            buyerinfo: currentUser.username || currentUser.fullName,
            username: currentUser.username || currentUser.fullName
        };
    
        try {
            // Save to MongoDB first
            const response = await fetch('http://localhost:3000/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: currentUser.id.toString(),
                    order: order
                })
            });
            
            if (response.ok) {
                const result = await response.json();
            } else {
                console.warn('Failed to save to MongoDB, falling back to localStorage');
                // Fallback to localStorage
                let userCarts = JSON.parse(localStorage.getItem('userCarts') || '{}');
                if (!userCarts[currentUser.id]) {
                    userCarts[currentUser.id] = [];
                }
                userCarts[currentUser.id].push(order);
                localStorage.setItem('userCarts', JSON.stringify(userCarts));
            }
        } catch (error) {
            console.error('Error saving order to MongoDB:', error);
            // Fallback to localStorage
            try {
                let userCarts = JSON.parse(localStorage.getItem('userCarts') || '{}');
                if (!userCarts[currentUser.id]) {
                    userCarts[currentUser.id] = [];
                }
                userCarts[currentUser.id].push(order);
                localStorage.setItem('userCarts', JSON.stringify(userCarts));
            } catch (localError) {
                console.error('Error saving order to localStorage:', localError);
                return { success: false, message: 'Checkout failed: Unable to save order.' };
            }
        }
    
        myCart.clearCart();
        return { success: true, message: 'Checkout successful! Order placed.' };
    }

    static updateUIAfterLogin() {
        // Update the account button to show user info
        if (typeof updateAccountButton === 'function') {
            updateAccountButton();
        }
        
        // Update top login button text
        if (typeof updateTopLoginBtn === 'function') {
            updateTopLoginBtn();
        }
        
        // Update cart count
        this.updateCartCount();
        
        // Redirect staff if needed
        this.redirectIfStaff();
    }

    static redirectIfStaff() {
        if (this.isLoggedIn()) {
            const currentUser = this.getCurrentUser();
            if (currentUser.isStaff && !window.location.href.includes('staff-dashboard.html')) {
                window.location.href = 'staff-dashboard.html';
                return true;
            }
        }
        return false;
    }

    // Migration function to move localStorage orders to MongoDB
    static async migrateLocalStorageOrders() {
        try {
            const userCarts = JSON.parse(localStorage.getItem('userCarts') || '{}');
            
            // Check if there are any orders to migrate
            const hasOrders = Object.keys(userCarts).some(userId => 
                Array.isArray(userCarts[userId]) && userCarts[userId].length > 0
            );
            
            if (!hasOrders) {
                return { success: true, message: 'No orders to migrate', totalMigrated: 0 };
            }
            
            const response = await fetch('http://localhost:3000/api/orders/migrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userCarts })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Optionally clear localStorage after successful migration
                // localStorage.removeItem('userCarts');
                
                return result;
            } else {
                const error = await response.json();
                console.error('Migration failed:', error);
                return { success: false, message: error.error || 'Migration failed' };
            }
            
        } catch (error) {
            console.error('Error during migration:', error);
            return { success: false, message: 'Migration failed due to error: ' + error.message };
        }
    }

    // Auto-migrate on app initialization (call this once)
    static async initializeWithMigration() {
        // Check if migration has already been done
        const migrationDone = localStorage.getItem('ordersMigrated');
        
        if (!migrationDone) {
            const migrationResult = await this.migrateLocalStorageOrders();
            
            if (migrationResult.success) {
                localStorage.setItem('ordersMigrated', 'true');
                
                // Show user notification if orders were migrated
                if (migrationResult.totalMigrated > 0) {
                    const message = `Successfully migrated ${migrationResult.totalMigrated} existing orders to the new system!`;
                    if (typeof showToast === 'function') {
                        showToast(message, 'success');
                    }
                }
            } else {
                console.error('Migration failed:', migrationResult.message);
            }
        }
    }

    /**
     * Fetch user addresses from MongoDB, default first
     * @param {string|number} userId
     * @returns {Promise<Array>} addresses
     */
    static async getUserAddressesFromDB(userId) {
        try {
			// Prefer email-based lookup if available, fallback to userId
			const currentUser = typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function' ? Auth.getCurrentUser() : null;
			const email = currentUser && currentUser.email ? currentUser.email : null;
			const queryParam = email ? `email=${encodeURIComponent(email)}` : `userId=${encodeURIComponent(userId)}`;
			const response = await fetch(`http://localhost:3000/api/user-addresses?${queryParam}`);
            if (!response.ok) throw new Error('Failed to fetch addresses');
            let addresses = await response.json();
            // Sort: default first, then by createdAt
            addresses.sort((a, b) => {
                if (a.isDefault === b.isDefault) {
                    return new Date(a.createdAt) - new Date(b.createdAt);
                }
                return b.isDefault - a.isDefault;
            });
            return addresses;
        } catch (error) {
            console.error('Error fetching addresses from MongoDB:', error);
            return [];
        }
    }
}

class Cart {
    constructor() {
        this.items = [];
        this.notes = '';
        this.loadCart();
    }

    loadCart() {
        const currentUser = Auth.getCurrentUser();
        const userId = currentUser ? currentUser.id : 'guest';
        const cartKey = `cart_${userId}`;
        
        try {
            const cartData = JSON.parse(localStorage.getItem(cartKey) || '{}');
            this.items = cartData.items || [];
            this.notes = cartData.notes || '';
        } catch (error) {
            console.error('Error loading cart:', error);
            this.items = [];
            this.notes = '';
        }
    }

    saveCart(skipEvent = false) {
        const cartData = {
            items: this.items,
            notes: this.notes
        };
        
        // Save cart associated with current user
        const currentUser = Auth.getCurrentUser();
        const userId = currentUser ? currentUser.id : 'guest';
        const cartKey = `cart_${userId}`;
        
        localStorage.setItem(cartKey, JSON.stringify(cartData));
        
        // Dispatch custom event to update cart tab (unless skipped)
        if (!skipEvent) {
            window.dispatchEvent(new CustomEvent('cartUpdated', {
                detail: { cartData }
            }));
        }
        
        // Update cart count
        Auth.updateCartCount();
    }

    addItem(product) {
        const existingItem = this.items.find(item => item.id === product._id);
        
        if (existingItem) {
            existingItem.quantity++;
        } else {
            this.items.push({
                id: product._id,
                name: product.name,
                price: (() => {
                    const toNumber = (val) => {
                        if (val === null || val === undefined) return NaN;
                        if (typeof val === 'object' && val.$numberDecimal !== undefined) return parseFloat(val.$numberDecimal);
                        return parseFloat(val);
                    };
                    const candidates = [product.SellingPrice, product.sellingPrice, product.Price, product.price];
                    for (const c of candidates) {
                        const n = toNumber(c);
                        if (!isNaN(n)) return n;
                    }
                    return 0;
                })(),
                image: product.image,
                quantity: 1,
                categoryBucket: product.categoryBucket || 'other',
                categoryOriginal: product.category || 'unknown'
            });
        }
        
        this.saveCart();
    }

    removeItem(productId) {
        this.items = this.items.filter(item => item.id !== productId);
        this.saveCart();
    }

    updateQuantity(productId, quantity, skipEvent = false) {
        const itemIndex = this.items.findIndex(item => item.id === productId);
        
        if (itemIndex !== -1) {
            // Ensure quantity is a valid integer >= 1
            const parsedQty = parseInt(quantity);
            const finalQuantity = isNaN(parsedQty) ? 1 : Math.max(1, parsedQty);
            this.items[itemIndex].quantity = finalQuantity;
            this.saveCart(skipEvent);
        }
    }

    clearCart() {
        this.items = [];
        this.notes = '';
        this.saveCart();
    }

    getItems() {
        return this.items;
    }

    getTotal() {
        return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    getItemCount() {
        return this.items.reduce((count, item) => count + item.quantity, 0);
    }

    getSubtotal() {
        return this.items.reduce((subtotal, item) => subtotal + (item.price * item.quantity), 0);
    }
}

function updateAccountButton() {
    const loginBtn = document.getElementById('loginBtn');
    const cartBtn = document.getElementById('cartBtn');
    const currentUser = Auth.getCurrentUser();
    
    if (!loginBtn) {
        console.warn('Login button not found');
        return;
    }

    // Remove any existing click listeners
    const newBtn = loginBtn.cloneNode(true);
    loginBtn.parentNode.replaceChild(newBtn, loginBtn);

        if (currentUser) {
            // Logged in state - show username instead of full name
            const displayName = currentUser.username || currentUser.fullName;
            newBtn.textContent = displayName;
            newBtn.onclick = () => {
                if (currentUser.isStaff) {
                    window.location.href = 'staff-dashboard.html';
                } else {
                    window.location.href = 'profile.html';
                }
            };
            if (cartBtn) {
                if (currentUser.isStaff) {
                    cartBtn.classList.add('hidden');
                } else {
                    cartBtn.classList.remove('hidden');
                    Auth.updateCartCount();
                }
            }
    } else {
        // Logged out state
        newBtn.textContent = 'Log In';
        newBtn.onclick = () => {
            document.getElementById('loginModal').classList.add('show');
        };
        if (cartBtn) {
            cartBtn.classList.remove('hidden'); // Show cart for guest users
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateAccountButton();
});
