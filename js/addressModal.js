// Address Modal Management System
class AddressModalManager {
    constructor() {
        this.GEOAPIFY_API_KEY = 'a85e803098a1455da0da79145e5ca8e1';
        this.GEOAPIFY_BASE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
        this.autocompleteCache = new Map();
        this.isModalInitialized = false;
        this.onAddressSaved = null; // Callback function
    }

    // Initialize the modal (create if doesn't exist)
    init() {
        console.log('AddressModal.init() called, isModalInitialized:', this.isModalInitialized);
        if (this.isModalInitialized) return;
        
        try {
            this.createModal();
            this.setupEventListeners();
            this.isModalInitialized = true;
            console.log('AddressModal initialized successfully');
        } catch (error) {
            console.error('Error initializing address modal:', error);
        }
    }

    // Create the modal HTML structure
    createModal() {
        console.log('Creating address modal HTML...');
        
        // Check if modal already exists
        if (document.getElementById('addressModal')) {
            console.log('Address modal already exists in DOM');
            return;
        }
        
        const modalHTML = `
            <div class="modal address-modal" id="addressModal" style="z-index: 10000;">
                <div class="modal-content" style="max-width: 600px; width: 90%;">
                    <button class="modal-close" id="closeAddressModal">×</button>
                    <h3 id="modalTitle">Add Address</h3>
                    
                    <form class="address-form" id="addressForm">
                        <div class="form-group">
                            <label for="addressLabel">Address Label *</label>
                            <input type="text" id="addressLabel" class="form-control" placeholder="e.g., Home, Office, etc." required>
                        </div>

                        <div class="form-group">
                            <label for="streetAddress">Street Address (House Number and Street) *</label>
                            <input type="text" id="streetAddress" class="form-control" placeholder="Enter house number and street name" required>
                        </div>

                        <div class="form-group">
                            <label for="barangay">Barangay *</label>
                            <input type="text" id="barangay" class="form-control" placeholder="Enter barangay" required>
                        </div>

                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label for="city">City/Municipality *</label>
                                <input type="text" id="city" class="form-control" placeholder="Enter city or municipality" required>
                            </div>
                            <div class="form-group">
                                <label for="postalCode">Postal Code *</label>
                                <input type="text" id="postalCode" class="form-control" placeholder="Enter 4-digit postal code" pattern="[0-9]{4}" maxlength="4" required>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="province">Province/Region *</label>
                            <input type="text" id="province" class="form-control" placeholder="Enter province or region" required>
                        </div>

                        <div class="form-group default-address-row">
                            <input type="checkbox" id="setAsDefault" style="accent-color: #e53935; width: 20px; height: 20px; margin-right: 10px;">
                            <label for="setAsDefault" style="font-weight: 500; color: #222; font-size: 1rem; cursor: pointer;">Set as default address</label>
                        </div>

                        <div class="modal-actions" style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                            <button type="button" class="btn-cancel" id="cancelAddressBtn" style="background: #6c757d; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;">Cancel</button>
                            <button type="submit" class="btn-save" id="saveAddressBtn" style="background: #e63946; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;">
                                <span class="btn-text">Save Address</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal styles if they don't exist
        if (!document.getElementById('addressModalStyles')) {
            console.log('Adding address modal styles...');
            const styles = document.createElement('style');
            styles.id = 'addressModalStyles';
            styles.textContent = `
                .address-modal .modal-content {
                    max-width: 600px;
                    width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                }
                
                .address-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    padding-right: 8px;
                }
                
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .form-group label {
                    font-weight: 600;
                    color: #333;
                }
                
                .autocomplete-container {
                    position: relative;
                }
                
