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
        
        // Create text span (no icon)
        const textSpan = document.createElement('span');
        textSpan.className = 'login-text';

        // Check login state
        const currentUser = Auth.getCurrentUser();
        if (currentUser) {
            textSpan.textContent = currentUser.fullName;
            newBtn.onclick = () => {
                if (currentUser.isStaff) {
                    window.location.href = 'staff-dashboard.html';
                } else {
                    window.location.href = 'profile.html';
                }
            };
        } else {
            textSpan.textContent = 'Log In';
            newBtn.onclick = () => {
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    loginModal.classList.add('show');
                }
            };
        }

        // Assemble button (text only)
        newBtn.appendChild(textSpan);

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

// Initialize on page load and keep a reference
window.loginButtonInstance = new LoginButton();

// Refresh on auth state changes
window.addEventListener('auth:login', () => {
    if (window.loginButtonInstance && typeof window.loginButtonInstance.init === 'function') {
        try { window.loginButtonInstance.init(); } catch (_) {}
    }
});