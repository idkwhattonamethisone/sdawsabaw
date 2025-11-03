// Product.js - Database-driven product loading

function formatPHPPrice(price) {
    return '₱' + price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// CRITICAL: Start API call IMMEDIATELY when script loads, before DOMContentLoaded
// Get product ID from URL immediately
(function startProductFetch() {
    const urlParams = new URLSearchParams(window.location.search);
    const productIdParam = urlParams.get('id') || urlParams.get('productId');
    
    if (productIdParam) {
        // Start fetch immediately, don't wait for DOMContentLoaded
        window.productDetailsPromise = fetch(`http://localhost:3000/api/products/${productIdParam}`).then(response => {
            if (!response.ok) throw new Error('Failed to fetch product');
            return response.json();
        }).catch(error => {
            console.error('Error fetching product:', error);
            return null;
        });
    }
})();

// Load product from database based on URL parameter
async function loadProductDetails() {
    const productId = getUrlParameter('id');
    
    // If promise exists from immediate fetch above, use it instead of fetching again
    if (window.productDetailsPromise && productId) {
        try {
            const productData = await window.productDetailsPromise;
            if (productData) {
                // Process product directly using existing logic
                const price = typeof productData.price === 'object' ? 
                    parseFloat(productData.price.$numberDecimal) : 
                    parseFloat(productData.price);
                
                // Store the current product data for cart operations
                window.currentProduct = {
                    id: productData._id,
                    name: productData.name,
                    price: price,
                    image: productData.image,
                    category: productData.category,
                    stock: productData.stockQuantity
                };
                
                // Update product information in the page (extract from existing logic)
                document.getElementById('productTitle').textContent = productData.name;
                const breadcrumbProductName = document.getElementById('productName');
                if (breadcrumbProductName) breadcrumbProductName.textContent = productData.name;
                document.getElementById('productPrice').textContent = price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                
                // Set product image
                const productImage = document.getElementById('productImage');
                if (productData.image) {
                    productImage.src = productData.image;
                    productImage.onerror = () => { productImage.src = 'images/sanrico_logo_1.png'; };
                } else {
                    productImage.src = 'images/sanrico_logo_1.png';
                }
                
                // Update stock indicator
                const stockIndicator = document.getElementById('stockIndicator');
                if (stockIndicator) {
                    const stockDot = stockIndicator.querySelector('.stock-dot');
                    const stockText = stockIndicator.querySelector('.stock-text');
                    if (productData.stockQuantity > 0) {
                        stockIndicator.classList.remove('out-of-stock');
                        if (stockText) stockText.textContent = 'IN STOCK';
                    } else {
                        stockIndicator.classList.add('out-of-stock');
                        if (stockText) stockText.textContent = 'OUT OF STOCK';
                    }
                }
                
                const productCategory = document.getElementById('productCategory');
                if (productCategory) {
                    productCategory.textContent = productData.category || 'General Category';
                    productCategory.href = `shop.html?category=${mapCategoryToUrl(productData.category)}`;
                }
                
                const productItemNumber = document.getElementById('productItemNumber');
                if (productItemNumber) productItemNumber.textContent = productData._id.slice(-12) || '000000000000';
                
                const productMetaDescription = document.getElementById('productMetaDescription');
                if (productMetaDescription) {
                    const shortDescription = productData.description ? 
                        (productData.description.length > 50 ? productData.description.substring(0, 50) + '...' : productData.description) :
                        'No description available';
                    productMetaDescription.textContent = shortDescription;
                }
                
                // Update add to cart button state
                const addToCartBtn = document.getElementById('addToCartBtn');
                const buyNowBtn = document.getElementById('buyNowBtn');
                
                if (productData.stockQuantity === 0) {
                    if (addToCartBtn) { addToCartBtn.disabled = true; addToCartBtn.textContent = 'OUT OF STOCK'; }
                    if (buyNowBtn) { buyNowBtn.disabled = true; buyNowBtn.textContent = 'OUT OF STOCK'; }
                } else {
                    const cart = JSON.parse(localStorage.getItem(`cart_${JSON.parse(localStorage.getItem('currentUser') || 'null')?.id || 'guest'}`)) || { items: [] };
                    const currentQuantityInCart = cart.items.find(item => item.id === productId)?.quantity || 0;
                    if (currentQuantityInCart >= productData.stockQuantity) {
                        if (addToCartBtn) { addToCartBtn.disabled = true; addToCartBtn.textContent = 'STOCK LIMIT REACHED'; }
                        if (buyNowBtn) { buyNowBtn.disabled = true; buyNowBtn.textContent = 'STOCK LIMIT REACHED'; }
                    } else {
                        if (addToCartBtn) { addToCartBtn.disabled = false; addToCartBtn.textContent = 'ADD TO CART'; }
                        if (buyNowBtn) { buyNowBtn.disabled = false; buyNowBtn.textContent = 'BUY NOW'; }
                    }
                }
                
                const stockCount = document.getElementById('stockCount');
                if (stockCount) stockCount.textContent = `(${productData.stockQuantity} available)`;
                
                loadRelatedProducts(productData._id, productData.category);
                updateQuantityLimits();
                return; // Skip the fetch below
            }
        } catch (error) {
            console.error('Error using product promise:', error);
        }
    }
    
    if (!productId) {
        console.error('No product ID provided in URL');
        showToast('No product ID provided. Please select a product from the shop.', 'error');
        setTimeout(() => {
            window.location.href = 'shop.html';
        }, 2000);
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/products/${productId}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.error('Product not found in database');
                showToast('Product not found in database', 'error');
                setTimeout(() => {
                    window.location.href = 'shop.html';
                }, 2000);
                return;
            }
            throw new Error(`Failed to fetch product: ${response.status} ${response.statusText}`);
        }
        const product = await response.json();
        
        if (product) {
            // Convert price from MongoDB format if needed
            const price = typeof product.price === 'object' ? 
                parseFloat(product.price.$numberDecimal) : 
                parseFloat(product.price);
            
            // Update product information in the page
            document.getElementById('productTitle').textContent = product.name;
            
            // Update breadcrumb product name
            const breadcrumbProductName = document.getElementById('productName');
            if (breadcrumbProductName) {
                breadcrumbProductName.textContent = product.name;
            }
            
            document.getElementById('productPrice').textContent = price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            

            
            // Set product image
            const productImage = document.getElementById('productImage');
            if (product.image) {
                productImage.src = product.image;
                productImage.onerror = () => {
                    productImage.src = 'images/sanrico_logo_1.png';
                };
            } else {
                productImage.src = 'images/sanrico_logo_1.png';
            }
            
            // Update stock indicator
            const stockIndicator = document.getElementById('stockIndicator');
            if (stockIndicator) {
                const stockDot = stockIndicator.querySelector('.stock-dot');
                const stockText = stockIndicator.querySelector('.stock-text');
                
                if (product.stockQuantity > 0) {
                    stockIndicator.classList.remove('out-of-stock');
                    if (stockText) stockText.textContent = 'IN STOCK';
                } else {
                    stockIndicator.classList.add('out-of-stock');
                    if (stockText) stockText.textContent = 'OUT OF STOCK';
                }
            }
            
            // Update product meta information
            const productCategory = document.getElementById('productCategory');
            if (productCategory) {
                productCategory.textContent = product.category || 'General Category';
                productCategory.href = `shop.html?category=${mapCategoryToUrl(product.category)}`;
            }
            
            const productItemNumber = document.getElementById('productItemNumber');
            if (productItemNumber) productItemNumber.textContent = product._id.slice(-12) || '000000000000';
            
            const productMetaDescription = document.getElementById('productMetaDescription');
            if (productMetaDescription) {
                // Use a shortened version of the description for the meta section
                const shortDescription = product.description ? 
                    (product.description.length > 50 ? product.description.substring(0, 50) + '...' : product.description) :
                    'No description available';
                productMetaDescription.textContent = shortDescription;
            }
            
            // Update add to cart button state based on stock
            const addToCartBtn = document.getElementById('addToCartBtn');
            const buyNowBtn = document.getElementById('buyNowBtn');
            
            if (product.stockQuantity === 0) {
                if (addToCartBtn) {
                    addToCartBtn.disabled = true;
                    addToCartBtn.textContent = 'OUT OF STOCK';
                }
                if (buyNowBtn) {
                    buyNowBtn.disabled = true;
                    buyNowBtn.textContent = 'OUT OF STOCK';
                }
            } else {
                const cart = JSON.parse(localStorage.getItem(`cart_${JSON.parse(localStorage.getItem('currentUser') || 'null')?.id || 'guest'}`)) || { items: [] };
                const currentQuantityInCart = cart.items.find(item => item.id === productId)?.quantity || 0;

                if (currentQuantityInCart >= product.stockQuantity) {
                    if (addToCartBtn) {
                        addToCartBtn.disabled = true;
                        addToCartBtn.textContent = 'STOCK LIMIT REACHED';
                    }
                    if (buyNowBtn) {
                        buyNowBtn.disabled = true;
                        buyNowBtn.textContent = 'STOCK LIMIT REACHED';
                    }
                } else {
                    if (addToCartBtn) {
                        addToCartBtn.disabled = false;
                        addToCartBtn.textContent = 'ADD TO CART';
                    }
                    if (buyNowBtn) {
                        buyNowBtn.disabled = false;
                        buyNowBtn.textContent = 'BUY NOW';
                    }
                }
            }
            
            // Store the current product data for cart operations
            window.currentProduct = {
                id: product._id,
                name: product.name,
                price: price,
                image: product.image,
                category: product.category,
                stock: product.stockQuantity
            };
            

            // Update the stock count in the top banner
            const stockCount = document.getElementById('stockCount');
            if (stockCount) {
                stockCount.textContent = `(${product.stockQuantity} available)`;
            }
            
            // Load related products from the same category
            loadRelatedProducts(product._id, product.category);
            
            // Update quantity limits after product loads
            updateQuantityLimits();
            
        } else {
            console.error('Product data is null or empty');
            showToast('Product data is empty', 'error');
            setTimeout(() => {
                window.location.href = 'shop.html';
            }, 2000);
        }
    } catch (error) {
        console.error('Error loading product:', error);
        if (error.message.includes('Failed to fetch')) {
            showToast('Cannot connect to server. Please make sure the server is running on port 3000.', 'error');
        } else {
            showToast('Failed to load product details: ' + error.message, 'error');
        }
        setTimeout(() => {
            window.location.href = 'shop.html';
        }, 3000);
    }
}

