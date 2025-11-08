// Enhanced Form Validation System
// Inspired by simple email authentication validation techniques

class FormValidator {
    constructor() {
        this.rules = {
            // Text - Letters and spaces only
            text: {
                pattern: /^[a-zA-Z\s]+$/,
                errorMessages: {
                    pattern: 'This field can only contain letters and spaces'
                }
            },

            // Phone - Philippine format (09xxxxxxxxx or +639xxxxxxxxx)
            phone: {
                pattern: /^(09\d{9}|\+639\d{9})$/,
                errorMessages: {
                    pattern: 'Please enter a valid Philippine phone number (09xxxxxxxxx or +639xxxxxxxxx)'
                }
            },

            // Email
            email: {
                minLength: 5,
                maxLength: 100,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                errorMessages: {
                    empty: 'Email address is required',
                    minLength: 'Email must be at least 5 characters',
                    maxLength: 'Email must be less than 100 characters',
                    pattern: 'Please enter a valid email address'
                }
            },

            // Integer - Whole numbers only, no decimals
            integer: {
                pattern: /^-?\d+$/,
                errorMessages: {
                    pattern: 'This field must contain only whole numbers'
                }
            },

            // Decimal/Price - Allows decimals (e.g., 99.99)
            decimal: {
                pattern: /^-?\d+(\.\d+)?$/,
                validate: (value) => {
                    const num = parseFloat(value);
                    return !isNaN(num) && num >= 0;
                },
                errorMessages: {
                    pattern: 'Please enter a valid number (e.g., 99.99)',
                    validate: 'Please enter a valid positive number'
                }
            },

            // Quantity - Positive integer for amounts
            quantity: {
                pattern: /^[1-9]\d*$/,
                errorMessages: {
                    pattern: 'Quantity must be a positive whole number'
                }
            },

            // Full Name - Letters and spaces only
            fullName: {
                minLength: 2,
                maxLength: 50,
                pattern: /^[a-zA-Z\s]{2,50}$/,
                errorMessages: {
                    empty: 'Full name is required',
                    minLength: 'Full name must be at least 2 characters',
                    maxLength: 'Full name must be less than 50 characters',
                    pattern: 'Full name can only contain letters and spaces'
                }
            },

            // Password
            password: {
                minLength: 7,
                maxLength: 12,
                // Keep strength patterns for UI; policy enforced via validate()
                patterns: {
                    weak: /^.{1,5}$/,
                    fair: /^(?=.*[a-z]).{6,}$/,
                    good: /^(?=.*[a-z])(?=.*[A-Z]).{8,}$/,
                    strong: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/
                },
                // Enforce policy: 7–12 chars, include a digit, an uppercase, and one of . or !
                validate: (value) => {
                    const policy = /^(?=.{7,12}$)(?=.*\d)(?=.*[A-Z])(?=.*[\.!]).*$/;
                    return policy.test(value);
                },
                errorMessages: {
                    empty: 'Password is required',
                    minLength: 'Password must be 7–12 characters',
                    maxLength: 'Password must be 7–12 characters',
                    validate: 'Password must be 7–12 chars and include a number, an uppercase letter, and one of . or !'
                }
            },

            // Textarea - Minimum character requirement
            textarea: {
                minLength: 10,
                maxLength: 1000,
                validate: (value) => {
                    const trimmed = value.trim();
                    return trimmed.length >= 10;
                },
                errorMessages: {
                    empty: 'This field is required',
                    minLength: 'Please provide at least 10 characters',
                    maxLength: 'Text is too long (maximum 1000 characters)',
                    validate: 'Please provide meaningful content'
                }
            },

            // Required field (generic)
            required: {
                errorMessages: {
                    empty: 'This field is required'
                }
            }
        };

        this.init();
    }

