function formatPHPPrice(price) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(price);
}

document.addEventListener('DOMContentLoaded', async () => {
    const cartItemsContainer = document.getElementById('cartItems');
    const emptyCartDiv = document.getElementById('emptyCart');
    const cartContent = document.getElementById('cartContent');
    const subtotalElement = document.getElementById('subtotal');
    const totalElement = document.getElementById('total');
    const notesInput = document.getElementById('notes-input');
    const clearCartBtn = document.getElementById('clearCartBtn');
    const checkoutBtn = document.getElementById('checkoutBtn');

    // Initialize cart
    const myCart = new Cart();
    let selectedCartItemIds = new Set();
    let cartItems = myCart.getItems();
    if (selectedCartItemIds.size === 0) {
        cartItems.forEach(item => selectedCartItemIds.add(item.id));
    }

    // Display cart items
    async function displayCart() {
        if (!cartItemsContainer) return;

        if (cartItems.length === 0) {
            if (emptyCartDiv) emptyCartDiv.style.display = 'block';
            if (cartContent) cartContent.style.display = 'none';
            if (checkoutBtn) checkoutBtn.style.display = 'none';
            return;
        }
        if (emptyCartDiv) emptyCartDiv.style.display = 'none';
        if (cartContent) cartContent.style.display = 'block';
        if (checkoutBtn) checkoutBtn.style.display = '';

        const toNumber = (val) => {
            if (val === null || val === undefined) return NaN;
            if (typeof val === 'object' && val.$numberDecimal !== undefined) return parseFloat(val.$numberDecimal);
            return parseFloat(val);
        };
        cartItemsContainer.innerHTML = cartItems.map(item => {
            const priceNum = toNumber(item.price);
            const qtyNum = parseInt(item.quantity) || 1;
            const itemTotal = (isNaN(priceNum) ? 0 : priceNum) * qtyNum;
            let imageSrc = item.image || 'sanrico_logo_1.png';
            if (
                imageSrc &&
                !imageSrc.startsWith('http') &&
                !imageSrc.startsWith('data:') &&
                !imageSrc.startsWith('/')
            ) {
                imageSrc = imageSrc.replace(/^images\//, ''); // remove leading images/ to avoid double
                imageSrc = 'images/' + imageSrc;
                imageSrc = '/' + imageSrc;
            }
            const checked = selectedCartItemIds.size === 0 || selectedCartItemIds.has(item.id) ? 'checked' : '';
            return `
                <tr>
                    <td class="select-cell">
                        <input type="checkbox" class="cart-item-checkbox" data-item-id="${item.id}" ${selectedCartItemIds.has(item.id) ? 'checked' : ''} aria-label="Select item">
                    </td>
                    <td class="product-cell">
                        <img src="${imageSrc}" alt="${item.name}" class="product-image">
                        <div class="product-info">
                            <h3>${item.name}</h3>
                        </div>
                    </td>
                    <td class="price-cell">${formatPHPPrice(isNaN(priceNum) ? 0 : priceNum)}</td>
                    <td class="quantity-cell">
                        <div class="quantity-controls">
                            <button class="minus-btn" data-item-id="${item.id}">-</button>
                            <input type="number" class="quantity-input" value="${item.quantity}" min="1" data-item-id="${item.id}">
                            <button class="plus-btn" data-item-id="${item.id}">+</button>
                        </div>
                    </td>
                    <td class="subtotal-cell">${formatPHPPrice(itemTotal)}</td>
                    <td class="remove-cell">
                        <button class="remove-item" onclick="removeItem('${item.id}')">×</button>
                    </td>
                </tr>
            `;
        }).join('');

        // After rendering, add event listeners for checkboxes
        cartItemsContainer.querySelectorAll('.cart-item-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const itemId = this.getAttribute('data-item-id');
                if (this.checked) {
                    selectedCartItemIds.add(itemId);
                } else {
                    selectedCartItemIds.delete(itemId);
                }
                displayCart();
            });
        });

        // Select all logic
        const selectAllCheckbox = document.getElementById('selectAllCartItems');
        if (selectAllCheckbox) {
            // Remove previous event listeners
            const newSelectAll = selectAllCheckbox.cloneNode(true);
            selectAllCheckbox.parentNode.replaceChild(newSelectAll, selectAllCheckbox);

            // Set checked/indeterminate state
            newSelectAll.checked = selectedCartItemIds.size === cartItems.length;
            newSelectAll.indeterminate = selectedCartItemIds.size > 0 && selectedCartItemIds.size < cartItems.length;

            newSelectAll.addEventListener('change', function() {
                if (this.checked) {
                    cartItems.forEach(item => selectedCartItemIds.add(item.id));
                } else {
                    selectedCartItemIds.clear();
                }
                displayCart();
            });
        }

        function updateSelectAllCheckbox() {
            const selectAllCheckbox = document.getElementById('selectAllCartItems');
            if (!selectAllCheckbox) return;
            if (selectedCartItemIds.size === cartItems.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else if (selectedCartItemIds.size === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }

        updateTotal();
        initializeQuantityControls();
    }

    // Initialize quantity controls
    function initializeQuantityControls() {
        document.querySelectorAll('.minus-btn').forEach(btn => {
            btn.addEventListener('click', handleMinusClick);
        });
        
        document.querySelectorAll('.plus-btn').forEach(btn => {
            btn.addEventListener('click', handlePlusClick);
        });
        
        document.querySelectorAll('.quantity-input').forEach(input => {
            setupQuantityInput(input);
        });
    }

    // Handle minus button click
    async function handleMinusClick(e) {
        const itemId = e.target.getAttribute('data-item-id');
        const input = document.querySelector(`.quantity-input[data-item-id="${itemId}"]`);
        const currentValue = parseInt(input.value) || 1;
        
        if (currentValue > 1) {
            input.value = currentValue - 1;
            await updateQuantityFromInput(itemId, currentValue - 1);
        } else {
            // Don't allow going below 1, just keep it at 1
            input.value = 1;
            await updateQuantityFromInput(itemId, 1);
        }
    }

    // Handle plus button click
    async function handlePlusClick(e) {
        const itemId = e.target.getAttribute('data-item-id');
        const input = document.querySelector(`.quantity-input[data-item-id="${itemId}"]`);
        const currentValue = parseInt(input.value) || 1;
        
        try {
            const response = await fetch(`http://localhost:3000/api/products/${itemId}`);
            const product = await response.json();
            const availableStock = (() => {
                const s = product.stock !== undefined ? product.stock : product.stockQuantity;
                const n = parseInt(s);
                return isNaN(n) ? Infinity : n;
            })();
            
            if (currentValue >= availableStock) {
                showToast('Sorry, this item is out of stock!');
                return;
            }
            
            input.value = currentValue + 1;
            await updateQuantityFromInput(itemId, currentValue + 1);
        } catch (error) {
            console.error('Error checking stock:', error);
            showToast('Error updating quantity. Please try again.');
        }
    }

    // Setup quantity input
    function setupQuantityInput(input) {
        // store previous valid value
        input.dataset.prevValue = String(parseInt(input.value) || 1);

        input.addEventListener('change', async (e) => {
            const itemId = e.target.getAttribute('data-item-id');
            const newValue = parseInt(e.target.value);
            
            if (isNaN(newValue) || newValue < 1) {
                e.target.value = 1;
                await updateQuantityFromInput(itemId, 1);
                e.target.dataset.prevValue = '1';
            } else {
                await updateQuantityFromInput(itemId, newValue);
                e.target.dataset.prevValue = String(newValue);
            }
        });
        input.addEventListener('input', (e) => {
            // allow empty while typing; otherwise enforce numeric
            const val = e.target.value;
            if (val === '') return; // let user clear before typing
            if (!/^\d+$/.test(val)) {
                // revert to previous valid value
                e.target.value = e.target.dataset.prevValue || '1';
            } else {
                e.target.dataset.prevValue = val;
            }
        });
        input.addEventListener('blur', async (e) => {
            const itemId = e.target.getAttribute('data-item-id');
            const val = e.target.value;
            if (val === '' || isNaN(parseInt(val)) || parseInt(val) < 1) {
                e.target.value = 1;
                e.target.dataset.prevValue = '1';
                await updateQuantityFromInput(itemId, 1);
            }
        });
    }

    // Update quantity from input
    async function updateQuantityFromInput(id, newQuantity) {
        try {
            // Ensure quantity is at least 1
            if (newQuantity < 1) {
                newQuantity = 1;
            }
            
            const response = await fetch(`http://localhost:3000/api/products/${id}`);
            const product = await response.json();
            const availableStock = (() => {
                const s = product.stock !== undefined ? product.stock : product.stockQuantity;
                const n = parseInt(s);
                return isNaN(n) ? Infinity : n;
            })();

            if (availableStock === 0) {
                showToast('This product is out of stock.');
                return;
            }
            
            const requestedQty = parseInt(newQuantity) || 1;
            const finalQuantity = Math.min(requestedQty, availableStock);
            
            // Always update the quantity (never remove unless explicitly requested)
            myCart.updateQuantity(id, finalQuantity);
            cartItems = myCart.getItems();
            await displayCart();
            updateHeaderCartBadge();
            
            if (finalQuantity !== newQuantity) {
                showToast(`Quantity adjusted to ${finalQuantity} (stock limit reached)`);
            }
        } catch (error) {
            console.error('Error updating quantity:', error);
            showToast('Error updating quantity. Please try again.');
        }
    }

    // Remove item
    async function removeItem(id) {
        myCart.removeItem(id);
        cartItems = myCart.getItems();
        await displayCart();
        updateHeaderCartBadge();
        showToast('Item removed from cart');
    }

    // Update total price
    function updateTotal() {
        const toNumber = (val) => {
            if (val === null || val === undefined) return NaN;
            if (typeof val === 'object' && val.$numberDecimal !== undefined) return parseFloat(val.$numberDecimal);
            return parseFloat(val);
        };
        const subtotal = cartItems.reduce((sum, item) => {
            const p = toNumber(item.price);
            const q = parseInt(item.quantity) || 1;
            return sum + ((isNaN(p) ? 0 : p) * q);
        }, 0);
        if (subtotalElement) {
            subtotalElement.textContent = formatPHPPrice(subtotal);
        }
        if (totalElement) {
            totalElement.textContent = formatPHPPrice(subtotal);
        }
    }

    // Save notes when changed
    if (notesInput) {
        notesInput.value = myCart.notes || '';
        notesInput.addEventListener('change', function() {
            myCart.notes = this.value;
            myCart.saveCart();
            showToast('Notes updated');
        });
    }

    // Clear cart functionality
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to clear your cart?')) {
                myCart.clearCart();
                cartItems = myCart.getItems();
                displayCart();
                updateHeaderCartBadge();
                showToast('Cart cleared');
            }
        });
    }

    // Checkout button functionality
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const selectedItems = cartItems.filter(item => selectedCartItemIds.has(item.id));
            if (selectedItems.length === 0) {
                showToast('Please select at least one item to checkout.');
                return;
            }
            // Proceed to checkout with selectedItems only
            proceedToCheckout(selectedItems);
        });
    }

    // Listen for cart updates from other pages
    window.addEventListener('cartUpdated', async (event) => {
        // Temporarily disabled to prevent race condition with quantity updates
        // if (event.detail && event.detail.cartData) {
        //     const cartKey = `cart_${Auth.getCurrentUser() ? Auth.getCurrentUser().id : 'guest'}`;
        //     localStorage.setItem(cartKey, JSON.stringify(event.detail.cartData));
        //     myCart.loadCart();
        //     cartItems = myCart.getItems();
        //     await displayCart();
        // }
        // Update header cart badge
        Auth.updateCartCount();
    });

    // Update header cart badge when cart changes locally
    function updateHeaderCartBadge() {
        Auth.updateCartCount();
    }

    // Add cart update event listener for local changes
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('cart_')) {
            updateHeaderCartBadge();
        }
    });

    // Initial display
    await displayCart();
    // Update header cart badge on page load
    updateHeaderCartBadge();
});

function proceedToCheckout(selectedItems) {
    // Example: Save selected items to sessionStorage and redirect
    sessionStorage.setItem('checkoutItems', JSON.stringify(selectedItems));
    window.location.href = 'checkout.html';
}
