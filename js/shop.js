// Initialize variables
let products = []; // Current page of products from API
let allCategories = []; // All available categories (fetched once)
let filteredProducts = []; // For display (same as products when using API pagination)
let currentPage = 1;
const productsPerPage = 12;
let currentMode = 'drag'; // 'drag' or 'multi'
let totalProducts = 0; // Total count from API for pagination
let currentFilters = { category: 'all', sortBy: 'all', minPrice: 0, maxPrice: Infinity, searchQuery: '' };
let productCache = new Map(); // Cache products by page number and filter key
let loadedPages = new Set(); // Track which pages have been loaded
let maxLoadedPage = 0; // Highest page number loaded so far

// Utility function to format prices in PHP currency with comma separators
function formatPHPPrice(price) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(price);
}
// Multi-mode removed - drag and drop only
// Pagination window state (5 pages at a time)
let paginationStart = 1; // first page number currently shown in the window

// Loading functions
function showLoadingProducts() {
    const productsContainer = document.getElementById('products-container');
    if (productsContainer) {
        productsContainer.innerHTML = '<div class="loading-spinner">Loading products...</div>';
    }
}

function showLoadingProductCount() {
    const productCountElement = document.getElementById('product-count');
    if (productCountElement) {
        productCountElement.textContent = 'LOADING';
    }
}

function hideLoadingProducts() {
    // This function will be called after products are loaded
    const loadingElement = document.querySelector('.loading-spinner');
    if (loadingElement) {
        loadingElement.remove();
    }
    
    // Add cart wiggle animation when products finish loading
    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) {
        cartBtn.classList.add('cart-wiggle');
        setTimeout(() => {
            cartBtn.classList.remove('cart-wiggle');
        }, 600);
    }
}

// Get search query from URL
const urlParams = new URLSearchParams(window.location.search);
const searchQuery = urlParams.get('search');

// Generate cache key from filters
function getCacheKey(category, sortBy, searchQuery) {
    return `${category}_${sortBy}_${searchQuery || ''}`;
}

// Load a single page from API
async function fetchPageFromAPI(page, category, sortBy, searchQuery) {
    const skip = (page - 1) * productsPerPage;
    let apiUrl = `http://localhost:3000/api/products?limit=${productsPerPage}&skip=${skip}&includeMeta=true`;
    
    // Add category filter if not 'all'
    if (category && category !== 'all') {
        const normalizeCategory = (cat) => {
            switch(cat) {
                case 'power-tools':
                case 'hand-tools':
                    return 'tools-accessories';
                case 'building-materials':
                    return 'building-materials-aggregates';
                case 'plumbing':
                    return 'plumbing-fixtures';
                case 'electrical':
                    return 'electrical-supplies';
                default:
                    return cat;
            }
        };
        apiUrl += `&category=${encodeURIComponent(normalizeCategory(category))}`;
    }
    
    // Add sort parameter
    if (sortBy && sortBy !== 'all') {
        apiUrl += `&sortBy=${sortBy}`;
    }
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error('Failed to fetch products');
    }
    
    const data = await response.json();
    let pageProducts = [];
    let pageTotalCount = 0;
    
    // Handle both formats: array (backward compat) or object with metadata
    if (Array.isArray(data)) {
        pageProducts = data;
        pageTotalCount = data.length;
    } else {
        pageProducts = data.products || [];
        pageTotalCount = data.totalCount || 0;
    }
    
    // Convert price to number
    const toNumber = (val) => {
        if (val === null || val === undefined) return NaN;
        if (typeof val === 'object' && val.$numberDecimal !== undefined) return parseFloat(val.$numberDecimal);
        return parseFloat(val);
    };
    
    pageProducts = pageProducts.map(product => {
        const candidates = [product.SellingPrice, product.sellingPrice, product.Price, product.price];
        let finalPrice = NaN;
        for (const c of candidates) {
            const n = toNumber(c);
            if (!isNaN(n)) { finalPrice = n; break; }
        }
        return { ...product, price: finalPrice };
    });
    
    return { products: pageProducts, totalCount: pageTotalCount };
}

