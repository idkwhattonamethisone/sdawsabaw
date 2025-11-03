class LoginButton {
    constructor() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        this.button = document.getElementById('topLoginBtn');
        if (!this.button) {
            console.warn('Login button not found');
            return;
        }
        this.init();
    }

    init() {
        // Create new button with proper structure
        const newBtn = document.createElement('a');
        newBtn.id = 'topLoginBtn';
        newBtn.className = 'account-btn';
        newBtn.href = '#';

        // Check login state
        const currentUser = Auth.getCurrentUser();
        if (currentUser) {
            newBtn.textContent = currentUser.fullName || currentUser.email?.split('@')[0] || 'My Account';
            newBtn.onclick = () => {
                if (currentUser.isStaff) {
                    window.location.href = 'staff-dashboard.html';
                } else {
                    window.location.href = 'profile.html';
                }
            };
        } else {
            newBtn.textContent = 'Log In';
            newBtn.onclick = () => {
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    loginModal.classList.add('show');
                }
            };
        }

        // Replace old button
        this.button.parentNode.replaceChild(newBtn, this.button);
        this.button = newBtn;

        // Update cart button visibility
        this.updateCartButton(currentUser);
    }

    updateCartButton(currentUser) {
        const cartBtn = document.getElementById('cartBtn');
        if (!cartBtn) return;

        if (currentUser?.isStaff) {
            cartBtn.classList.add('hidden');
        } else {
            cartBtn.classList.remove('hidden');
            Auth.updateCartCount();
        }
    }
}

// Initialize on page load
new LoginButton(); 