    // Initialize validation when DOM is ready
    init() {
        // Wait for DOM to be ready, then setup validation
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupValidation());
        } else {
            this.setupValidation();
        }
    }

    // Setup all validation listeners
    setupValidation() {
        this.setupSignupValidation();
        this.setupStaffValidation();
        this.setupUserLoginValidation();
        this.setupStaffFormValidation();
        this.setupCheckoutValidation();
        this.setupProfileValidation();
    }

    // Validate individual field based on rules
    validateField(fieldName, value) {
        const rule = this.rules[fieldName];
        if (!rule) return { isValid: true };

        // Check if empty (skip for non-required fields)
        if (!value || value.trim().length === 0) {
            // Only return error if field is required
            if (rule.errorMessages && rule.errorMessages.empty) {
                return {
                    isValid: false,
                    message: rule.errorMessages.empty
                };
            }
            return { isValid: true }; // Non-required empty field is valid
        }

        const trimmedValue = value.trim();

        // Check minimum length
        if (rule.minLength && trimmedValue.length < rule.minLength) {
            return {
                isValid: false,
                message: rule.errorMessages.minLength
            };
        }

        // Check maximum length
        if (rule.maxLength && trimmedValue.length > rule.maxLength) {
            return {
                isValid: false,
                message: rule.errorMessages.maxLength
            };
        }

        // Check pattern
        if (rule.pattern && !rule.pattern.test(trimmedValue)) {
            return {
                isValid: false,
                message: rule.errorMessages.pattern
            };
        }

        // Check custom validation function
        if (rule.validate && typeof rule.validate === 'function') {
            if (!rule.validate(trimmedValue)) {
                return {
                    isValid: false,
                    message: rule.errorMessages.validate || 'Validation failed'
                };
            }
        }

        return { isValid: true };
    }

    // Validate date field (cannot be in the past)
    validateDate(value) {
        if (!value) {
            return {
                isValid: false,
                message: 'Date is required'
            };
        }

        const selectedDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day

        if (selectedDate < today) {
            return {
                isValid: false,
                message: 'Date cannot be in the past'
            };
        }

        return { isValid: true };
    }

    // Validate select/dropdown field (required selection)
    validateSelect(value) {
        if (!value || value === '' || value === 'default' || value === 'select') {
            return {
                isValid: false,
                message: 'Please select an option'
            };
        }

        return { isValid: true };
    }

    // Validate by field type
    validateByType(type, value, options = {}) {
        switch (type.toLowerCase()) {
            case 'text':
                return this.validateField('text', value);
            case 'email':
                return this.validateField('email', value);
            case 'phone':
                return this.validateField('phone', value);
            case 'integer':
                return this.validateField('integer', value);
            case 'decimal':
            case 'price':
                return this.validateField('decimal', value);
            case 'quantity':
                return this.validateField('quantity', value);
            case 'textarea':
                return this.validateField('textarea', value);
            case 'date':
                return this.validateDate(value);
            case 'select':
                return this.validateSelect(value);
            case 'required':
                return this.validateField('required', value);
            default:
                return this.validateField(type, value);
        }
    }

    // Add real-time validation to an input field
    addFieldValidation(inputElement, type, options = {}) {
        if (!inputElement) return;

        const fieldId = inputElement.id;
        const fieldName = fieldId.replace(/^(signup-|staff-)/, '');

        // Real-time validation on input
        inputElement.addEventListener('input', (e) => {
            const value = e.target.value;
            const validation = this.validateByType(type, value, options);

            if (value.length === 0) {
                this.clearValidation(fieldName);
            } else if (validation.isValid) {
                this.showSuccess(fieldName, options.successMessage || `✓ Valid ${type}`);
            } else {
                this.showError(fieldName, validation.message);
            }
        });

        // Final validation on blur
        inputElement.addEventListener('blur', (e) => {
            const value = e.target.value;
            const validation = this.validateByType(type, value, options);

            if (!validation.isValid) {
                this.showError(fieldName, validation.message);
            }
        });

        // Special handling for select elements
        if (inputElement.tagName.toLowerCase() === 'select') {
            inputElement.addEventListener('change', (e) => {
                const value = e.target.value;
                const validation = this.validateByType(type, value, options);

                if (validation.isValid) {
                    this.showSuccess(fieldName, options.successMessage || '✓ Selected');
                } else {
                    this.showError(fieldName, validation.message);
                }
            });

            // Initial validation
            if (inputElement.value) {
                const validation = this.validateByType(type, inputElement.value, options);
                if (!validation.isValid) {
                    this.showError(fieldName, validation.message);
                }
            }
        }
    }

    // Setup validation for staff dashboard forms
    setupStaffFormValidation() {
        // Walk-in Order Modal
        const customerNameInput = document.getElementById('walkInCustomerName');
        const customerPhoneInput = document.getElementById('walkInCustomerPhone');
        const customerNotesInput = document.getElementById('walkInNotes');
        const deliveryAddressInput = document.getElementById('walkInDeliveryAddress');

        this.addFieldValidation(customerNameInput, 'text', {
            successMessage: '✓ Valid customer name'
        });

        this.addFieldValidation(customerPhoneInput, 'phone', {
            successMessage: '✓ Valid Philippine number'
        });

        if (customerNotesInput) {
            this.addFieldValidation(customerNotesInput, 'textarea', {
                successMessage: '✓ Notes added'
            });
        }

        if (deliveryAddressInput) {
            this.addFieldValidation(deliveryAddressInput, 'required', {
                successMessage: '✓ Delivery address provided'
            });
        }

        // New Transaction Modal
        const newCustomerNameInput = document.getElementById('newTransactionCustomerName');
        this.addFieldValidation(newCustomerNameInput, 'text', {
            successMessage: '✓ Valid name'
        });

        // Product Edit Modal
        const productStockInput = document.getElementById('productStock');
        this.addFieldValidation(productStockInput, 'integer', {
            successMessage: '✓ Valid stock quantity'
        });

        // Order Denial Reason
        const denialReasonInput = document.getElementById('denialReason');
        if (denialReasonInput) {
            this.addFieldValidation(denialReasonInput, 'textarea', {
                successMessage: '✓ Denial reason provided'
            });
        }

        // Return Reason
        const returnReasonInput = document.getElementById('returnReason');
        if (returnReasonInput) {
            this.addFieldValidation(returnReasonInput, 'textarea', {
                successMessage: '✓ Return reason provided'
            });
        }

        // Order Type Select
        const orderTypeSelect = document.getElementById('walkInOrderType');
        this.addFieldValidation(orderTypeSelect, 'select', {
            successMessage: '✓ Order type selected'
        });

        // Date filters (dashboard and orders)
        const dashboardStartDate = document.getElementById('dashboardStartDate');
        const dashboardEndDate = document.getElementById('dashboardEndDate');
        const orderStartDate = document.getElementById('orderStartDate');
        const orderEndDate = document.getElementById('orderEndDate');

        // Add date validation to dashboard dates
        if (dashboardStartDate) this.addFieldValidation(dashboardStartDate, 'date', { successMessage: '✓ Valid start date' });
        if (dashboardEndDate) this.addFieldValidation(dashboardEndDate, 'date', { successMessage: '✓ Valid end date' });
        if (orderStartDate) this.addFieldValidation(orderStartDate, 'date', { successMessage: '✓ Valid start date' });
        if (orderEndDate) this.addFieldValidation(orderEndDate, 'date', { successMessage: '✓ Valid end date' });

        // Payment amount validation
        const amountReceivedInput = document.getElementById('amountReceived');
        if (amountReceivedInput) {
            this.addFieldValidation(amountReceivedInput, 'decimal', {
                successMessage: '✓ Valid amount'
            });
        }

        // Quantity inputs (for products)
        const quantityInputs = document.querySelectorAll('input[type="number"].quantity-input, input[id*="quantity"], input[name*="quantity"]');
        quantityInputs.forEach(input => {
            this.addFieldValidation(input, 'quantity', {
                successMessage: '✓ Valid quantity'
            });
        });
    }

    // Check password strength and return appropriate level
    checkPasswordStrength(password) {
        if (!password) return { strength: 'none', text: 'Enter a password' };

        const patterns = this.rules.password.patterns;
        
        if (patterns.strong.test(password)) {
            return { strength: 'strong', text: 'Strong password!' };
        } else if (patterns.good.test(password)) {
            return { strength: 'good', text: 'Good password' };
        } else if (patterns.fair.test(password)) {
            return { strength: 'fair', text: 'Fair password' };
        } else {
            return { strength: 'weak', text: 'Weak password' };
        }
    }

    // Show error state and message for a field
    showError(fieldName, message) {
        const input = document.getElementById(`signup-${fieldName}`) || document.getElementById(`${fieldName}`);
        if (!input) return;

        const formGroup = input.closest('.form-group');
        const errorElement = document.getElementById(`${fieldName}-error`);
        const successElement = document.getElementById(`${fieldName}-success`);

        if (formGroup) {
            formGroup.classList.remove('has-success', 'has-warning');
            formGroup.classList.add('has-error');
        }

        // Add red border to the input field itself
        input.style.borderColor = '#dc3545';
        input.style.boxShadow = '0 0 0 0.2rem rgba(220, 53, 69, 0.25)';

        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
        } else {
            // Create error element if it doesn't exist
            const newErrorElement = document.createElement('div');
            newErrorElement.id = `${fieldName}-error`;
            newErrorElement.className = 'error-message show';
            newErrorElement.textContent = message;
            newErrorElement.style.color = '#dc3545';
            newErrorElement.style.fontSize = '0.875rem';
            newErrorElement.style.marginTop = '0.25rem';

            const formGroupElement = input.closest('.form-group');
            if (formGroupElement) {
                formGroupElement.appendChild(newErrorElement);
            }
        }

        if (successElement) {
            successElement.classList.remove('show');
        }

        // Show generic error toast for critical login issues
        if (message && message.toLowerCase().includes('required') ||
            message.toLowerCase().includes('valid email') ||
            message.toLowerCase().includes('password')) {
            // Only show toast for major validation issues
            if (typeof showToast === 'function') {
                showToast(message, 'error');
            }
        }
    }

    // Show success state and optional message for a field
    showSuccess(fieldName, message = '') {
        const input = document.getElementById(`signup-${fieldName}`) || document.getElementById(`${fieldName}`);
        if (!input) return;

        const formGroup = input.closest('.form-group');
        const errorElement = document.getElementById(`${fieldName}-error`);
        const successElement = document.getElementById(`${fieldName}-success`);

        if (formGroup) {
            formGroup.classList.remove('has-error', 'has-warning');
            formGroup.classList.add('has-success');
        }

        // Remove red styling and add green border for success
        input.style.borderColor = '#28a745';
        input.style.boxShadow = '0 0 0 0.2rem rgba(40, 167, 69, 0.25)';

        if (errorElement) {
            errorElement.classList.remove('show');
        }

        if (successElement && message) {
            successElement.textContent = message;
            successElement.classList.add('show');
        }
    }

    // Clear all validation states for a field
    clearValidation(fieldName) {
        const input = document.getElementById(`signup-${fieldName}`) || document.getElementById(`${fieldName}`);
        if (!input) return;

        const formGroup = input.closest('.form-group');
        const errorElement = document.getElementById(`${fieldName}-error`);
        const successElement = document.getElementById(`${fieldName}-success`);

        if (formGroup) {
            formGroup.classList.remove('has-error', 'has-success', 'has-warning');
        }

        // Clear custom inline styles
        input.style.borderColor = '';
        input.style.boxShadow = '';

        if (errorElement) errorElement.classList.remove('show');
        if (successElement) successElement.classList.remove('show');
    }

    // Update password strength visual indicator
    updatePasswordStrength(password) {
        const strengthContainer = document.getElementById('password-strength');
        const strengthFill = document.getElementById('strength-fill');
        const strengthText = document.getElementById('strength-text');

        if (!strengthContainer || !strengthFill || !strengthText) return;

        const { strength, text } = this.checkPasswordStrength(password);

        // Show/hide strength indicator based on password presence
        if (password && password.length > 0) {
            strengthContainer.classList.add('show');
        } else {
            strengthContainer.classList.remove('show');
            return;
        }

        // Remove all previous strength classes
        strengthFill.classList.remove('weak', 'fair', 'good', 'strong');
        strengthText.classList.remove('weak', 'fair', 'good', 'strong');

        // Add current strength class
        if (strength !== 'none') {
            strengthFill.classList.add(strength);
            strengthText.classList.add(strength);
        }

        strengthText.textContent = text;
    }

    // Validate password confirmation
    validateConfirmPassword(password, confirmPassword) {
        if (!confirmPassword) {
            return {
                isValid: false,
                message: 'Please confirm your password'
            };
        }

        if (password !== confirmPassword) {
            return {
                isValid: false,
                message: 'Passwords do not match'
            };
        }

        return { isValid: true };
    }

    // Setup real-time validation for signup form
    setupSignupValidation() {
        const fullNameInput = document.getElementById('signup-fullname');
        const emailInput = document.getElementById('signup-email');
        const passwordInput = document.getElementById('signup-password');
        const confirmPasswordInput = document.getElementById('signup-confirm-password');

        if (!fullNameInput || !emailInput || !passwordInput || !confirmPasswordInput) {
            return; // Elements not found on this page
        }

        // Ensure password policy hint is present (global across pages/modals)
        try {
            const existingHint = document.getElementById('password-policy-hint');
            if (!existingHint) {
                const hint = document.createElement('small');
                hint.id = 'password-policy-hint';
                hint.style.display = 'block';
                hint.style.color = '#7f8c8d';
                hint.style.marginTop = '6px';
                hint.textContent = '12–16 characters, include a number, an uppercase letter, and one of . or !';

                // Insert after password strength block if available, otherwise after the input
                const formGroup = passwordInput.closest('.form-group');
                const strengthBlock = formGroup ? formGroup.querySelector('.password-strength') : null;
                if (strengthBlock && strengthBlock.parentNode) {
                    strengthBlock.parentNode.insertBefore(hint, strengthBlock.nextSibling);
                } else if (passwordInput.parentNode) {
                    passwordInput.parentNode.insertBefore(hint, passwordInput.nextSibling);
                }
            }
        } catch (e) {
            // no-op on failure to inject hint
        }

        // Full Name validation with real-time feedback
        fullNameInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            const validation = this.validateField('fullName', value);

            if (value.length === 0) {
                this.clearValidation('fullname');
            } else if (validation.isValid) {
                this.showSuccess('fullname', '✓ Valid name');
            } else {
                this.showError('fullname', validation.message);
            }
        });

        fullNameInput.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            const validation = this.validateField('fullName', value);

            if (!validation.isValid) {
                this.showError('fullname', validation.message);
            }
        });

        // Email validation with real-time feedback
        emailInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            const validation = this.validateField('email', value);

            if (value.length === 0) {
                this.clearValidation('email');
            } else if (validation.isValid) {
                this.showSuccess('email', '✓ Valid email');
            } else {
                this.showError('email', validation.message);
            }
        });

        emailInput.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            const validation = this.validateField('email', value);

            if (!validation.isValid) {
                this.showError('email', validation.message);
            }
        });

        // Password validation with strength indicator
        passwordInput.addEventListener('input', (e) => {
            const value = e.target.value;
            const validation = this.validateField('password', value);

            // Update password strength indicator
            this.updatePasswordStrength(value);

            if (value.length === 0) {
                this.clearValidation('password');
            } else if (validation.isValid) {
                this.showSuccess('password');
            } else {
                this.showError('password', validation.message);
            }

            // Re-validate confirm password if it has a value
            if (confirmPasswordInput.value) {
                const confirmValidation = this.validateConfirmPassword(value, confirmPasswordInput.value);
                if (confirmValidation.isValid) {
                    this.showSuccess('confirm-password', '✓ Passwords match');
                } else {
                    this.showError('confirm-password', confirmValidation.message);
                }
            }
        });

        // Confirm Password validation
        confirmPasswordInput.addEventListener('input', (e) => {
            const value = e.target.value;
            const passwordValue = passwordInput.value;
            const validation = this.validateConfirmPassword(passwordValue, value);

            if (value.length === 0) {
                this.clearValidation('confirm-password');
            } else if (validation.isValid) {
                this.showSuccess('confirm-password', '✓ Passwords match');
            } else {
                this.showError('confirm-password', validation.message);
            }
        });

        confirmPasswordInput.addEventListener('blur', (e) => {
            const value = e.target.value;
            const passwordValue = passwordInput.value;
            const validation = this.validateConfirmPassword(passwordValue, value);

            if (!validation.isValid) {
                this.showError('confirm-password', validation.message);
            }
        });
    }

    // Setup validation for staff login (basic validation)
    setupStaffValidation() {
        const staffIdInput = document.getElementById('staff-id');
        const staffPasswordInput = document.getElementById('staff-password');

        if (!staffIdInput || !staffPasswordInput) return;

        staffIdInput.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            if (value.length === 0) {
                // Could add visual feedback here if desired
            }
        });

        staffPasswordInput.addEventListener('blur', (e) => {
            const value = e.target.value;
            if (value.length === 0) {
                // Could add visual feedback here if desired  
            }
        });
    }

    // Setup validation for user login (enhanced validation with visual feedback)
    setupUserLoginValidation() {
        const userEmailInput = document.getElementById('user-email');
        const userPasswordInput = document.getElementById('user-password');

        if (!userEmailInput || !userPasswordInput) return;

        // Email validation with visual feedback
        userEmailInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            const validation = this.validateField('email', value);

            if (value.length === 0) {
                this.clearValidation('user-email');
            } else if (validation.isValid) {
                this.showSuccess('user-email', '✓ Valid email');
            } else {
                this.showError('user-email', validation.message);
            }
        });

        userEmailInput.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            const validation = this.validateField('email', value);

            if (!validation.isValid && value.length > 0) {
                this.showError('user-email', validation.message);
            }
        });

        // Password validation with visual feedback
        userPasswordInput.addEventListener('input', (e) => {
            const value = e.target.value;
            const validation = this.validateField('password', value);

            if (value.length === 0) {
                this.clearValidation('user-password');
            } else if (validation.isValid) {
                this.showSuccess('user-password', '✓ Password looks good');
            } else {
                this.showError('user-password', validation.message);
            }
        });

        userPasswordInput.addEventListener('blur', (e) => {
            const value = e.target.value;
            const validation = this.validateField('password', value);

            if (!validation.isValid && value.length > 0) {
                this.showError('user-password', validation.message);
            }
        });
    }

    // Validate entire signup form before submission
    validateSignupForm() {
        const fullName = document.getElementById('signup-fullname')?.value.trim() || '';
        const email = document.getElementById('signup-email')?.value.trim() || '';
        const password = document.getElementById('signup-password')?.value || '';
        const confirmPassword = document.getElementById('signup-confirm-password')?.value || '';

        let isValid = true;

        // Validate full name
        const fullNameValidation = this.validateField('fullName', fullName);
        if (!fullNameValidation.isValid) {
            this.showError('fullname', fullNameValidation.message);
            isValid = false;
        }

        // Validate email
        const emailValidation = this.validateField('email', email);
        if (!emailValidation.isValid) {
            this.showError('email', emailValidation.message);
            isValid = false;
        }

        // Validate password
        const passwordValidation = this.validateField('password', password);
        if (!passwordValidation.isValid) {
            this.showError('password', passwordValidation.message);
            isValid = false;
        }

        // Validate confirm password
        const confirmPasswordValidation = this.validateConfirmPassword(password, confirmPassword);
        if (!confirmPasswordValidation.isValid) {
            this.showError('confirm-password', confirmPasswordValidation.message);
            isValid = false;
        }

        return isValid;
    }

    // Clear all validation states (useful when modal closes)
    clearAllValidation() {
        ['fullname', 'email', 'password', 'confirm-password'].forEach(field => {
            this.clearValidation(field);
        });

        // Hide password strength indicator
        const strengthContainer = document.getElementById('password-strength');
        if (strengthContainer) {
            strengthContainer.classList.remove('show');
        }
    }

    // Setup validation for checkout form
    setupCheckoutValidation() {
        // Phone number validation
        const phoneInput = document.getElementById('phone-number');
        this.addFieldValidation(phoneInput, 'phone', {
            successMessage: '✓ Valid Philippine number'
        });

        // Payment amount validation
        const paymentAmountInput = document.getElementById('payment-amount');
        this.addFieldValidation(paymentAmountInput, 'decimal', {
            successMessage: '✓ Valid payment amount'
        });

        // Bank details validation
        const bankAccountInput = document.getElementById('bank-account');
        const bankNameInput = document.getElementById('bank-name');
        this.addFieldValidation(bankAccountInput, 'required', {
            successMessage: '✓ Bank account provided'
        });
        this.addFieldValidation(bankNameInput, 'text', {
            successMessage: '✓ Valid bank name'
        });

        // GCash details validation
        const gcashNumberInput = document.getElementById('gcash-number');
        const gcashNameInput = document.getElementById('gcash-name');
        this.addFieldValidation(gcashNumberInput, 'phone', {
            successMessage: '✓ Valid GCash number'
        });
        this.addFieldValidation(gcashNameInput, 'text', {
            successMessage: '✓ Valid account name'
        });

        // Cheque details validation
        const chequeNumberInput = document.getElementById('cheque-number');
        const chequeBankInput = document.getElementById('cheque-bank');
        this.addFieldValidation(chequeNumberInput, 'required', {
            successMessage: '✓ Cheque number provided'
        });
        this.addFieldValidation(chequeBankInput, 'text', {
            successMessage: '✓ Valid bank name'
        });

        // Split percentage custom input validation
        const splitPercentCustomInput = document.getElementById('split-percent-custom');
        if (splitPercentCustomInput) {
            this.addFieldValidation(splitPercentCustomInput, 'integer', {
                successMessage: '✓ Valid percentage'
            });
        }

        // Payment reference validation (required for non-COD methods)
        const paymentReferenceInput = document.getElementById('payment-reference');
        if (paymentReferenceInput) {
            this.addFieldValidation(paymentReferenceInput, 'required', {
                successMessage: '✓ Payment reference provided'
            });
        }
    }

    // Setup validation for profile form
    setupProfileValidation() {
        // Username validation (readonly, so no validation needed)

        // Phone number validation
        const phoneNumberInput = document.getElementById('phone-number');
        if (phoneNumberInput && !phoneNumberInput.disabled) {
            this.addFieldValidation(phoneNumberInput, 'phone', {
                successMessage: '✓ Valid Philippine number'
            });
        }

        // Gender radio buttons - no validation needed as one should be selected by default
    }

    // Add enhanced button loading state
    setButtonLoading(buttonId, isLoading) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        if (isLoading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }
}

// Initialize the validation system
const formValidator = new FormValidator();

// Make it globally available for other scripts
window.FormValidator = formValidator;

// Export validation function for signup form
window.validateSignupForm = () => formValidator.validateSignupForm();
window.clearAllValidation = () => formValidator.clearAllValidation();
window.setButtonLoading = (buttonId, isLoading) => formValidator.setButtonLoading(buttonId, isLoading);
