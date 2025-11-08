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
    }

    setupPageLoader() {
        // Transition page loader disabled; ensure any residual classes are cleaned up
        try { document.documentElement.classList.remove('preloading'); } catch(e) {}
        try { document.body && document.body.classList.remove('preloading'); } catch(e) {}
        try { window.LoadingUtils && window.LoadingUtils.hide && window.LoadingUtils.hide(); } catch(e) {}
        return;
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