// Map database category names to URL format (same as in shop.js)
function mapCategoryToUrl(category) {
    switch(category) {
        case 'Power-Tools':
            return 'power-tools';
        case 'Building-Materials':
            return 'building-materials';
        case 'Plumbing':
            return 'plumbing';
        case 'Electrical':
            return 'electrical';
        default:
            return 'all';
    }
}

// Get URL parameters
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Add to cart functionality
async function addToCart() {

    // Check if user is logged in
    if (!Auth.isLoggedIn()) {
        showToast('Please log in to add items to your cart.', 'error');
        // Show login modal
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.classList.add('show');
            // Ensure the user login tab is active
            document.querySelector('#loginTabs .tab-btn[data-tab="user-login"]').click();
        } else {
            // Fallback: redirect to index page with login parameter
            window.location.href = 'index.html?showLogin=true';
        }
        return;
    }

    if (!window.currentProduct) {
        showToast('Product details not loaded yet. Please wait.', 'error');
        return;
    }

    try {
        const quantity = parseInt(document.getElementById('quantityInput').value, 10);
        if (isNaN(quantity) || quantity <= 0) {
            showToast('Please enter a valid quantity.', 'error');
            return;
        }

        const response = await fetch(`http://localhost:3000/api/products/${window.currentProduct.id}`);
        const productData = await response.json();
        
        if (productData.stock < quantity) {
            showToast('Sorry, not enough stock available!');
            return;
        }

        const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        const userId = currentUser ? currentUser.id : 'guest';
        const cartKey = `cart_${userId}`;
        const cartData = JSON.parse(localStorage.getItem(cartKey) || '{}');
        const cart = cartData.items || [];
    
        const existingItemIndex = cart.findIndex(item => item.id === window.currentProduct.id);
        
        if (existingItemIndex > -1) {
            if (cart[existingItemIndex].quantity + quantity > productData.stock) {
                showToast('Adding this quantity would exceed available stock!', 'error');
                return;
            }
            cart[existingItemIndex].quantity += quantity;
        } else {
            cart.push({
                id: window.currentProduct.id,
                name: window.currentProduct.name,
                price: window.currentProduct.price,
                image: window.currentProduct.image,
                quantity: quantity,
                stock: productData.stock
            });
        }
    
        cartData.items = cart;
        localStorage.setItem(cartKey, JSON.stringify(cartData));
        showToast('Added to cart!');
        
        window.dispatchEvent(new CustomEvent('cartUpdated', {
            detail: { cartData }
        }));

    } catch (error) {
        console.error('Error adding to cart:', error);
        showToast('Error adding to cart. Please try again.', 'error');
    }
}

