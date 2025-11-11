// Utility function to format prices in PHP currency
function formatPHPPrice(price) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(price);
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    const loginModal = document.getElementById('loginModal');
    const registrationModal = document.getElementById('registrationModal');
    const modalClose = document.getElementById('modalClose');
    const registrationModalClose = document.getElementById('registrationModalClose');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const topLoginBtn = document.getElementById('topLoginBtn');
    const cartBtn = document.getElementById('cartBtn');
    const cartDropdown = document.getElementById('cartDropdown');
    const cartDropdownContent = document.getElementById('cartDropdownContent');

    // Modal state management
    let currentMode = 'login'; // 'login' or 'signup'

    // Function to switch between login and signup modes
    function switchMode(mode) {
        currentMode = mode;
        const loginTabs = document.getElementById('loginTabs');
        const signupTabs = document.getElementById('signupTabs');
        const modalTitle = document.querySelector('.modal-title');

        if (mode === 'signup') {
            loginTabs.style.display = 'none';
            signupTabs.style.display = 'flex';
            modalTitle.textContent = 'Create Account';
            activateTab('user-signup');
        } else {
            loginTabs.style.display = 'flex';
            signupTabs.style.display = 'none';
            modalTitle.textContent = 'Welcome Back';
            activateTab('user-login');
        }
    }

    // Function to show login modal
    const showModal = () => {
        console.log('Opening login modal...');
        if (loginModal) {
            loginModal.classList.add('show');
            currentMode = 'login';
            activateTab('user-login');
        }
    };

    // Function to show registration modal
    const showRegistrationModalFunc = (tab = 'user-signup') => {
        console.log('Opening registration modal...');
        if (registrationModal) {
            // Close login modal if open
            if (loginModal && loginModal.classList.contains('show')) {
                loginModal.classList.remove('show');
            }
            
            registrationModal.classList.add('show');
            
            // Set the correct title based on tab
            const modalTitle = registrationModal.querySelector('.modal-title');
            if (tab === 'forgot-password') {
                modalTitle.textContent = 'Account Recovery';
            } else {
                modalTitle.textContent = 'Create Account';
            }
            
            // Activate the correct tab in registration modal
            activateTab(tab);
        }
    };

    // Function to close modal and reset fields (updated to use centralized function)
    const closeModal = () => {
        window.closeAllModals();
    };

    // Set up modal close button (updated to use centralized function)
    if (modalClose) {
        modalClose.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.closeAllModals();
        };
    }

    // Close modal when clicking outside (updated to use centralized function)
    if (loginModal) {
        loginModal.onclick = (e) => {
            if (e.target === loginModal) {
                window.closeAllModals();
            }
        };
    }

    // Close modal when pressing Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && loginModal && loginModal.classList.contains('show')) {
            window.closeAllModals();
        }
    });

    // Set up login button click handler
    if (loginBtn) {
        loginBtn.onclick = () => {
            if (Auth.isLoggedIn()) {
                const currentUser = Auth.getCurrentUser();
                if (currentUser.isStaff) {
                    window.location.href = 'staff-dashboard.html';
                } else {
                    window.location.href = 'profile.html';
                }
            } else {
                showModal();
            }
        };
    }

    // Set up top login button click handler
    if (topLoginBtn) {
        const newTopLoginBtn = topLoginBtn.cloneNode(true);
        topLoginBtn.parentNode.replaceChild(newTopLoginBtn, topLoginBtn);
        
        newTopLoginBtn.onclick = (e) => {
            e.preventDefault();
            if (Auth.isLoggedIn()) {
                const currentUser = Auth.getCurrentUser();
                if (!currentUser.isStaff) {
                    const userDropdown = document.getElementById('userDropdown');
                    if (userDropdown) {
                        userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
                    }
                } else {
                    window.location.href = 'staff-dashboard.html';
                }
            } else {
                showModal();
            }
        };
    }

    // Hide dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const userDropdown = document.getElementById('userDropdown');
        const topLoginBtn = document.getElementById('topLoginBtn');
        if (userDropdown && topLoginBtn) {
            if (!userDropdown.contains(event.target) && event.target !== topLoginBtn) {
                userDropdown.style.display = 'none';
            }
        }
    });

    // Handle logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            // Show full-screen loading overlay (auto-creates if missing)
            if (window.LoadingUtils) {
                window.LoadingUtils.show('Logging out...');
            }
            // Perform logout
            const result = Auth.logout();
            // Short delay to let overlay render before navigating
            setTimeout(() => {
                if (result && result.success) {
                    window.location.reload();
                } else {
                    if (window.LoadingUtils) window.LoadingUtils.hide();
                    showToast(result?.message || 'Logout failed', 'error');
                }
            }, 300);
        };
    }

    // Update login button text to Gmail username if logged in
    function updateTopLoginBtn() {
        const topLoginBtn = document.getElementById('topLoginBtn');
        const userDropdown = document.getElementById('userDropdown');
        
        if (!topLoginBtn) return;
        
        if (Auth.isLoggedIn()) {
            const currentUser = Auth.getCurrentUser();
            if (currentUser && currentUser.fullName) {
                topLoginBtn.textContent = currentUser.fullName;
                if (userDropdown) userDropdown.style.display = 'none';
            } else if (currentUser && currentUser.email) {
                // For any email, use the email username part
                const username = currentUser.email.split('@')[0];
                topLoginBtn.textContent = username;
                if (userDropdown) userDropdown.style.display = 'none';
            } else {
                topLoginBtn.textContent = 'Login';
                if (userDropdown) userDropdown.style.display = 'none';
            }
        } else {
            topLoginBtn.textContent = 'Login';
            if (userDropdown) userDropdown.style.display = 'none';
        }
    }
    
    // Make updateTopLoginBtn globally accessible
    window.updateTopLoginBtn = updateTopLoginBtn;
    updateTopLoginBtn();

    // Set up cart button click handler
    if (cartBtn) {
        // Remove any existing event listeners to prevent duplicates
        cartBtn.onclick = null;
        cartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!Auth.isLoggedIn()) {
                showToast('Please log in to view your cart.');
                showModal();
            } else {
                window.location.href = 'cart.html';
            }
        });
    } else {
        console.error('Cart button not found in DOM');
    }

    // Ensure cart button is properly initialized
    function initializeCartButton() {
        const cartBtn = document.getElementById('cartBtn');
        const cartCount = document.getElementById('cartCount');
        
        if (cartBtn) {
            // Make sure cart button is visible
            cartBtn.style.display = 'flex';
            cartBtn.style.visibility = 'visible';
            
            // Initialize cart count
            if (cartCount) {
                Auth.updateCartCount();
            }
            
            console.log('Cart button initialized successfully');
        } else {
            console.error('Cart button not found during initialization');
        }
    }

    // Initialize cart button after a short delay to ensure DOM is ready
    setTimeout(initializeCartButton, 100);

    // Cart dropdown functionality
    function showCartDropdown() {
        if (cartDropdown) {
            updateCartDropdown();
            cartDropdown.style.display = 'block';
        }
    }
    
    function hideCartDropdown() {
        if (cartDropdown) {
            cartDropdown.style.display = 'none';
        }
    }

    function updateCartDropdown() {
        if (!cartDropdownContent) return;
        
        const cart = new Cart();
        const items = cart.getItems();
        if (!items.length) {
            cartDropdownContent.innerHTML = `
                <div class="cart-empty">
                    <img src="images/cart-empty.png" alt="Empty Cart" />
                    <div>Empty Cart</div>
                </div>
            `;
            return;
        }
        let itemsHtml = items.map(item => `
            <div class="cart-item">
                <img src="${item.image ? (item.image.startsWith('data:image') ? item.image : 'images/' + item.image) : 'images/sanrico_logo_1.png'}" onerror="this.src='images/sanrico_logo_1.png'" alt="${item.name}">
                <div class="cart-item-details">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-price">${formatPHPPrice(item.price)} | Qty: ${item.quantity}</div>
                </div>
            </div>
        `).join('');
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        cartDropdownContent.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 10px;">My Cart, <span style="color: #e63946;">${items.length}</span> item${items.length > 1 ? 's' : ''}</div>
            ${itemsHtml}
            <div class="cart-subtotal">
                <span>Subtotal</span>
                <span>${formatPHPPrice(subtotal)}</span>
            </div>
            <div class="cart-actions">
                <button class="checkout-btn" onclick="window.location.href='checkout.html'">CHECKOUT</button>
                <button class="viewcart-btn" onclick="window.location.href='cart.html'">VIEW CART</button>
            </div>
        `;
    }

    // Show dropdown on hover
    if (cartBtn && cartDropdown) {
        cartBtn.addEventListener('mouseenter', showCartDropdown);
        cartBtn.addEventListener('mouseleave', hideCartDropdown);
        cartDropdown.addEventListener('mouseenter', showCartDropdown);
        cartDropdown.addEventListener('mouseleave', hideCartDropdown);
    }

    // Event listeners for modal open/close
    if (loginBtn) {
        loginBtn.addEventListener('click', () => window.showLoginModal());
    }

    if (topLoginBtn) {
        topLoginBtn.addEventListener('click', () => window.showLoginModal());
    }

    if (modalClose) {
        modalClose.addEventListener('click', () => window.closeAllModals());
    }

    if (registrationModalClose) {
        registrationModalClose.addEventListener('click', () => window.closeAllModals());
    }

    // Close modal when clicking outside of it
    window.addEventListener('click', (e) => {
        if (e.target === loginModal || e.target === registrationModal) {
            window.closeAllModals();
        }
    });

    // Close modal when pressing Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeAllModals();
        }
    });

    // Make showModal function globally available (only showRegistrationModal here, showLoginModal is defined later)
    window.showRegistrationModal = showRegistrationModalFunc;

    // Enhanced Tab functionality
    if (tabButtons.length > 0 && tabContents.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const activeContent = document.querySelector('.tab-content.active');
                if (activeContent) {
                    const currentTabId = activeContent.id;
                    const newTabId = button.dataset.tab;
                    
                    if (currentTabId !== newTabId) {
                        activateTab(newTabId);
                    }
                }
            });
        });
    }

    // Forgot Password functionality
    const forgotPasswordSubmitBtn = document.getElementById('forgotPasswordSubmitBtn');
    if (forgotPasswordSubmitBtn) {
        forgotPasswordSubmitBtn.addEventListener('click', async () => {
            const emailInput = document.getElementById('forgot-email');
            const email = emailInput.value.trim();
            
            if (!email) {
                showToast('Please enter your email address', 'error');
                return;
            }
            
            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showToast('Please enter a valid email address', 'error');
                return;
            }
            
            // Show loading state
            if (window.setButtonLoading) {
                window.setButtonLoading('forgotPasswordSubmitBtn', true);
            }
            
            // Simulate sending reset email (replace with actual implementation)
            setTimeout(() => {
                showToast('Password reset link sent to your email!', 'success');
                emailInput.value = '';
                
                if (window.setButtonLoading) {
                    window.setButtonLoading('forgotPasswordSubmitBtn', false);
                }
                
                // Switch back to login tab
                setTimeout(() => {
                    showLoginModal(); // Changed from showLoginTab()
                }, 2000);
            }, 2000);
        });
    }

    // Staff login functionality
    const staffLoginBtn = document.getElementById('staffLoginSubmitBtn');
    const staffIdInput = document.getElementById('staff-id');
    const staffPasswordInput = document.getElementById('staff-password');
    
    if (staffLoginBtn) {
        const handleStaffLogin = async () => {
            const staffId = staffIdInput?.value;
            const password = staffPasswordInput?.value;
            
            if (!staffId || !password) {
                showToast('Please enter both staff ID and password');
                return;
            }
            
            // Show loading state
            staffLoginBtn.disabled = true;
            staffLoginBtn.classList.add('loading');
            
            // Show loading overlay
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) {
                loadingOverlay.classList.add('show');
            }
            
            try {
                const result = await Auth.staffLogin(staffId, password);
                
                                if (result.success) {
                    updateAccountButton();
                    loginModal.classList.remove('show');
                    showToast(result.message, 'success');
                    
                    // Update loading text
                    const loadingText = loadingOverlay?.querySelector('.loading-text');
                    if (loadingText) {
                        loadingText.innerHTML = 'Redirecting to dashboard<span class="loading-dots">...</span>';
                    }
                    
                    // Give a small delay to ensure localStorage operations are complete
                    setTimeout(() => {
                        const currentUser = Auth.getCurrentUser();
                        if (currentUser.isStaff) {
                            window.location.href = 'staff-dashboard.html';
                        }
                    }, 500);
                } else {
                    // Hide loading overlay on error
                    if (loadingOverlay) {
                        loadingOverlay.classList.remove('show');
                    }
                    showToast(result.message, 'error');
                }
            } catch (error) {
                console.error('Error during staff login:', error);
                showToast('Login failed. Please try again.', 'error');
                
                // Hide loading overlay on error
                if (loadingOverlay) {
                    loadingOverlay.classList.remove('show');
                }
            } finally {
                // Reset button state (only on error - successful login will redirect)
                // The finally block runs regardless, so we check if we're still on the same page
                setTimeout(() => {
                    if (staffLoginBtn && !staffLoginBtn.disabled) {
                        return; // Already reset or success case
                    }
                    
                    if (window.location.pathname.includes('staff-dashboard.html')) {
                        return; // Successfully redirected, don't reset
                    }
                    
                    // Reset button state for error cases
                    if (staffLoginBtn) {
                        staffLoginBtn.disabled = false;
                        staffLoginBtn.classList.remove('loading');
                    }
                    
                    // Reset loading text
                    const loadingText = loadingOverlay?.querySelector('.loading-text');
                    if (loadingText) {
                        loadingText.innerHTML = 'Authenticating<span class="loading-dots">...</span>';
                    }
                }, 100);
            }
        };
        
        staffLoginBtn.addEventListener('click', handleStaffLogin);
        
        // Add keypress event listeners
        if (staffIdInput && staffPasswordInput) {
            staffIdInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!staffPasswordInput.value) {
                        staffPasswordInput.focus();
                    } else {
                        handleStaffLogin();
                    }
                }
            });
            
            staffPasswordInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleStaffLogin();
                }
            });
        }
    }

    // Initialize tab indicator position
    if (loginModal) {
        const activeButton = document.querySelector('.tab-btn.active');
        if (activeButton) {
            const tabButtonsContainer = activeButton.closest('.tab-buttons');
            if (tabButtonsContainer) {
            const buttonWidth = activeButton.offsetWidth;
            const buttonOffsetLeft = activeButton.offsetLeft;
                tabButtonsContainer.style.setProperty('--tab-width', `${buttonWidth}px`);
                tabButtonsContainer.style.setProperty('--tab-offset', `${buttonOffsetLeft}px`);
            }
        }
    }

    // Setup signup form handlers with Enter key support
    ['signup-fullname', 'signup-email', 'signup-password', 'signup-confirm-password'].forEach((fieldId, index, array) => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                    if (index < array.length - 1) {
                        // Focus next field
                        const nextField = document.getElementById(array[index + 1]);
                        if (nextField) nextField.focus();
                    } else {
                        // Submit form on last field
                        handleSignupSubmission();
                    }
            }
        });
    }
    });

    // Add click handler for signup submit button
    const signupSubmitBtn = document.getElementById('userSignupSubmitBtn');
    if (signupSubmitBtn) {
        signupSubmitBtn.addEventListener('click', (event) => {
                event.preventDefault();
            handleSignupSubmission();
        });
    }

    // Set up registration modal close button
    if (registrationModalClose) {
        registrationModalClose.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
        };
    }

    // Close registration modal when clicking outside
    if (registrationModal) {
        registrationModal.onclick = (e) => {
            if (e.target === registrationModal) {
                closeModal();
            }
        };
    }

    // Close registration modal when pressing Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && registrationModal && registrationModal.classList.contains('show')) {
            closeModal();
        }
    });
});

// Google Sign-In handler
function handleGoogleSignIn(response) {
    try {
        console.log('Google Sign-In response received:', response);
        
        // Show loading overlay for Google sign-in
        if (window.LoadingUtils) {
            window.LoadingUtils.show('Signing in with Google...');
        }
        
        const token = response.credential;
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('Google user data:', payload);
        
        const userData = {
            id: payload.sub || payload.email,
            email: payload.email,
            fullName: payload.name,
            username: (payload.email || '').split('@')[0],
            firstName: payload.given_name,
            lastName: payload.family_name,
            profilePicture: payload.picture,
            provider: 'google',
            isStaff: false
        };

        // Persist as current user (align with manual login header logic)
        if (typeof Auth !== 'undefined' && typeof Auth.setCurrentUser === 'function') {
            Auth.setCurrentUser(userData);
        } else {
            try { localStorage.setItem('currentUser', JSON.stringify(userData)); } catch (_) {}
        }

        // Broadcast login for any listeners
        try { window.dispatchEvent(new CustomEvent('auth:login', { detail: { user: userData } })); } catch (_) {}

        {
                    if (window.LoadingUtils) {
                        window.LoadingUtils.updateText('Signing you in...');
                    }
            console.log('Google login successful');
            showToast(`Welcome${userData.firstName ? ', ' + userData.firstName : ''}!`, 'success');
            
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.classList.remove('show');
            }
            
            if (typeof updateAccountButton === 'function') {
                try { updateAccountButton(); } catch (_) {}
            } else if (typeof Auth !== 'undefined' && typeof Auth.updateUIAfterLogin === 'function') {
                Auth.updateUIAfterLogin();
            }
            
            setTimeout(() => {
                const tryShowAddress = async () => {
                    try {
                        if (typeof window.AddressModal !== 'undefined' && typeof window.AddressModal.userHasAddressesAsync === 'function') {
                            const has = await window.AddressModal.userHasAddressesAsync();
                            if (!has && typeof showAddressModal === 'function') {
                                showAddressModal(true);
                            }
                        } else if (typeof hasAddresses === 'function' && !hasAddresses() && typeof showAddressModal === 'function') {
                            showAddressModal(true);
                        }
                    } catch (_) {}
                    if (window.LoadingUtils) window.LoadingUtils.hide();
                };
                tryShowAddress();
            }, 1000);
        }
    } catch (error) {
        console.error('Error processing Google Sign-In:', error);
        showToast('Google Sign-In failed. Please try again.', 'error');
        if (window.LoadingUtils) window.LoadingUtils.hide();
    }
}

window.handleGoogleSignIn = handleGoogleSignIn;

// Enhanced tab switching functions
function activateTab(tabId) {
    // Find which modal contains this tab
    const loginModal = document.getElementById('loginModal');
    const registrationModal = document.getElementById('registrationModal');
    
    let targetModal = null;
    let targetTab = document.getElementById(tabId);
    
    if (targetTab) {
        // Determine which modal contains this tab
        if (loginModal && loginModal.contains(targetTab)) {
            targetModal = loginModal;
        } else if (registrationModal && registrationModal.contains(targetTab)) {
            targetModal = registrationModal;
        }
    }
    
    if (!targetModal || !targetTab) {
        console.error('Tab content or modal not found for:', tabId);
        return;
    }

    // Get all tab buttons and contents within this specific modal
    const tabButtons = targetModal.querySelectorAll('.tab-btn');
    const tabContents = targetModal.querySelectorAll('.tab-content');
    const activeButton = targetModal.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const tabButtonsContainer = activeButton?.closest('.tab-buttons');

    if (!targetTab) {
        console.error('Tab content not found for:', tabId);
        return;
    }

    // Remove active class from all tabs and buttons in this modal
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    // Show the content and make it active
    targetTab.style.display = 'block';
    targetTab.classList.add('active');

    // Hide all other tab contents in this modal
    tabContents.forEach(content => {
        if (content.id !== tabId) {
            content.style.display = 'none';
            content.classList.remove('active');
        }
    });

    // Activate the corresponding tab button
    if (activeButton) {
        activeButton.classList.add('active');
        
        // Update the indicator position
        if (tabButtonsContainer) {
            const buttonWidth = activeButton.offsetWidth;
            const buttonOffsetLeft = activeButton.offsetLeft;
            
            tabButtonsContainer.style.setProperty('--tab-width', `${buttonWidth}px`);
            tabButtonsContainer.style.setProperty('--tab-offset', `${buttonOffsetLeft}px`);
        }
    }

    // Animate modal height transition
    const modalContent = targetModal.querySelector('.modal-content');
    if (modalContent) {
        const currentHeight = modalContent.offsetHeight;
        
        requestAnimationFrame(() => {
            const newHeight = modalContent.offsetHeight;
            
            if (currentHeight !== newHeight) {
                modalContent.style.transition = 'height 0.3s ease';
            setTimeout(() => {
                    modalContent.style.transition = '';
                }, 300);
            }
        });
    }
}

// Centralized Modal Management Functions
window.showRegistrationModal = function(tab = 'user-signup') {
    console.log('showRegistrationModal called with tab:', tab);
    const loginModal = document.getElementById('loginModal');
    const registrationModal = document.getElementById('registrationModal');
    
    // Close login modal if open
    if (loginModal && loginModal.classList.contains('show')) {
        loginModal.classList.remove('show');
    }
    
    if (registrationModal) {
        registrationModal.classList.add('show');
        // trigger minimal open animation
        const content = registrationModal.querySelector('.modal-content');
        if (content) {
            content.classList.remove('modal-opening');
            // restart animation
            void content.offsetWidth;
            content.classList.add('modal-opening');
            content.addEventListener('animationend', function handler(){
                content.classList.remove('modal-opening');
                content.removeEventListener('animationend', handler);
            });
        }
        
        // Set the correct title based on tab
        const modalTitle = registrationModal.querySelector('.modal-title');
        if (tab === 'forgot-password') {
            modalTitle.textContent = 'Account Recovery';
        } else {
        modalTitle.textContent = 'Create Account';
    }
        
        // Clear any validation states
        if (window.clearAllValidation) {
            window.clearAllValidation();
        }
        
        // Activate the correct tab in registration modal
        console.log('Activating tab:', tab);
        activateTab(tab);
    }
};

window.showLoginModal = function() {
    console.log('showLoginModal called');
    
    // Check for pending registration first
    const pendingRegistration = sessionStorage.getItem('pendingRegistration');
    if (pendingRegistration) {
        try {
            const pendingData = JSON.parse(pendingRegistration);
            console.log('Found pending registration, showing verification dialog instead');
            
            // Show verification dialog instead of login modal
            showEmailVerificationDialog(pendingData.email);
            showToast('You have an incomplete registration. Please verify your email or cancel to start over.', 'info');
            return; // Exit early, don't show login modal
        } catch (error) {
            console.error('Error parsing pending registration:', error);
            // Clear invalid data and continue with login
            sessionStorage.removeItem('pendingRegistration');
        }
    }
    
    const loginModal = document.getElementById('loginModal');
    const registrationModal = document.getElementById('registrationModal');
    
    // Close registration modal if open
    if (registrationModal && registrationModal.classList.contains('show')) {
        registrationModal.classList.remove('show');
    }
    
    if (loginModal) {
        loginModal.classList.add('show');
        // trigger minimal open animation
        const content = loginModal.querySelector('.modal-content');
        if (content) {
            content.classList.remove('modal-opening');
            // restart animation
            void content.offsetWidth;
            content.classList.add('modal-opening');
            content.addEventListener('animationend', function handler(){
                content.classList.remove('modal-opening');
                content.removeEventListener('animationend', handler);
            });
        }
        
        // Set login modal title
        const modalTitle = loginModal.querySelector('.modal-title');
        if (modalTitle) {
            modalTitle.textContent = 'Welcome Back';
        }
        
        // Clear any validation states
        if (window.clearAllValidation) {
            window.clearAllValidation();
        }
        
        // Activate user login tab
        console.log('Activating user-login tab');
        activateTab('user-login');
    }
};

// Function to close all modals
window.closeAllModals = function() {
    console.log('Closing all modals...');
    const loginModal = document.getElementById('loginModal');
    const registrationModal = document.getElementById('registrationModal');
    
    if (loginModal) {
        loginModal.classList.remove('show');
    }
    if (registrationModal) {
        registrationModal.classList.remove('show');
    }
    
    // Clear validation states
    if (window.clearAllValidation) {
        window.clearAllValidation();
    }
};

// Enhanced signup form handler with MongoDB
window.handleSignupSubmission = async function() {
    console.log('handleSignupSubmission called');
    
    // Get form values
    const fullName = document.getElementById('signup-fullname')?.value?.trim();
    const email = document.getElementById('signup-email')?.value;
    const password = document.getElementById('signup-password')?.value;
    const confirmPassword = document.getElementById('signup-confirm-password')?.value;
    
    // Validate form using existing validation
    if (window.validateSignupForm && !window.validateSignupForm()) {
            return;
        }
        
    // Additional validation
    if (!fullName || !email || !password) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    // Set loading state
    const signupBtn = document.getElementById('userSignupSubmitBtn');
    if (window.setButtonLoading) {
        window.setButtonLoading('userSignupSubmitBtn', true);
        } else {
        if (signupBtn) {
            signupBtn.disabled = true;
            signupBtn.textContent = 'Creating Account...';
        }
    }
    
    try {
        console.log('Attempting to sign up with MongoDB backend...');
        
        // First, check if email already exists
        const emailCheckResponse = await fetch('http://localhost:3001/api/auth/check-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        if (!emailCheckResponse.ok) {
            throw new Error('Failed to check email availability');
        }
        
        const emailCheckResult = await emailCheckResponse.json();
        
        if (emailCheckResult.exists) {
            throw new Error('An account with this email already exists');
        }
        
        // Step 1: Create and save verification code to AuthCodes collection
        console.log('Creating verification code in AuthCodes collection...');
        const codeResponse = await fetch('http://localhost:3001/api/auth/create-verification-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                userName: fullName
            })
        });

        if (!codeResponse.ok) {
            let errorMessage = 'Failed to create verification code';
            try {
                const errorData = await codeResponse.json();
                errorMessage = errorData.message || errorMessage;
            } catch (jsonError) {
                console.error('Failed to parse error response:', jsonError);
            }
            throw new Error(errorMessage);
        }

        let codeResult;
        try {
            codeResult = await codeResponse.json();
            console.log('✅ Verification code saved to AuthCodes collection');
        } catch (jsonError) {
            console.error('❌ Failed to parse code creation response as JSON:', jsonError);
            console.error('Response status:', codeResponse.status);
            console.error('Response headers:', codeResponse.headers);
            throw new Error('Invalid response from server when creating verification code');
        }

        // Step 2: Send verification email with the code
        console.log('Sending verification email...');
        const emailResponse = await fetch('http://localhost:3001/api/auth/send-verification-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                verificationCode: codeResult.verificationCode,
                userName: fullName
            })
        });

        console.log('Email response:', emailResponse);
        
        if (!emailResponse.ok) {
            let errorMessage = 'Failed to send verification email';
            try {
                const errorData = await emailResponse.json();
                errorMessage = errorData.message || errorMessage;
            } catch (jsonError) {
                console.error('Failed to parse email error response:', jsonError);
            }
            throw new Error(errorMessage);
        }

        console.log('✅ Verification email sent successfully');

        // Store registration data temporarily (for verification completion)
        sessionStorage.setItem('pendingRegistration', JSON.stringify({
            fullName,
            email,
            password,
            timestamp: Date.now()
        }));

        // Show verification dialog
        showEmailVerificationDialog(email);
        
        showToast('Verification email sent! Please check your inbox.', 'success');
        
        // Clear form fields
        document.getElementById('signup-fullname').value = '';
        document.getElementById('signup-email').value = '';
        document.getElementById('signup-password').value = '';
        document.getElementById('signup-confirm-password').value = '';
        
            // Close registration modal
            const registrationModal = document.getElementById('registrationModal');
            if (registrationModal) {
                registrationModal.classList.remove('show');
        }
        
    } catch (error) {
        console.error('Error during signup:', error);
        showToast(error.message || 'Registration failed. Please try again.', 'error');
    } finally {
        // Reset loading state
        if (window.setButtonLoading) {
            window.setButtonLoading('userSignupSubmitBtn', false);
        } else {
        if (signupBtn) {
            signupBtn.disabled = false;
                signupBtn.textContent = 'Create My Account';
            }
        }
    }
};

function updateAccountButton() {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;

    // Remove any existing click listeners
    const newBtn = loginBtn.cloneNode(true);
    loginBtn.parentNode.replaceChild(newBtn, loginBtn);
    
    if (Auth.isLoggedIn()) {
        const currentUser = Auth.getCurrentUser();
        newBtn.addEventListener('click', () => {
            if (currentUser.isStaff) {
                window.location.href = 'staff-dashboard.html';
            } else {
                window.location.href = 'profile.html';
            }
        });
        newBtn.textContent = currentUser.isStaff ? 'Staff Dashboard' : 'My Account';
    } else {
        newBtn.textContent = 'Log In';
        newBtn.addEventListener('click', () => {
            if (loginModal) {
                loginModal.classList.add('show');
            }
        });
    }

    // Update cart button visibility
    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) {
        const currentUser = Auth.getCurrentUser();
        if (Auth.isLoggedIn() && !currentUser.isStaff) {
            cartBtn.classList.remove('hidden');
            Auth.updateCartCount();
        } else {
            cartBtn.classList.add('hidden');
        }
    }
}

// Enhanced login form handlers with Better Auth
document.addEventListener('DOMContentLoaded', () => {
    // User login form handler
    const userLoginSubmitBtn = document.getElementById('userLoginSubmitBtn');
    if (userLoginSubmitBtn) {
        userLoginSubmitBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        
            const email = document.getElementById('user-email')?.value?.trim();
            const password = document.getElementById('user-password')?.value;
        
            if (!email || !password) {
                showToast('Please enter both email and password', 'error');
            return;
        }
        
            // Set loading state
            this.disabled = true;
            this.textContent = 'Signing In...';
            if (window.LoadingUtils) {
                window.LoadingUtils.show('Signing in...');
            }
        
            try {
                // Use your MongoDB login endpoint directly
                const response = await fetch('http://localhost:3001/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Login failed');
                }
        
        if (result.success) {
                    // Store auth token and user for global use
                    localStorage.setItem('auth_token', result.token);
                    if (typeof Auth !== 'undefined' && typeof Auth.setCurrentUser === 'function') {
                        Auth.setCurrentUser({
                            id: result.user.id,
                            fullName: result.user.fullName,
                            email: result.user.email,
                            username: (result.user.email || '').split('@')[0],
                            isStaff: !!result.user.isStaff
                        });
                    } else {
                        try { localStorage.setItem('currentUser', JSON.stringify(result.user)); } catch (_) {}
                    }
                    if (typeof window !== 'undefined') {
                        window.isAuthenticated = true;
                        try { window.dispatchEvent(new CustomEvent('auth:login', { detail: { user: result.user } })); } catch (_) {}
                        if (typeof updateAccountButton === 'function') {
                            try { updateAccountButton(); } catch (_) {}
                        }
                        // Update login button text using fullName from database
                        if (typeof window.updateTopLoginBtn === 'function') {
                            try { window.updateTopLoginBtn(); } catch (_) {}
                        }
                        // Fallback: directly update topLoginBtn if present
                        try {
                            const topBtn = document.getElementById('topLoginBtn');
                            if (topBtn && result.user) {
                                // Prioritize fullName from database over username/email
                                const displayName = (result.user.fullName || (result.user.email || '').split('@')[0]) || 'Account';
                                topBtn.textContent = displayName;
                                topBtn.onclick = () => {
                                    if (result.user.isStaff) {
                                        window.location.href = 'staff-dashboard.html';
                                    } else {
                                        window.location.href = 'profile.html';
                                    }
                                };
                            }
                        } catch (_) {}
                    }

                    // Set current user in Auth system first
                    if (Auth && typeof Auth.setCurrentUser === 'function') {
                        Auth.setCurrentUser(result.user);
                    }

                    showToast(`Login successful! Welcome back, ${result.user.fullName || result.user.email}!`, 'success');
            
                    // Update UI after login (including button text)
                    if (Auth && typeof Auth.updateUIAfterLogin === 'function') {
                        Auth.updateUIAfterLogin();
                    }
                    
                    // Also manually update top login button to ensure it updates immediately
                    if (typeof updateTopLoginBtn === 'function') {
                        updateTopLoginBtn();
                    }
            
            // Close login modal
                    window.closeAllModals();
            
                    // Clear form fields
                    document.getElementById('user-email').value = '';
                    document.getElementById('user-password').value = '';
            
                    // Redirect based on user type
            setTimeout(() => {
                        if (result.user.isStaff) {
                            window.location.href = 'staff-dashboard.html';
                            if (window.LoadingUtils) window.LoadingUtils.hide();
                    } else {
                            // Verify user is actually logged in before checking addresses
                            const currentUser = Auth.getCurrentUser();
                            if (currentUser && !currentUser.isStaff) {
                                // Check if address modal should be shown (only if user has no addresses)
                                if (typeof hasAddresses === 'function' && typeof showAddressModal === 'function') {
                                    const userHasAddresses = hasAddresses();
                                    
                                    // Only show address modal if user doesn't have addresses
                                    if (!userHasAddresses) {
                                        showAddressModal(true);
                                    }
                                    if (window.LoadingUtils) window.LoadingUtils.hide();
                                } else {
                                    if (window.LoadingUtils) window.LoadingUtils.hide();
                                }
                            } else {
                                if (window.LoadingUtils) window.LoadingUtils.hide();
                            }
                            // Optionally refresh header/account UI
                            if (typeof window.refreshAccountUI === 'function') {
                                window.refreshAccountUI(result.user);
                            }
                        }
                    }, 1000);
                }
                
            } catch (error) {
                console.error('Login error:', error);
                if (error.message.includes('verify your email')) {
                    // Email verification dialog will be shown by authClient
                    showToast('Please verify your email to continue', 'warning');
                } else if (error.message.includes('Account not found')) {
                    showToast('No account found with that email address. Would you like to create one?', 'error');
                    // Focus on the "Create one today" link
                    setTimeout(() => {
                        if (typeof window.focusCreateAccountLink === 'function') {
                            window.focusCreateAccountLink();
                        } else {
                            // Fallback if helper function not loaded
                            const createAccountLink = document.querySelector('.signup-link');
                            if (createAccountLink) {
                                createAccountLink.focus();
                                createAccountLink.style.outline = '2px solid #3498db';
                                createAccountLink.style.outlineOffset = '2px';
                                setTimeout(() => {
                                    createAccountLink.style.outline = '';
                                    createAccountLink.style.outlineOffset = '';
                                }, 3000);
                            }
                        }
                    }, 500);
                } else {
                    showToast(error.message || 'Login failed. Please try again.', 'error');
                }
            } finally {
                // Reset button state
                this.disabled = false;
                this.textContent = 'Sign In';
                // Hide overlay if still visible (non-redirect paths)
                if (window.LoadingUtils) window.LoadingUtils.hide();
            }
        });
    }
    
    // Staff login form handler - DISABLED to prevent conflicts with primary handler
    const staffLoginSubmitBtn_DISABLED = document.getElementById('staffLoginSubmitBtn_DISABLED');
    if (staffLoginSubmitBtn_DISABLED) {
        staffLoginSubmitBtn_DISABLED.addEventListener('click', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('staff-id')?.value?.trim();
            const password = document.getElementById('staff-password')?.value;
            
            if (!username || !password) {
                showToast('Please enter both username and password', 'error');
                return;
            }
            
            // Set loading state
            this.disabled = true;
            this.textContent = 'Signing In...';
            
            try {
                // First try staff login endpoint
                let response = await fetch('http://localhost:3000/api/staff/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username: username, password: password })
                });

                let result = await response.json();

                // If staff login fails, try regular login and check if user is staff
                if (!response.ok) {
                    response = await fetch('http://localhost:3000/api/auth/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email: username, password })
                    });

                    result = await response.json();

                    if (!response.ok) {
                        throw new Error(result.message || 'Login failed');
                    }

                    if (!result.user.isStaff) {
                        throw new Error('Access denied. Staff credentials required.');
                    }
                    }
                
                if (result.success) {
                    // Store auth token
                    localStorage.setItem('auth_token', result.token);
                    
                    showToast(`Login successful! Welcome back, ${result.user.fullName || result.user.name}!`, 'success');
                    
                    // Close login modal
                    window.closeAllModals();
                    
                    // Clear form fields
                    document.getElementById('staff-id').value = '';
                    document.getElementById('staff-password').value = '';
                    
                    // Redirect to staff dashboard with delay to ensure localStorage persistence
                    setTimeout(() => {
                        window.location.href = 'staff-dashboard.html';
                    }, 500);
                }
                
            } catch (error) {
                console.error('Staff login error:', error);
                if (error.message.includes('verify your email')) {
                    showToast('Please verify your email to continue', 'warning');
        } else {
                    showToast(error.message || 'Login failed. Please check your credentials.', 'error');
                }
            } finally {
                // Reset button state
                this.disabled = false;
                this.textContent = 'Staff Sign In';
            }
        });
    }
    
    // Forgot password handler
    const forgotPasswordSubmitBtn = document.getElementById('forgotPasswordSubmitBtn');
    if (forgotPasswordSubmitBtn) {
        forgotPasswordSubmitBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('forgot-email')?.value?.trim();
            
            if (!email) {
                showToast('Please enter your email address', 'error');
                return;
            }
            
            // Set loading state
            this.disabled = true;
            this.textContent = 'Sending Recovery Email...';
            
            try {
                // Send password reset email via n8n
                const response = await fetch('http://localhost:3001/api/auth/send-password-reset', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email })
                });
                
                if (response.ok) {
                    showToast('Recovery email sent! Please check your inbox.', 'success');
                    
                    // Close modal and clear form
                    window.closeAllModals();
                    document.getElementById('forgot-email').value = '';
} else {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to send recovery email');
                }
                
            } catch (error) {
                console.error('Password reset error:', error);
                showToast(error.message || 'Failed to send recovery email. Please try again.', 'error');
            } finally {
                // Reset button state
                this.disabled = false;
                this.textContent = 'Send Recovery Email';
            }
        });
    }
});

// Email verification dialog for proper MongoDB registration
function showEmailVerificationDialog(email, expectedCode) {
    const dialogHTML = `
        <div class="verification-dialog-overlay" id="verificationDialog">
            <div class="verification-dialog">
                <div class="verification-dialog-header">
                    <h3>Email Verification</h3>
                    <button class="verification-close-btn" onclick="closeVerificationDialog()">×</button>
                </div>
                <div class="verification-dialog-content">
                    <div class="verification-icon">📧</div>
                    <p>We've sent a 4-digit verification code to:</p>
                    <strong>${email}</strong>
                    <div class="verification-code-input">
                        <input type="text" id="verificationCode" maxlength="4" placeholder="Enter 4-digit code" />
                    </div>
                    <div class="verification-buttons">
                        <button class="btn-verify" onclick="handleVerificationSubmit('${email}')">
                            Verify Email
                        </button>
                        <button class="btn-resend" onclick="handleResendCode('${email}')">
                            Resend Code
                        </button>
                        <button class="btn-cancel" onclick="handleCancelVerification('${email}')">
                            Cancel Registration
                        </button>
                    </div>
                    <div id="verificationMessage" class="verification-message"></div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    // Focus on input
    setTimeout(() => {
        const input = document.getElementById('verificationCode');
        if (input) input.focus();
    }, 100);

    // Handle Enter key
    const codeInput = document.getElementById('verificationCode');
    if (codeInput) {
        codeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleVerificationSubmit(email);
            }
        });
    }
}

