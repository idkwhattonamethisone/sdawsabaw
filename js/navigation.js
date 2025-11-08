class Navigation {
    constructor() {
        // Apply ultra-early preload styles to avoid initial content flash
        this.applyPreloadStyles();
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        this.setupPageLoader();
        this.setActiveNavLink();
        try {
            const pathname = (location.pathname || '').toLowerCase();
            if (!pathname.endsWith('/shop.html') && !pathname.endsWith('shop.html')) {
                this.setupSidebarQuickNav();
            }
        } catch (e) { /* noop */ }
    }

    applyPreloadStyles() {
        // Transition page loader disabled
        return;
<<<<<<< HEAD
        try {
            // Allow opt-out or excluded pages
            const pathname = (location.pathname || '').toLowerCase();
            const excluded = ['/aboutus.html', '/faq.html', '/addresses.html'];
            if (window.DISABLE_PAGE_LOADER || (document.body && document.body.classList.contains('no-loader')) || excluded.some(p => pathname.endsWith(p))) {
                return;
            }

            if (!document.getElementById('preloadOverlayStyles')) {
                const style = document.createElement('style');
                style.id = 'preloadOverlayStyles';
                style.textContent = [
                    'html.preloading, body.preloading{height:100%}',
                    // White overlay below JS overlay/spinner
                    'html.preloading::before{content:"";position:fixed;inset:0;background:rgba(255,255,255,0.98);z-index:9998}',
                    '@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}'
                ].join('\n');
                document.head.appendChild(style);
            }
            // Add preloading class to html immediately to block first paint
            document.documentElement.classList.add('preloading');
            // Body may not exist yet; add when available
            if (document.body) {
                document.body.classList.add('preloading');
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    try { document.body.classList.add('preloading'); } catch(e) {}
                });
            }

            // Show JS overlay immediately for visibility of spinner/text (above html::before)
            try { window.LoadingUtils.show('LOADING'); this.preloadShownAt = Date.now(); } catch(e) {
                // If LoadingUtils not ready yet, ensure it shows as soon as possible
                document.addEventListener('DOMContentLoaded', () => {
                    try { window.LoadingUtils.show('LOADING'); this.preloadShownAt = Date.now(); } catch (_) {}
                }, { once: true });
            }
        } catch(e) { /* noop */ }