async function buyNow() {
    // Check if user is logged in
    if (!Auth.isLoggedIn()) {
        showToast('Please log in to proceed with your purchase.', 'error');
        // Show login modal
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.classList.add('show');
            // Ensure the user login tab is active
            document.querySelector('#loginTabs .tab-btn[data-tab="user-login"]').click();
        } else {
            // Fallback: redirect to index page with login parameter
            window.location.href = 'index.html?showLogin=true';
        }
        return;
    }

    if (!window.currentProduct) {
        showToast('Product details not loaded yet. Please wait.', 'error');
        return;
    }

    try {
        await addToCart();
        window.location.href = 'checkout.html';
    } catch (error) {
        console.error('Buy Now failed:', error);
        showToast('Could not proceed to checkout. Please try again.', 'error');
    }
}

function shareProduct() {
    const productUrl = window.location.href;
    const productTitle = document.getElementById('productTitle').textContent;
    const text = `Check out this product: ${productTitle}`;

    if (navigator.share) {
        navigator.share({
            title: document.title,
            text: text,
            url: productUrl,
        })
        .then(() => showToast('Product shared successfully!', 'success'))
        .catch((error) => showToast('Error sharing product', 'error'));
    } else {
        // Fallback for browsers that do not support the Web Share API
        navigator.clipboard.writeText(`${text} ${productUrl}`).then(() => {
            showToast('Product link copied to clipboard!', 'info');
        }).catch(err => {
            console.error('Could not copy text: ', err);
            showToast('Failed to copy product link.', 'error');
        });
    }
}