// Load products with pagination and filters from API (with progressive preloading)
async function loadProducts(page = 1, category = 'all', sortBy = 'all', searchQuery = '') {
    // Check if this is a filter change (different cache key)
    const cacheKey = getCacheKey(category, sortBy, searchQuery);
    const isFilterChange = cacheKey !== getCacheKey(
        currentFilters.category, 
        currentFilters.sortBy, 
        currentFilters.searchQuery
    );
    
    // If filters changed, clear cache and reset loaded pages
    if (isFilterChange) {
        productCache.clear();
        loadedPages.clear();
        maxLoadedPage = 0;
    }
    
    // Check cache first
    const cacheKeyForPage = `${cacheKey}_page_${page}`;
    if (productCache.has(cacheKeyForPage)) {
        const cached = productCache.get(cacheKeyForPage);
        products = cached.products;
        if (cached.totalCount) totalProducts = cached.totalCount;
        loadedPages.add(page);
        if (page > maxLoadedPage) maxLoadedPage = page;
        
        // Apply client-side filters and display
        applyClientSideFilters();
        currentPage = page;
        currentFilters = { category, sortBy, searchQuery };
        displayProducts();
        updateProductCount();
        updatePagination();
        
        // Trigger preloading if needed
        triggerPreloading(page, category, sortBy, searchQuery);
        return;
    }
    
    // Show loading animations only for user-initiated page changes
    if (page === currentPage + 1 || page === currentPage - 1 || page === 1) {
        showLoadingProducts();
        showLoadingProductCount();
    }
    
    try {
        // Fetch the requested page
        const { products: pageProducts, totalCount } = await fetchPageFromAPI(page, category, sortBy, searchQuery);
        
        products = pageProducts;
        totalProducts = totalCount;
        
        // Cache the result
        productCache.set(cacheKeyForPage, { products: pageProducts, totalCount });
        loadedPages.add(page);
        if (page > maxLoadedPage) maxLoadedPage = page;
        
        // Apply client-side filters
        applyClientSideFilters();
        
        // Update current page and filters
        currentPage = page;
        currentFilters = { category, sortBy, searchQuery };
        
        // Display products
        displayProducts();
        updateProductCount();
        updatePagination();
        hideLoadingProducts();
        
        // Trigger preloading if needed
        triggerPreloading(page, category, sortBy, searchQuery);
        
        // Initial load: preload pages 2 and 3 if loading page 1
        if (page === 1 && !isFilterChange) {
            preloadPages([2, 3], category, sortBy, searchQuery);
        }
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Failed to load products', 'error');
        hideLoadingProducts();
    }
}