// Handle canceling verification (invalidate codes and clear session)
window.handleCancelVerification = async function(email) {
    try {
        console.log('Canceling verification for:', email);
        
        // Show loading state
        const cancelBtn = document.querySelector('.btn-cancel');
        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.textContent = 'Canceling...';
        }
        
        // Invalidate all codes for this email
        const response = await fetch('http://localhost:3001/api/auth/invalidate-codes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            throw new Error('Failed to cancel registration');
        }
        
        const result = await response.json();
        console.log('✅ Registration cancelled:', result);
        
        // Clear pending registration from session storage
        sessionStorage.removeItem('pendingRegistration');
        
        // Close verification dialog
        closeVerificationDialog();
        
        // Show success message
        showToast('Registration cancelled. All verification codes have been invalidated.', 'info');
        
    } catch (error) {
        console.error('Error canceling verification:', error);
        showToast(error.message || 'Failed to cancel registration', 'error');
        
        // Reset button state
        const cancelBtn = document.querySelector('.btn-cancel');
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'Cancel Registration';
        }
    }
};

// Handle verification code submission for MongoDB registration
window.handleVerificationSubmit = async function(email) {
    const codeInput = document.getElementById('verificationCode');
    const messageEl = document.getElementById('verificationMessage');
    
    if (!codeInput || !messageEl) return;
    
    const enteredCode = codeInput.value.trim();

    if (!enteredCode || enteredCode.length !== 4) {
        messageEl.innerHTML = '<span style="color: #e74c3c;">Please enter a 4-digit code</span>';
        return;
    }

    try {
        messageEl.innerHTML = '<span style="color: #3498db;">Verifying...</span>';
        
        // Get pending registration data
        const pendingData = JSON.parse(sessionStorage.getItem('pendingRegistration') || '{}');
        
        if (!pendingData.email || pendingData.email !== email) {
            throw new Error('Registration session expired. Please try again.');
        }

        // Verify code using AuthCodes collection
        const verificationResponse = await fetch('http://localhost:3001/api/auth/verify-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                code: enteredCode
            })
        });

        const verificationResult = await verificationResponse.json();

        if (!verificationResponse.ok) {
            throw new Error(verificationResult.message || 'Verification failed');
        }

        console.log('✅ Verification code verified from AuthCodes collection');

        // Complete registration in MongoDB
        const registrationResponse = await fetch('http://localhost:3001/api/auth/complete-registration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fullname: pendingData.fullName,
                email: pendingData.email,
                password: pendingData.password
            })
        });

        const registrationResult = await registrationResponse.json();

        if (registrationResponse.ok && registrationResult.success) {
            messageEl.innerHTML = '<span style="color: #27ae60;">✓ Email verified! Account created successfully!</span>';
            
            // Clear pending registration data
            sessionStorage.removeItem('pendingRegistration');
            
            setTimeout(() => {
                closeVerificationDialog();
                showToast('Registration complete! You can now sign in.', 'success');
                
                // Show login modal if available
                if (typeof window.showLoginModal === 'function') {
                    window.showLoginModal();
                }
            }, 1500);
        } else {
            throw new Error(registrationResult.message || 'Registration failed');
        }
        
    } catch (error) {
        messageEl.innerHTML = `<span style="color: #e74c3c;">❌ ${error.message}</span>`;
    }
};