function compareProduct() {
    // Placeholder for compare functionality
    showToast('Compare feature is not yet available.', 'info');
}

// Global variable for a single interval
let quantityInterval = null;

function setupQuantityControls() {
    const quantityInput = document.getElementById('quantityInput');
    const plusBtn = document.getElementById('plusBtn');
    const minusBtn = document.getElementById('minusBtn');
    
    if (!quantityInput || !plusBtn || !minusBtn) {
        return;
    }
    
    const updateQuantity = (amount) => {
        let currentValue = parseInt(quantityInput.value, 10);
        if (isNaN(currentValue)) currentValue = 1;
        
        let newValue = currentValue + amount;
        
        const maxStock = window.currentProduct ? window.currentProduct.stock : 999;
        
        if (newValue < 1) newValue = 1;
        if (newValue > maxStock) {
            newValue = maxStock;
            showToast(`You can only order up to the available stock: ${maxStock}`, 'info');
        }
        
        quantityInput.value = newValue;
    };

    const startUpdating = (amount) => {
        stopUpdating(); // Clear any existing interval
        updateQuantity(amount); // Update immediately
        quantityInterval = setInterval(() => updateQuantity(amount), 150);
    };

    const stopUpdating = () => {
        if (quantityInterval) {
            clearInterval(quantityInterval);
            quantityInterval = null;
        }
    };

    plusBtn.addEventListener('mousedown', () => startUpdating(1));
    minusBtn.addEventListener('mousedown', () => startUpdating(-1));
    
    document.addEventListener('mouseup', stopUpdating);
    document.addEventListener('mouseleave', stopUpdating);
    
    // Also clear on button mouseleave
    plusBtn.addEventListener('mouseleave', stopUpdating);
    minusBtn.addEventListener('mouseleave', stopUpdating);

    // Remove all existing event listeners first
    quantityInput.removeEventListener('input', handleQuantityInput);
    quantityInput.removeEventListener('blur', handleQuantityBlur);
    
    // Add new event listeners
    quantityInput.addEventListener('input', function(e) {
        handleQuantityInput();
    });
    quantityInput.addEventListener('blur', function(e) {
        handleQuantityBlur();
    });
}