// Apply client-side filters (search and price range)
function applyClientSideFilters() {
    filteredProducts = [...products];
    
    // Apply price range filter
    const minPriceInput = document.getElementById('minPrice');
    const maxPriceInput = document.getElementById('maxPrice');
    if (minPriceInput || maxPriceInput) {
        const minPrice = minPriceInput ? parseFloat(minPriceInput.value) || 0 : 0;
        const maxPrice = maxPriceInput ? parseFloat(maxPriceInput.value) || Infinity : Infinity;
        if (minPrice > 0 || maxPrice < Infinity) {
            filteredProducts = filteredProducts.filter(product => 
                !isNaN(product.price) && product.price >= minPrice && product.price <= maxPrice
            );
        }
    }
    
    // Apply search filter if provided
    const searchInput = document.querySelector('.header-search input');
    const searchQuery = searchInput ? searchInput.value.trim() : '';
    if (searchQuery) {
        filteredProducts = filteredProducts.filter(product => 
            product.name && product.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }
}

// Check if we need to preload more pages
function triggerPreloading(currentPageNum, category, sortBy, searchQuery) {
    const cacheKey = getCacheKey(category, sortBy, searchQuery);
    const totalPages = Math.ceil(totalProducts / productsPerPage);
    
    // If we're on page 3 or any page that's 2 away from maxLoadedPage, load 2 more pages
    if (currentPageNum >= maxLoadedPage - 1 && maxLoadedPage < totalPages) {
        const pagesToLoad = [];
        const pagesNeeded = Math.min(2, totalPages - maxLoadedPage);
        
        for (let i = 1; i <= pagesNeeded; i++) {
            const pageToLoad = maxLoadedPage + i;
            const cacheKeyForPage = `${cacheKey}_page_${pageToLoad}`;
            if (!productCache.has(cacheKeyForPage) && pageToLoad <= totalPages) {
                pagesToLoad.push(pageToLoad);
            }
        }
        
        if (pagesToLoad.length > 0) {
            preloadPages(pagesToLoad, category, sortBy, searchQuery);
        }
    }
}

// Preload multiple pages in the background
async function preloadPages(pages, category, sortBy, searchQuery) {
    // Load pages in parallel
    const loadPromises = pages.map(page => 
        fetchPageFromAPI(page, category, sortBy, searchQuery)
            .then(({ products: pageProducts, totalCount }) => {
                const cacheKey = getCacheKey(category, sortBy, searchQuery);
                const cacheKeyForPage = `${cacheKey}_page_${page}`;
                
                // Only cache if not already cached (race condition protection)
                if (!productCache.has(cacheKeyForPage)) {
                    productCache.set(cacheKeyForPage, { products: pageProducts, totalCount });
                    loadedPages.add(page);
                    if (page > maxLoadedPage) maxLoadedPage = page;
                }
            })
            .catch(error => {
                console.error(`Error preloading page ${page}:`, error);
            })
    );
    
    // Don't await - let it load in background
    Promise.all(loadPromises).then(() => {
        console.log(`Preloaded pages: ${pages.join(', ')}`);
    });
}

// Load all categories once (for filter dropdown)
async function loadCategories() {
    try {
        // Fetch a small sample to get categories, or use a dedicated endpoint
        const response = await fetch('http://localhost:3000/api/products?limit=1000');
        if (response.ok) {
            const allProducts = await response.json();
            allCategories = [...new Set(allProducts.map(p => p.category).filter(c => c))];
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Update product count in sidebar
function updateProductCount() {
    // Use totalProducts from API when using pagination
    const countElement = document.getElementById('productCount');
    if (countElement) {
        countElement.textContent = totalProducts > 0 ? totalProducts : filteredProducts.length;
    }
}

// Get URL parameters
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Filter and sort products - reloads from API with new filters
function filterAndSortProducts(selectedCategory = null) {
    const searchInput = document.querySelector('.header-search input');
    const sortBySelect = document.getElementById('sort-by');
    
    // Get category from parameter or active sidebar link
    const category = selectedCategory || document.querySelector('.category-link.active')?.dataset.category || 'all';
    const searchQuery = searchInput ? searchInput.value.trim() : '';
    const sortBy = sortBySelect ? sortBySelect.value : 'all';
    
    // Reset to first page when filters change
    paginationStart = 1;
    currentPage = 1;
    
    // Reload products from API with new filters
    loadProducts(currentPage, category, sortBy, searchQuery);
}

// Display products in the grid (products are already paginated from API)
function displayProducts(productsToDisplay = filteredProducts) {
    // Products are already paginated from API, no need to slice
    const displayedProducts = productsToDisplay;
    
    // Add cart wiggle animation when products are first displayed
    if (displayedProducts.length > 0) {
        const cartBtn = document.getElementById('cartBtn');
        if (cartBtn && !cartBtn.classList.contains('cart-wiggle')) {
            cartBtn.classList.add('cart-wiggle');
            setTimeout(() => {
                cartBtn.classList.remove('cart-wiggle');
            }, 600);
        }
    }
    
    // Add null checks for DOM elements
    const productGrid = document.getElementById('product-grid');
    const pagination = document.getElementById('pagination');
    
    if (!productGrid) {
        console.error('product-grid element not found');
        return;
    }
    
    if (!pagination) {
        console.error('pagination element not found');
        return;
    }

    if (displayedProducts.length === 0) {
        productGrid.innerHTML = `
            <div class="no-products-found">
                <img src="images/ruined-building-house-home-broken-house-svgrepo-com.svg" alt="No products found" class="no-products-icon">
                <h3>No Products Found</h3>
                <p>We couldn't find any products matching your criteria.</p>
                <button onclick="resetFilters()" class="reset-filters-btn">Reset Filters</button>
            </div>
        `;
        pagination.innerHTML = '';
        return;
    }

    const userLoggedIn = (typeof Auth !== 'undefined' && typeof Auth.isLoggedIn === 'function') ? Auth.isLoggedIn() : false;
    productGrid.innerHTML = displayedProducts.map(product => `
        <div class="product-card" data-stock-quantity="${product.stockQuantity}">
            <a href="product.html?id=${product._id}" class="product-link">
                <div class="product-img">
                    <img src="${product.image || 'images/sanrico_logo_1.png'}"
                         alt="${product.name}"
                         style="width: 100%; height: 100%; object-fit: cover;">
                    <div class="product-img-overlay">
                        <span class="product-price">${formatPHPPrice(product.price)}</span>
                    </div>
                </div>
                <div class="product-content">
                    <h3 class="product-title">${product.name}</h3>
                </div>
            </a>
            
            <!-- Stock only - no dropdowns -->
            <div class="product-details">
                <div class="product-stock">
                    <span class="stock-label">Stock:</span>
                    <span class="stock-amount">${product.stockQuantity}</span>
                </div>
            </div>
            
            <div class="drag-handle ${product.stockQuantity < 1 ? 'out-of-stock' : ''}" 
                 ${product.stockQuantity >= 1 && currentMode === 'drag' && userLoggedIn ? 'draggable="true"' : ''}
                 data-product-id="${product._id}"
                 data-product-name="${product.name}"
                 data-product-price="${product.price}"
                 data-product-image="${product.image || 'images/sanrico_logo_1.png'}"
                 data-stock-quantity="${product.stockQuantity}"
                 title="${product.stockQuantity < 1 ? 'Out of stock' : 'Drag to cart'}">
                ${product.stockQuantity < 1 ? '❌' : '🛒'}
            </div>
        </div>
    `).join('');

    // Add drag or login prompt handlers to drag handles
    document.querySelectorAll('.drag-handle').forEach(handle => {
        if (userLoggedIn) {
            // Allow drag
            handle.addEventListener('dragstart', handleDragStart);
            handle.addEventListener('dragend', handleDragEnd);
        } else {
            // Block drag and prompt login
            handle.removeAttribute('draggable');
            handle.addEventListener('dragstart', (e) => {
                e.preventDefault();
                showToast('Please log in to add items to your cart.');
                if (window.showLoginModal) window.showLoginModal();
                else { const lm = document.getElementById('loginModal'); if (lm) lm.classList.add('show'); }
            });
            handle.addEventListener('click', (e) => {
                e.preventDefault();
                showToast('Please log in to add items to your cart.');
                if (window.showLoginModal) window.showLoginModal();
                else { const lm = document.getElementById('loginModal'); if (lm) lm.classList.add('show'); }
            });
        }
    });

    // Product-level dropdowns removed - no event listeners needed

    // Drag and drop mode only - no click listeners needed

    if (window.initializeStockDisplay) {
        window.initializeStockDisplay();
    }

    updatePagination();
}

// Drag and drop handlers
function handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify({
        id: e.target.dataset.productId,
        name: e.target.dataset.productName,
        price: parseFloat(e.target.dataset.productPrice),
        image: e.target.dataset.productImage,
        stockQuantity: parseInt(e.target.dataset.stockQuantity)
    }));
    
    // Add visual feedback
    e.target.classList.add('dragging');
    
    // Create drag image
    const dragImage = e.target.cloneNode(true);
    dragImage.style.opacity = '0.7';
    dragImage.style.transform = 'rotate(5deg)';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 50, 50);
    
    // Remove the temporary element after a short delay
    setTimeout(() => {
        document.body.removeChild(dragImage);
    }, 100);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

// Update pagination controls
function updatePagination() {
    // Use totalProducts from API for pagination
    const totalPages = Math.ceil((totalProducts || filteredProducts.length) / productsPerPage);
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    pagination.innerHTML = '';

    if (totalPages <= 1) return; // no pagination needed

    const windowSize = 5;
    // Ensure paginationStart is valid
    const maxStart = Math.max(1, totalPages - windowSize + 1);
    if (paginationStart > maxStart) paginationStart = maxStart;
    if (paginationStart < 1) paginationStart = 1;

    const windowEnd = Math.min(paginationStart + windowSize - 1, totalPages);

    // Helper to create a page button
    const createPageBtn = (label, page, isActive = false) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        if (isActive) btn.className = 'active';
        btn.onclick = () => {
            // Get current filters
            const sortBySelect = document.getElementById('sort-by');
            const sortBy = sortBySelect ? sortBySelect.value : 'all';
            const category = document.querySelector('.category-link.active')?.dataset.category || 'all';
            const searchInput = document.querySelector('.header-search input');
            const searchQuery = searchInput ? searchInput.value.trim() : '';
            
            // Shift window if the chosen page is outside current window
            const desiredStart = Math.floor((page - 1) / windowSize) * windowSize + 1;
            if (desiredStart !== paginationStart) paginationStart = desiredStart;
            
            // Load products for the new page
            loadProducts(page, category, sortBy, searchQuery);
        };
        return btn;
    };

    // If there are pages before the window, show first and a back ellipsis
    if (paginationStart > 1) {
        pagination.appendChild(createPageBtn('1', 1, currentPage === 1));
        const backEllipsis = document.createElement('button');
        backEllipsis.textContent = '…';
        backEllipsis.onclick = () => {
            paginationStart = Math.max(1, paginationStart - windowSize);
            updatePagination(); // Refresh pagination UI
        };
        pagination.appendChild(backEllipsis);
    }

    // Current window of pages
    for (let i = paginationStart; i <= windowEnd; i++) {
        pagination.appendChild(createPageBtn(String(i), i, i === currentPage));
    }

    // If there are pages after the window, show a forward ellipsis and last page
    if (windowEnd < totalPages) {
        const fwdEllipsis = document.createElement('button');
        fwdEllipsis.textContent = '…';
        fwdEllipsis.onclick = () => {
            paginationStart = windowEnd + 1;
            updatePagination(); // Refresh pagination UI
        };
        pagination.appendChild(fwdEllipsis);

        pagination.appendChild(createPageBtn(String(totalPages), totalPages, currentPage === totalPages));
    }
}

// Handle Google Sign In
function handleGoogleSignIn(response) {
    if (response.credential) {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        
        // Use Auth.login to properly handle the login
        const result = Auth.login({
            email: payload.email,
            fullName: payload.name,
            picture: payload.picture,
            isStaff: false
        });
        
        if (result.success) {
            // Update UI immediately
            updateTopLoginBtn();
            Auth.updateCartCount();
            
            // Close modal if it exists
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.classList.remove('show');
            }
            
            // Show success message
            showToast(`Welcome, ${payload.name}!`, 'success');
        } else {
            showToast('Login failed. Please try again.', 'error');
        }
    }
}