=======
>>>>>>> restore_from_6h
    }

    setupPageLoader() {
        // Transition page loader disabled; ensure any residual classes are cleaned up
        try { document.documentElement.classList.remove('preloading'); } catch(e) {}
        try { document.body && document.body.classList.remove('preloading'); } catch(e) {}
        try { window.LoadingUtils && window.LoadingUtils.hide && window.LoadingUtils.hide(); } catch(e) {}
        return;
<<<<<<< HEAD
        // Cleanup helper to ensure any early overlays/classes are removed
        const cleanupLoader = () => {
            try { document.documentElement.classList.remove('preloading'); } catch(e) {}
            try { document.body && document.body.classList.remove('preloading'); } catch(e) {}
            try { window.LoadingUtils && window.LoadingUtils.hide(); } catch(e) {}
        };

        // Allow opt-out per page but ALWAYS cleanup if preloader was shown
        const pathname = (location.pathname || '').toLowerCase();
        const excluded = [
            '/aboutus.html',
            '/faq.html',
            '/addresses.html'
        ];
        const loaderDisabled = window.DISABLE_PAGE_LOADER || (document.body && document.body.classList.contains('no-loader'));
        const isExcluded = excluded.some(p => pathname.endsWith(p));
        if (loaderDisabled || isExcluded) {
            cleanupLoader();
            return;
        }

        // Provide global LoadingUtils API
        if (!window.LoadingUtils) {
            window.LoadingUtils = {
                _ensureOverlay() {
                    let overlay = document.getElementById('loadingOverlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.id = 'loadingOverlay';
                        overlay.style.cssText = [
                            'position:fixed',
                            'inset:0',
                            'background:rgba(255,255,255,0.95)',
                            'backdrop-filter:saturate(140%) blur(2px)',
                            'display:flex',
                            'align-items:center',
                            'justify-content:center',
                            'z-index:10000',
                            'opacity:0',
                            'pointer-events:none',
                            'transition:opacity .2s ease'
                        ].join(';');

                        const wrapper = document.createElement('div');
                        wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;color:#444;';

                        const spinner = document.createElement('div');
                        spinner.style.cssText = [
                            'width:42px',
                            'height:42px',
                            'border:4px solid #f1f1f1',
                            'border-top-color:#e63946',
                            'border-radius:50%',
                            'animation:spin 1s linear infinite'
                        ].join(';');

                        const text = document.createElement('div');
                        text.id = 'loadingOverlayText';
                        text.style.cssText = 'font-weight:600;font-size:14px;';
                        text.textContent = 'LOADING';

                        wrapper.appendChild(spinner);
                        wrapper.appendChild(text);
                        overlay.appendChild(wrapper);
                        document.body.appendChild(overlay);

                        // Inject minimal keyframes once
                        if (!document.getElementById('loadingOverlayStyles')) {
                            const style = document.createElement('style');
                            style.id = 'loadingOverlayStyles';
                            style.textContent = '@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}';
                            document.head.appendChild(style);
                        }
                    }
                    return overlay;
                },
                show(message) {
                    const overlay = this._ensureOverlay();
                    const label = document.getElementById('loadingOverlayText');
                    if (label) label.textContent = 'LOADING';
                    overlay.style.pointerEvents = 'auto';
                    overlay.style.opacity = '1';
                },
                hide() {
                    const overlay = document.getElementById('loadingOverlay');
                    if (!overlay) return;
                    overlay.style.opacity = '0';
                    overlay.style.pointerEvents = 'none';
                    try {
                        // Notify listeners that the page loader finished hiding
                        window.dispatchEvent(new Event('pageLoaderHidden'));
                    } catch (e) {}
                }
            };
        }

        // Maintain preloader for at least 3s, then remove preloading classes and hide any JS overlay if present
        let overlayShownAt = this.preloadShownAt || Date.now();
        const ensureMinDurationThenHide = () => {
            const elapsed = Date.now() - overlayShownAt;
            const remaining = Math.max(0, 200 - elapsed);
            // Notify 1s before hide (or immediately if remaining < 1000ms)
            const prehide = Math.max(0, remaining - 1000);
            setTimeout(() => {
                try { window.dispatchEvent(new Event('pageLoaderPrehide')); } catch(e) {}
            }, prehide);

            setTimeout(() => {
                cleanupLoader();
            }, remaining);
        };

        if (document.readyState === 'complete') {
            ensureMinDurationThenHide();
        } else {
            window.addEventListener('load', ensureMinDurationThenHide);
        }
=======
>>>>>>> restore_from_6h
    }

    setActiveNavLink() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.nav-links a');
        
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            // Check if the current path ends with the href or if it's the index page
            if (currentPath.endsWith(href) || (currentPath.endsWith('/') && href === 'index.html')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    setupSidebarQuickNav() {
        // Prevent duplicates
        if (document.getElementById('retractableSidebar') || document.getElementById('sidebarToggle')) return;

        // Build sidebar container
        const overlay = document.createElement('div');
        overlay.id = 'sidebarOverlay';
        overlay.className = 'sidebar-overlay';

        const edgeFill = document.createElement('div');
        edgeFill.id = 'sidebarEdgeFill';
        edgeFill.className = 'sidebar-edge-fill';

        const nav = document.createElement('nav');
        nav.id = 'retractableSidebar';
        nav.className = 'retractable-sidebar';
        nav.innerHTML = [
            '<div class="sidebar-header">',
            '  <h3>Quick Navigation</h3>',
            '  <button class="sidebar-close" id="sidebarClose">×</button>',
            '</div>',
            '<div class="sidebar-content">',
            '  <ul class="sidebar-nav">',
            '    <li><a class="sidebar-link" href="index.html"><i class="fa fa-home"></i><span>Home</span></a></li>',
            '    <li><a class="sidebar-link" href="aboutus.html"><i class="fa fa-info-circle"></i><span>About Us</span></a></li>',
            '    <li><a class="sidebar-link" href="faq.html"><i class="fa fa-question-circle"></i><span>FAQ</span></a></li>',
            '    <li><a class="sidebar-link" href="profile.html"><i class="fa fa-user"></i><span>Profile</span></a></li>',
            '    <li><a class="sidebar-link" href="order-history.html"><i class="fa fa-history"></i><span>Order History</span></a></li>',
            '  </ul>',
            '</div>'
        ].join('');

        const toggle = document.createElement('button');
        toggle.id = 'sidebarToggle';
        toggle.className = 'sidebar-toggle';
        toggle.innerHTML = '<div class="toggle-icon"><i class="fa fa-bars"></i><span class="toggle-text">Quick Navigation</span></div>';

        document.body.appendChild(overlay);
        document.body.appendChild(edgeFill);
        document.body.appendChild(nav);
        document.body.appendChild(toggle);

        // Wire behaviors (same as index)
        const closeBtn = nav.querySelector('#sidebarClose');
        const links = nav.querySelectorAll('.sidebar-link');

        const toggleSidebar = () => {
            nav.classList.toggle('active');
            overlay.classList.toggle('active');
            edgeFill.classList.remove('show');
            document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
        };
        const closeSidebar = () => {
            nav.classList.remove('active');
            overlay.classList.remove('active');
            edgeFill.classList.remove('show');
            document.body.style.overflow = '';
        };

        toggle.addEventListener('click', toggleSidebar);
        closeBtn.addEventListener('click', closeSidebar);
        overlay.addEventListener('click', closeSidebar);

        toggle.addEventListener('mouseenter', () => { if (!nav.classList.contains('active')) edgeFill.classList.add('show'); });
        toggle.addEventListener('mouseleave', () => { if (!nav.classList.contains('active')) edgeFill.classList.remove('show'); });

        links.forEach(a => a.addEventListener('click', closeSidebar));

        // Tease after loader hides, then every 10s
        const startTease = () => {
            if (window.__sidebarTeaseInterval) return;
            setTimeout(() => {
                const run = () => {
                    if (nav.classList.contains('active')) return;
                    edgeFill.classList.add('show');
                    toggle.classList.add('tease');
                    nav.classList.add('tease');
                    setTimeout(() => { toggle.classList.remove('tease'); nav.classList.remove('tease'); edgeFill.classList.remove('show'); }, 500);
                };
                run();
                window.__sidebarTeaseInterval = setInterval(run, 10000);
            }, 800);
        };

        // Prefer page loader events if available
        let started = false;
        const startOnce = () => { if (!started) { started = true; startTease(); } };
        window.addEventListener('pageLoaderHidden', startOnce, { once: true });
        // Fallback timer
        setTimeout(startOnce, 1000);
    }
}

// Initialize navigation
new Navigation();