                .autocomplete-suggestions {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: white;
                    border: 1px solid #ddd;
                    border-top: none;
                    border-radius: 0 0 8px 8px;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 1000;
                    display: none;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                
                .suggestion-item {
                    padding: 0.75rem;
                    cursor: pointer;
                    border-bottom: 1px solid #f0f0f0;
                    transition: background 0.2s ease;
                }
                
                .suggestion-item:hover,
                .suggestion-item.highlighted {
                    background: #f8f9fa;
                }
                
                .suggestion-item:last-child {
                    border-bottom: none;
                }
                
                .suggestion-main {
                    font-weight: 500;
                    color: #333;
                }
                
                .suggestion-sub {
                    font-size: 0.9rem;
                    color: #666;
                    margin-top: 0.25rem;
                }
                
                .loading-spinner {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #e63946;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-right: 0.5rem;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .btn-cancel:hover {
                    background: #5a6268 !important;
                }
                
                .btn-save:hover {
                    background: #dc2626 !important;
                }
                
                .btn-save:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                /* Custom scrollbar for the modal */
                .address-modal .modal-content::-webkit-scrollbar {
                    width: 8px;
                }

                .address-modal .modal-content::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }

                .address-modal .modal-content::-webkit-scrollbar-thumb {
                    background: #c1c1c1;
                    border-radius: 4px;
                }

                .address-modal .modal-content::-webkit-scrollbar-thumb:hover {
                    background: #a8a8a8;
                }

                /* Firefox scrollbar */
                .address-modal .modal-content {
                    scrollbar-width: thin;
                    scrollbar-color: #c1c1c1 #f1f1f1;
                }
                