// Update top login button text and functionality
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

// Shop page uses API pagination - no need to pre-fetch all products
// Products will be loaded on demand with pagination when DOMContentLoaded fires

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Only run shop functionality on shop pages
    if (!window.location.pathname.includes('shop.html')) {
        return;
    }
    
    // Get initial category from URL if present
    const urlCategory = getUrlParameter('category');
    const initialCategory = urlCategory || 'all';
    
    // Load categories for filter dropdown
    await loadCategories();
    
    // Load initial page of products with pagination
    const sortBySelect = document.getElementById('sort-by');
    const initialSortBy = sortBySelect ? sortBySelect.value : 'all';
    
    // Load products with API pagination
    await loadProducts(1, initialCategory, initialSortBy, searchQuery || '');
    
    // Set active category link if URL category exists
    if (urlCategory) {
        const categoryLink = document.querySelector(`.category-link[data-category="${urlCategory}"]`);
        if (categoryLink) {
            categoryLink.classList.add('active');
        }
    }
    
    // Update cart count and login state
    Auth.updateCartCount();
    updateTopLoginBtn();

    // Set up event listeners with null checks
    const sortByElement = document.getElementById('sort-by');
    if (sortByElement) {
        sortByElement.addEventListener('change', () => {
            currentPage = 1; // Reset to first page when sorting
            filterAndSortProducts();
        });
    }
    
    // Add clear filters button event listener
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            resetFilters();
        });
    }
    
    // Add search form submit event listener
    const searchForm = document.querySelector('.header-search');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevent form submission
            // Page reset is handled in filterAndSortProducts
            filterAndSortProducts();
        });

        // Add Enter key event listener to search input
        const searchInput = searchForm.querySelector('input');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent form submission
                    // Page reset is handled in filterAndSortProducts
                    filterAndSortProducts();
                }
            });
        }
    }

    // Add category filter event listener (only for filter links, not product links)
    document.querySelectorAll('.category-filter .category-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.category-filter .category-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            filterAndSortProducts(this.dataset.category);
        });
    });

    // Add price filter event listener
    const priceFilter = document.querySelector('.price-filter');
    if (priceFilter) {
        priceFilter.addEventListener('change', () => {
            filterAndSortProducts();
        });
    }

    // Price range filter - add null check
    const applyPriceRangeBtn = document.getElementById('applyPriceRange');
    if (applyPriceRangeBtn) {
        applyPriceRangeBtn.addEventListener('click', () => {
        const minPrice = parseFloat(document.getElementById('minPrice').value) || 0;
        const maxPrice = parseFloat(document.getElementById('maxPrice').value) || Infinity;
        
        // Validate price range
        if (minPrice > maxPrice) {
            showToast('Minimum price cannot be greater than maximum price', 'error');
            return;
        }

        // If no explicit sort chosen, default to price ascending when applying a range
        const sortBy = document.getElementById('sort-by');
        if (sortBy && (sortBy.value === 'all' || sortBy.value === 'name')) {
            sortBy.value = 'price-low';
        }

        filterAndSortProducts();
        showToast('Price filter applied');
    });
}

    // Allow Enter key to apply price range filter
    ['minPrice', 'maxPrice'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission
                document.getElementById('applyPriceRange').click();
            }
        });
        }
    });

    // Category handling is already done above in initialization section

    // Setup mode toggle functionality
    setupModeToggle();

    // Multi-mode removed - drag and drop only
});