function updateQuantityLimits() {
    const quantityInput = document.getElementById('quantityInput');
    if (quantityInput && window.currentProduct) {
        quantityInput.max = window.currentProduct.stock;
    }
}

function validateQuantityInput() {
    const quantityInput = document.getElementById('quantityInput');
    if (!quantityInput) return;

    let value = parseInt(quantityInput.value, 10);
    const maxStock = window.currentProduct ? window.currentProduct.stock : 999;

    if (isNaN(value) || value < 1) {
        quantityInput.value = 1;
    } else if (value > maxStock) {
        quantityInput.value = maxStock;
        showToast(`Stock limit is ${maxStock}.`, 'info');
    }
}

function handleQuantityInput() {
    const quantityInput = document.getElementById('quantityInput');
    if (!quantityInput) return;

    const value = quantityInput.value;
    
    // Allow empty field (for backspacing) - do nothing
    if (value === '') {
        return;
    }
    
    // Check if input is a valid integer
    const numValue = parseInt(value, 10);
    const isFloat = value.includes('.');
    const hasNonNumeric = /[^0-9]/.test(value);
    
    if (hasNonNumeric || isFloat) {
        // Clear the input and show error message
        quantityInput.value = '';
        showToast('Please enter a number only', 'error');
        return;
    }
    
    // If it's a valid integer, validate the range
    const maxStock = window.currentProduct ? window.currentProduct.stock : 999;
    
    // Only enforce maximum, not minimum during typing
    if (numValue > maxStock) {
        quantityInput.value = maxStock;
        showToast(`Stock limit is ${maxStock}.`, 'info');
    }
}

function handleQuantityBlur() {
    const quantityInput = document.getElementById('quantityInput');
    if (!quantityInput) return;

    const value = parseInt(quantityInput.value, 10);
    
    // If field is empty or invalid, reset to 1
    if (quantityInput.value === '' || isNaN(value) || value < 1) {
        quantityInput.value = 1;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // If product promise exists (started above), use it
    if (window.productDetailsPromise) {
        try {
            const productData = await window.productDetailsPromise;
            if (productData) {
                // Process product data directly (don't call loadProductDetails again)
                window.currentProduct = productData;
                // The loadProductDetails function will skip the fetch and use this
                await loadProductDetails();
            } else {
                loadProductDetails(); // Fallback
            }
        } catch (error) {
            console.error('Error processing product:', error);
            loadProductDetails(); // Fallback
        }
    } else {
        loadProductDetails();
    }

    // Attach event listeners (after API call initiated)
    const addToCartBtn = document.getElementById('addToCartBtn');
    if (addToCartBtn) {
        addToCartBtn.addEventListener('click', addToCart);
    }
    
    const buyNowBtn = document.getElementById('buyNowBtn');
    if (buyNowBtn) {
        buyNowBtn.addEventListener('click', buyNow);
    }

    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareProduct);
    }
    
    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
        compareBtn.addEventListener('click', compareProduct);
    }
    
    // Set up quantity controls
    setupQuantityControls();
});