// Handle resend code for MongoDB registration
window.handleResendCode = async function(email) {
    const messageEl = document.getElementById('verificationMessage');
    if (!messageEl) return;
    
    try {
        messageEl.innerHTML = '<span style="color: #3498db;">Sending new code...</span>';
        
        // Get pending registration data
        const pendingData = JSON.parse(sessionStorage.getItem('pendingRegistration') || '{}');
        
        if (!pendingData.email || pendingData.email !== email) {
            throw new Error('Registration session expired. Please start over.');
        }

        // Step 1: Create and save new verification code to AuthCodes collection
        console.log('Creating new verification code in AuthCodes collection...');
        const codeResponse = await fetch('http://localhost:3001/api/auth/create-verification-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                userName: pendingData.fullName
            })
        });

        if (!codeResponse.ok) {
            const errorData = await codeResponse.json();
            throw new Error(errorData.message || 'Failed to create new verification code');
        }

        const codeResult = await codeResponse.json();
        console.log('✅ New verification code saved to AuthCodes collection');

        // Step 2: Send new verification email
        const emailResponse = await fetch('http://localhost:3001/api/auth/send-verification-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                verificationCode: codeResult.verificationCode,
                userName: pendingData.fullName
            })
        });

        if (emailResponse.ok) {
            // Update pending registration timestamp
            pendingData.timestamp = Date.now();
            sessionStorage.setItem('pendingRegistration', JSON.stringify(pendingData));
            
            messageEl.innerHTML = '<span style="color: #27ae60;">✓ New code sent to your email!</span>';
            console.log('✅ New verification email sent successfully');
        } else {
            throw new Error('Failed to send new verification code');
        }
        
    } catch (error) {
        messageEl.innerHTML = `<span style="color: #e74c3c;">❌ ${error.message}</span>`;
    }
};

// Close verification dialog
window.closeVerificationDialog = function() {
    const dialog = document.getElementById('verificationDialog');
    if (dialog) {
        dialog.remove();
    }
};