// Add reset filters function
function resetFilters() {
    // Reset all filter inputs
    const sortBy = document.getElementById('sort-by');
    if (sortBy) sortBy.value = 'all';
    
    const minPrice = document.getElementById('minPrice');
    if (minPrice) minPrice.value = '';
    
    const maxPrice = document.getElementById('maxPrice');
    if (maxPrice) maxPrice.value = '';
    
    // Reset search input
    const searchInput = document.querySelector('.header-search input');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Product-level dropdowns removed - no need to reset them
    
    // Reset category selection
    document.querySelectorAll('.category-link').forEach(link => link.classList.remove('active'));
    document.querySelector('.category-link[data-category="all"]').classList.add('active');
    window.currentSidebarCategory = 'all';
    
    // Reset filters and reload from API
    filterAndSortProducts();
    updateProductCount();
    
    // Clear URL search parameters
    window.history.pushState({}, '', 'shop.html');
    
    // Show success message
    showToast('Filters have been reset');
}

// Add event listener for price range filter - only if element exists
const applyPriceRangeElement = document.getElementById('applyPriceRange');
if (applyPriceRangeElement) {
    applyPriceRangeElement.addEventListener('click', function(e) {
    e.preventDefault();
    filterAndSortProducts();
});
}

// Always use drag mode - no mode toggle needed
function setupModeToggle() {
    // Force drag mode always
    currentMode = 'drag';
}

function switchMode(mode) {
    // Always use drag mode
    currentMode = 'drag';
}

// Multi-mode click handler removed - drag and drop only

// Multi-mode actions removed - drag and drop only

// Multi-mode cart functions removed - drag and drop only