// Load related products based on category
async function loadRelatedProducts(currentProductId, category) {
    if (!category) {
        console.warn('Cannot load related products without a category.');
        const grid = document.getElementById('relatedProductsGrid');
        if (grid) {
            grid.style.display = 'none';
        }
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/products');
        if (!response.ok) {
            throw new Error('Failed to fetch products');
        }
        const allProducts = await response.json();
        
        // Filter products by same category, excluding current product
        const relatedProducts = allProducts
            .filter(product => 
                product.category === category && 
                product._id !== currentProductId
            )
            .slice(0, 4); // Limit to 4 related products
            
        displayRelatedProducts(relatedProducts);
    } catch (error) {
        console.error('Error loading related products:', error);
        // Hide the related products section if there's an error
        const relatedSection = document.querySelector('.related-products-section');
        if (relatedSection) {
            relatedSection.style.display = 'none';
        }
    }
}

// Display related products in the grid
function displayRelatedProducts(products) {
    const relatedProductsGrid = document.getElementById('relatedProductsGrid');
    
    if (!relatedProductsGrid) {
        console.error('Related products grid element not found');
        return;
    }
    
    if (products.length === 0) {
        // Hide the related products section if no related products
        const relatedSection = document.querySelector('.related-products-section');
        if (relatedSection) {
            relatedSection.style.display = 'none';
        }
        return;
    }
    
    relatedProductsGrid.innerHTML = products.map(product => {
        const price = typeof product.price === 'object' ? 
            parseFloat(product.price.$numberDecimal) : 
            parseFloat(product.price);
            
        return `
            <div class="related-product-card" data-stock-quantity="${product.stockQuantity}">
                <div class="stock-display"></div>
                <a href="product.html?id=${product._id}" class="related-product-link">
                    <div class="related-product-img">
                        <img src="${product.image || 'images/sanrico_logo_1.png'}" 
                             alt="${product.name}"
                             onerror="this.src='images/sanrico_logo_1.png'">
                    </div>
                    <div class="related-product-content">
                        <div class="related-product-brand">${product.category}</div>
                        <h3 class="related-product-title">${product.name}</h3>
                        <div class="related-product-price">${formatPHPPrice(price)}</div>
                    </div>
                </a>
            </div>
        `;
    }).join('');
    
    // Initialize stock display for related products
    const relatedCards = relatedProductsGrid.querySelectorAll('.related-product-card');
    relatedCards.forEach(card => {
        const stockQuantity = parseInt(card.dataset.stockQuantity);
        const stockDisplay = card.querySelector('.stock-display');
        const productName = card.querySelector('.related-product-title').textContent;
        const productPrice = card.querySelector('.related-product-price').textContent;
        
        // Remove existing classes
        stockDisplay.classList.remove('in-stock', 'low-stock', 'out-of-stock');
        
        // Create the content HTML
        let stockText;
        if (stockQuantity > 10) {
            stockText = 'In Stock';
            stockDisplay.classList.add('in-stock');
        } else if (stockQuantity > 0) {
            stockText = 'Low Stock';
            stockDisplay.classList.add('low-stock');
        } else {
            stockText = 'Out of Stock';
            stockDisplay.classList.add('out-of-stock');
        }
        
        // Update the display with name, price, and stock info
        stockDisplay.innerHTML = `
            <div class="stock-display-name">${productName}</div>
            <div class="stock-display-price">${productPrice}</div>
            <div class="stock-display-quantity">${stockText}: ${stockQuantity}</div>
        `;
    });
    
    // Update the back to category link to point to the specific category
    const backToCategoryLink = document.querySelector('.back-to-category-link');
    if (backToCategoryLink && products.length > 0) {
        const categoryUrl = mapCategoryToUrl(products[0].category);
        backToCategoryLink.href = `shop.html?category=${categoryUrl}`;
        backToCategoryLink.innerHTML = `
            <i class="fa fa-arrow-left"></i>
            BACK TO ${products[0].category.toUpperCase().replace('-', ' ')}
        `;
    }
}