                @media (max-width: 768px) {
                    .form-row {
                        grid-template-columns: 1fr !important;
                    }
                    
                    .address-modal .modal-content {
                        max-height: 85vh;
                        width: 95%;
                    }
                }
            `;
            document.head.appendChild(styles);
            console.log('Address modal styles added to head');
        }

        // Create a temporary div to hold the modal HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = modalHTML;
        const modalElement = tempDiv.firstElementChild;
        
        // Append to body
        document.body.appendChild(modalElement);
        console.log('Address modal HTML appended to body');
        
        // Verify the modal was added
        const addedModal = document.getElementById('addressModal');
        console.log('Address modal verification:', {
            found: !!addedModal,
            className: addedModal ? addedModal.className : 'not found',
            style: addedModal ? addedModal.style.cssText : 'not found'
        });
    }

    // Setup event listeners
    setupEventListeners() {
        // Modal close buttons
        document.getElementById('closeAddressModal').addEventListener('click', () => this.close());
        document.getElementById('cancelAddressBtn').addEventListener('click', () => this.close());

        // Form submission
        document.getElementById('addressForm').addEventListener('submit', (e) => this.handleSubmit(e));

        // Postal code validation
        document.getElementById('postalCode').addEventListener('input', function(e) {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            // Validate postal code in real-time
            if (window.InputValidator) {
                window.InputValidator.validateField(e.target, 'postalCode');
            }
        });

        // Street address validation
        document.getElementById('streetAddress').addEventListener('input', function(e) {
            if (window.InputValidator) {
                window.InputValidator.validateField(e.target, 'text', { fieldName: 'streetAddress' });
            }
        });

        // Barangay validation
        document.getElementById('barangay').addEventListener('input', function(e) {
            if (window.InputValidator) {
                window.InputValidator.validateField(e.target, 'text', { fieldName: 'barangay' });
            }
        });

        // City validation
        document.getElementById('city').addEventListener('input', function(e) {
            if (window.InputValidator) {
                window.InputValidator.validateField(e.target, 'text', { fieldName: 'city' });
            }
        });

        // Province validation
        document.getElementById('province').addEventListener('input', function(e) {
            if (window.InputValidator) {
                window.InputValidator.validateField(e.target, 'text', { fieldName: 'province' });
            }
        });

        // Address label validation
        document.getElementById('addressLabel').addEventListener('input', function(e) {
            if (window.InputValidator) {
                window.InputValidator.validateField(e.target, 'text', { fieldName: 'addressLabel' });
            }
        });
    }

    // Show the modal
    async show(isPostLogin = false) {
        console.log('AddressModal.show() called with isPostLogin:', isPostLogin);
        
        // Safety check: Ensure user is logged in before showing modal
        if (isPostLogin) {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser || !currentUser.id) {
                console.log('User not logged in, skipping address modal');
                return; // Don't show modal if user is not logged in
            }
            
            // Check if user already has addresses (skip if they do)
            try {
                const hasAddresses = await this.userHasAddressesAsync();
                if (hasAddresses) {
                    console.log('User already has addresses, skipping modal display');
                    return; // Don't show modal if user already has addresses
                }
            } catch (error) {
                console.error('Error checking addresses:', error);
                // If check fails, still show modal to allow user to add address
            }
        }
        
        this.init();
        const modal = document.getElementById('addressModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('addressForm');
        
        console.log('Modal elements found:', {
            modal: !!modal,
            title: !!title,
            form: !!form
        });
        
        if (isPostLogin) {
            title.textContent = 'Add Your First Address';
<<<<<<< HEAD
=======
            // Safety: ensure logged-in user exists
            const currentUser = Auth.getCurrentUser();
            if (!currentUser || (!currentUser.email && !currentUser.id)) {
                console.log('User not logged in, skipping address modal');
                return;
            }
            // Server-side check if user already has addresses
            try {
                const has = await this.userHasAddressesAsync();
                if (has) {
                    console.log('User already has addresses, skipping modal display');
                    return;
                }
            } catch (err) {
                console.warn('userHasAddressesAsync failed, proceeding to show modal');
            }
>>>>>>> restore_from_6h
        } else {
            title.textContent = 'Add Address';
        }
        
        form.reset();
        modal.classList.add('show');
        document.body.classList.add('modal-open');
        console.log('Modal show class added, modal classList:', modal.classList.toString());
        
        // Reset scroll position to top
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.scrollTop = 0;
        }
        
        // Focus on first input
        setTimeout(() => {
            const firstInput = document.getElementById('addressLabel');
            if (firstInput) {
                firstInput.focus();
                console.log('Focus set to first input');
            } else {
                console.error('First input not found');
            }
        }, 100);
    }

    // Close the modal
    close() {
        const modal = document.getElementById('addressModal');
        modal.classList.remove('show');
        document.body.classList.remove('modal-open');
        document.getElementById('addressForm').reset();
        
        // Clear all autocomplete suggestions
        document.querySelectorAll('.autocomplete-suggestions').forEach(container => {
            container.style.display = 'none';
        });
    }

    // Handle form submission
    async handleSubmit(e) {
        console.log('DEBUG: handleSubmit called');
        e.preventDefault();
        
        const submitBtn = document.getElementById('saveAddressBtn');
        if (!submitBtn) {
            console.error('Save button not found');
            return;
        }
        
        const btnText = submitBtn.querySelector('.btn-text');
        const originalText = btnText ? btnText.textContent : submitBtn.textContent.replace(/\s*Saving\.\.\.\s*/, '').trim() || 'Save Address';
        
        // Show loading state immediately - use requestAnimationFrame to ensure DOM update
        submitBtn.disabled = true;
        
        if (btnText) {
            btnText.innerHTML = '<span class="loading-spinner"></span>Saving...';
        } else {
            // Fallback: use button directly if .btn-text doesn't exist
            submitBtn.innerHTML = '<span class="loading-spinner"></span>Saving...';
        }
        
        // Force a repaint to ensure spinner is visible before validation
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });
        
        console.log('Button state updated - disabled:', submitBtn.disabled, 'HTML:', submitBtn.innerHTML);
        
        try {
<<<<<<< HEAD
=======
            // Show loading state
            submitBtn.disabled = true;
            btnText.innerHTML = '<span class="loading-spinner"></span>Saving...';
            // Force a paint so spinner becomes visible before heavy work
            await new Promise(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            
>>>>>>> restore_from_6h
            const currentUser = Auth.getCurrentUser();
            if (!currentUser) {
                throw new Error('You must be logged in to save an address');
            }
            
            const addressData = {
                id: this.generateId(),
                label: document.getElementById('addressLabel').value.trim(),
                streetAddress: document.getElementById('streetAddress').value.trim(),
                barangay: document.getElementById('barangay').value.trim(),
                city: document.getElementById('city').value.trim(),
                postalCode: document.getElementById('postalCode').value.trim(),
                province: document.getElementById('province').value.trim(),
                isDefault: document.getElementById('setAsDefault').checked,
                email: currentUser.email,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            console.log('DEBUG: addressData to save:', addressData);

<<<<<<< HEAD
            // Validate required fields
=======
            // Validate required fields (basic inline validation)
>>>>>>> restore_from_6h
            const requiredFields = ['label', 'streetAddress', 'barangay', 'city', 'postalCode', 'province'];
            for (const field of requiredFields) {
                if (!addressData[field]) {
                    throw new Error(`${field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} is required`);
                }
            }
<<<<<<< HEAD

            // Enhanced validation using basic validation rules
            // Validate label (should not be empty and reasonable length)
            if (addressData.label.length < 2 || addressData.label.length > 50) {
                throw new Error('Address label must be between 2 and 50 characters');
            }

            // Validate street address (should not be empty and reasonable length)
            if (addressData.streetAddress.length < 5 || addressData.streetAddress.length > 200) {
                throw new Error('Street address must be between 5 and 200 characters');
            }

            // Validate barangay (should not be empty and reasonable length)
            if (addressData.barangay.length < 2 || addressData.barangay.length > 100) {
                throw new Error('Barangay must be between 2 and 100 characters');
            }

            // Validate city (should not be empty and reasonable length)
            if (addressData.city.length < 2 || addressData.city.length > 100) {
                throw new Error('City must be between 2 and 100 characters');
            }

            // Validate province (should not be empty and reasonable length)
            if (addressData.province.length < 2 || addressData.province.length > 100) {
                throw new Error('Province must be between 2 and 100 characters');
            }

            // Validate postal code (4 digits)
=======
            // Enhanced validation rules
            if (addressData.label.length < 2 || addressData.label.length > 50) {
                throw new Error('Address label must be between 2 and 50 characters');
            }
            if (addressData.streetAddress.length < 5 || addressData.streetAddress.length > 200) {
                throw new Error('Street address must be between 5 and 200 characters');
            }
            if (addressData.barangay.length < 2 || addressData.barangay.length > 100) {
                throw new Error('Barangay must be between 2 and 100 characters');
            }
            if (addressData.city.length < 2 || addressData.city.length > 100) {
                throw new Error('City must be between 2 and 100 characters');
            }
            if (addressData.province.length < 2 || addressData.province.length > 100) {
                throw new Error('Province must be between 2 and 100 characters');
            }
>>>>>>> restore_from_6h
            if (!/^\d{4}$/.test(addressData.postalCode)) {
                throw new Error('Postal code must be exactly 4 digits');
            }

            // Save address
            await this.saveAddress(addressData);
            
<<<<<<< HEAD
            // Refresh the addresses cache after saving
            // This ensures hasAddresses() will work correctly
            if (currentUser && currentUser.email) {
                const apiBaseUrl = 'http://localhost:3000';
                window.addressesPromise = fetch(`${apiBaseUrl}/api/user-addresses?email=${encodeURIComponent(currentUser.email)}`)
                    .then(response => {
                        if (!response.ok) throw new Error('Failed to fetch addresses');
                        return response.json();
                    })
                    .then(addresses => {
                        return Array.isArray(addresses) ? addresses.map(addr => ({
                            ...addr,
                            id: addr.id || addr._id
                        })) : [];
                    })
                    .catch(error => {
                        console.error('Error refreshing addresses:', error);
                        return [];
                    });
            }
            
            // Show success toast and close after brief delay to show spinner worked
            await new Promise(resolve => setTimeout(resolve, 300));
            
            if (typeof showToast === 'function') {
                showToast('Address added successfully!', 'success');
            } else {
                // Fallback: manually show success toast
                const toast = document.getElementById('toast');
                if (toast) {
                    toast.textContent = 'Address added successfully!';
                    toast.className = 'toast success show';
                    setTimeout(() => toast.classList.remove('show'), 3000);
                }
            }
            
=======
            // Delay slightly so spinner is perceived
            await new Promise(resolve => setTimeout(resolve, 300));
            showToast('Address added successfully!', 'success');
>>>>>>> restore_from_6h
            this.close();

            // Refresh cached addresses by email for subsequent checks
            try {
                if (currentUser && currentUser.email) {
                    const apiBaseUrl = 'http://localhost:3000';
                    window.addressesPromise = fetch(`${apiBaseUrl}/api/user-addresses?email=${encodeURIComponent(currentUser.email)}`)
                        .then(r => r.ok ? r.json() : [])
                        .then(addresses => Array.isArray(addresses) ? addresses.map(a => ({ ...a, id: a.id || a._id })) : [])
                        .catch(() => []);
                }
            } catch (_) {}
            
            // Call callback if provided
            if (this.onAddressSaved) {
                this.onAddressSaved(addressData);
            }
            
        } catch (error) {
            console.error('Error saving address:', error);
<<<<<<< HEAD
            console.log('showToast available:', typeof showToast);
            
            // Keep spinner visible briefly so user can see something happened
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Show error toast - try multiple methods
            const errorMessage = error.message || 'Failed to save address. Please check your input and try again.';
            
            // First try the global showToast function
            if (typeof showToast === 'function') {
                try {
                    showToast(errorMessage, 'error');
                    console.log('Toast shown via showToast function');
                } catch (toastError) {
                    console.error('Error calling showToast:', toastError);
                }
            }
            
            // Fallback: manually show toast
            const toast = document.getElementById('toast');
            if (toast) {
                try {
                    toast.textContent = errorMessage;
                    toast.className = 'toast error show';
                    setTimeout(() => {
                        toast.classList.remove('show');
                    }, 3000);
                    console.log('Toast shown manually');
                } catch (toastError) {
                    console.error('Error showing toast manually:', toastError);
                    alert(errorMessage);
                }
            } else {
                console.warn('Toast element not found, using alert');
                alert(errorMessage);
            }
        } finally {
            // Reset button state after a brief delay to ensure user sees the feedback
            setTimeout(() => {
                submitBtn.disabled = false;
                if (btnText) {
                    btnText.textContent = originalText;
                    btnText.innerHTML = originalText; // Reset innerHTML in case it was changed
                } else {
                    submitBtn.textContent = originalText;
                    submitBtn.innerHTML = originalText;
                }
=======
            // Keep spinner visible briefly before showing error
            await new Promise(resolve => setTimeout(resolve, 300));
            showToast(error.message || 'Failed to save address. Please check your input and try again.', 'error');
        } finally {
            // Reset button state after brief delay
            setTimeout(() => {
                submitBtn.disabled = false;
                btnText.textContent = originalText;
>>>>>>> restore_from_6h
            }, 500);
        }
    }

    // Save address to storage/database
    async saveAddress(addressData) {
        console.log('DEBUG: saveAddress called with:', addressData);
        try {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser) {
                throw new Error('User not logged in');
            }

            // Use the backend server URL for API requests
            const apiBaseUrl = 'http://localhost:3000'; // Change this if your backend runs elsewhere
            console.log('DEBUG: Sending fetch to ' + apiBaseUrl + '/api/user-addresses');
<<<<<<< HEAD
            
            // Build request body - prefer email, fallback to userId
            const requestBody = {
                addressData
            };
            if (currentUser.email) {
                requestBody.email = currentUser.email;
            }
            if (currentUser.id) {
                requestBody.userId = currentUser.id;
            }
            
=======
            console.log('DEBUG: Current user:', { email: currentUser.email, id: currentUser.id });
            
            // Build request body - send both email and userId if available, server will handle it
            const requestBody = { 
                addressData: addressData
            };
            // Include both email and userId - server will use whichever is available
            if (currentUser.email) requestBody.email = currentUser.email;
            if (currentUser.id) requestBody.userId = currentUser.id;

            console.log('DEBUG: Request body:', JSON.stringify(requestBody, null, 2));

>>>>>>> restore_from_6h
            const response = await fetch(apiBaseUrl + '/api/user-addresses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            console.log('DEBUG: Response status:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to save address' }));
                console.error('DEBUG: Error response:', errorData);
                throw new Error(errorData.error || errorData.message || 'Failed to save address to server');
            }
            
            const result = await response.json();
            console.log('DEBUG: Success response from ' + apiBaseUrl + '/api/user-addresses:', result);
            
            if (!result.success) {
                throw new Error(result.error || result.message || 'Failed to save address to server');
            }
            
            // Verify the address was actually saved by fetching it back
            console.log('DEBUG: Verifying address was saved...');
            const verifyResponse = await fetch(`${apiBaseUrl}/api/user-addresses?${currentUser.email ? `email=${encodeURIComponent(currentUser.email)}` : `userId=${encodeURIComponent(currentUser.id)}`}`);
            if (verifyResponse.ok) {
                const savedAddresses = await verifyResponse.json();
                console.log('DEBUG: Verified - addresses in database:', savedAddresses.length);
            }
        } catch (error) {
            console.error('Error saving address to storage:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            throw error;
        }
    }

<<<<<<< HEAD
    // Check if user has addresses (async version that fetches from API using email)
    async userHasAddressesAsync() {
        try {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser || !currentUser.email) return false;
            
            const apiBaseUrl = 'http://localhost:3000';
            const response = await fetch(`${apiBaseUrl}/api/user-addresses?email=${encodeURIComponent(currentUser.email)}`);
            if (!response.ok) return false;
            
            const addresses = await response.json();
            return Array.isArray(addresses) && addresses.length > 0;
        } catch (error) {
            console.error('Error checking addresses:', error);
            return false;
        }
    }

    // Check if user has addresses (sync version - checks cache, but async check is preferred)
    userHasAddresses() {
        try {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser || !currentUser.id) return false;
            
            // Try to use cached result from addressesPromise if available
            // Note: This returns a promise, but the function should be used with async/await
            // For backward compatibility, we check if the promise resolves synchronously
            // which it won't, so this is mainly for checking the cache
            return false; // Always return false for sync check, use userHasAddressesAsync() instead
=======
    // Async check if user has addresses via API using email
    async userHasAddressesAsync() {
        try {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser || (!currentUser.email && !currentUser.id)) return false;
            const apiBaseUrl = 'http://localhost:3000';
            const param = currentUser.email ? `email=${encodeURIComponent(currentUser.email)}` : `userId=${encodeURIComponent(currentUser.id)}`;
            const response = await fetch(`${apiBaseUrl}/api/user-addresses?${param}`);
            if (!response.ok) return false;
            const addresses = await response.json();
            return Array.isArray(addresses) && addresses.length > 0;
>>>>>>> restore_from_6h
        } catch (error) {
            console.error('Error checking addresses:', error);
            return false;
        }
    }

    // Check if user has addresses (deprecated - use userHasAddressesAsync instead)
    userHasAddresses() {
        // This method is deprecated - always returns false to force API check
        // Use userHasAddressesAsync() instead for accurate results
        return false;
    }

    // Generate unique ID
    generateId() {
        return 'addr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Set callback for when address is saved
    setOnAddressSaved(callback) {
        this.onAddressSaved = callback;
    }
}

// Create global instance
window.AddressModal = new AddressModalManager();

// Global function to show address modal (for post-login)
window.showAddressModal = function(isPostLogin = false) {
    window.AddressModal.show(isPostLogin);
};

// Global function to check if user has addresses
window.hasAddresses = function() {
    return window.AddressModal.userHasAddresses();
};

// Global test function for debugging
window.testAddressModal = function() {
    console.log('Testing address modal...');
    console.log('window.AddressModal:', typeof window.AddressModal);
    console.log('window.showAddressModal:', typeof window.showAddressModal);
    console.log('window.hasAddresses:', typeof window.hasAddresses);
    console.log('Auth.getCurrentUser():', Auth.getCurrentUser());
    console.log('User has addresses:', window.hasAddresses());
    
    try {
        window.showAddressModal(true);
        console.log('Address modal show function called successfully');
    } catch (error) {
        console.error('Error calling showAddressModal:', error);
    }
}; 