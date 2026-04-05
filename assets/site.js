let initializeApp;
let getAnalytics;
let logEvent;
let getAuth;
let signInWithPopup;
let GoogleAuthProvider;
let signOut;
let onAuthStateChanged;
let signInWithEmailAndPassword;
let createUserWithEmailAndPassword;
let signInAnonymously;
let setPersistence;
let browserLocalPersistence;
let getFirestore;
let collection;
let addDoc;
let query;
let orderBy;
let onSnapshot;
let serverTimestamp;

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBWaDFwl37xaER6sACMA5F6p1SiRCghzoQ",
    authDomain: "samzykari-22819.firebaseapp.com",
    projectId: "samzykari-22819",
    storageBucket: "samzykari-22819.firebasestorage.app",
    messagingSenderId: "936152324226",
    appId: "1:936152324226:web:d1eba01a43aed3a050fc9b",
    measurementId: "G-SQGNY4Z0MJ"
};

let app = null;
let analytics = null;
let auth = null;
let db = null;
let provider = null;
let reviewsPath = null;
let firebaseInitPromise = null;
let authListenerAttached = false;

async function ensureFirebaseInitialized({ attachListener = false, ensureAnonymousSession = false } = {}) {
    if (!firebaseInitPromise) {
        firebaseInitPromise = (async () => {
            const [appMod, analyticsMod, authMod, firestoreMod] = await Promise.all([
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"),
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js"),
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"),
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js")
            ]);

            initializeApp = appMod.initializeApp;
            getAnalytics = analyticsMod.getAnalytics;
            logEvent = analyticsMod.logEvent;

            getAuth = authMod.getAuth;
            signInWithPopup = authMod.signInWithPopup;
            GoogleAuthProvider = authMod.GoogleAuthProvider;
            signOut = authMod.signOut;
            onAuthStateChanged = authMod.onAuthStateChanged;
            signInWithEmailAndPassword = authMod.signInWithEmailAndPassword;
            createUserWithEmailAndPassword = authMod.createUserWithEmailAndPassword;
            signInAnonymously = authMod.signInAnonymously;
            setPersistence = authMod.setPersistence;
            browserLocalPersistence = authMod.browserLocalPersistence;

            getFirestore = firestoreMod.getFirestore;
            collection = firestoreMod.collection;
            addDoc = firestoreMod.addDoc;
            query = firestoreMod.query;
            orderBy = firestoreMod.orderBy;
            onSnapshot = firestoreMod.onSnapshot;
            serverTimestamp = firestoreMod.serverTimestamp;

            app = initializeApp(firebaseConfig);
            try { analytics = getAnalytics(app); } catch (e) { console.warn("Analytics not initialized"); }
            auth = getAuth(app);
            db = getFirestore(app);
            provider = new GoogleAuthProvider();
            reviewsPath = collection(db, 'reviews');
        })();
    }

    await firebaseInitPromise;

    if (attachListener) {
        attachAuthListener();
    }

    if (ensureAnonymousSession && auth) {
        try {
            await setPersistence(auth, browserLocalPersistence);
            if (!auth.currentUser) {
                await signInAnonymously(auth);
            }
        } catch (e) {
            console.error("Initial auth failed:", e);
        }
    }

    return { app, auth, db };
}

// --- GLOBAL ANALYTICS TRACKER ---
window.trackAnalytics = function(eventName, eventParams = {}) {
    try {
        if (analytics) logEvent(analytics, eventName, eventParams);
    } catch (e) {
        console.log("Analytics disabled or blocked.");
    }
};

// --- CUSTOM ALERT MODAL (replaces browser alert boxes) ---
function ensureAlertModal() {
    let overlay = document.getElementById('app-alert-overlay');
    if (overlay) return overlay;

    if (!document.getElementById('app-alert-style')) {
        const style = document.createElement('style');
        style.id = 'app-alert-style';
        style.textContent = `
            #app-alert-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.68);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }
            #app-alert-overlay.active {
                opacity: 1;
                pointer-events: auto;
            }
            #app-alert-box {
                width: min(92vw, 460px);
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.14);
                background: linear-gradient(145deg, rgba(15, 15, 18, 0.98) 0%, rgba(9, 9, 11, 0.98) 100%);
                box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55);
                transform: translateY(8px) scale(0.98);
                transition: transform 0.2s ease;
                color: #f3f4f6;
                font-family: 'Space Grotesk', sans-serif;
            }
            #app-alert-overlay.active #app-alert-box {
                transform: translateY(0) scale(1);
            }
            #app-alert-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            #app-alert-title {
                font-size: 11px;
                letter-spacing: 0.18em;
                text-transform: uppercase;
                color: #d1d5db;
                margin: 0;
                font-family: 'Oswald', sans-serif;
            }
            #app-alert-message {
                margin: 0;
                padding: 16px;
                color: #e5e7eb;
                font-size: 14px;
                line-height: 1.6;
            }
            #app-alert-actions {
                padding: 0 16px 16px;
                display: flex;
                justify-content: flex-end;
            }
            #app-alert-ok {
                min-width: 92px;
                border: 1px solid rgba(255, 255, 255, 0.18);
                background: #f4f4f5;
                color: #09090b;
                border-radius: 10px;
                padding: 10px 14px;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                cursor: pointer;
                transition: background-color 0.2s ease, transform 0.2s ease;
            }
            #app-alert-ok:hover {
                background: #ffffff;
                transform: translateY(-1px);
            }
        `;
        document.head.appendChild(style);
    }

    overlay = document.createElement('div');
    overlay.id = 'app-alert-overlay';
    overlay.innerHTML = `
        <div id="app-alert-box" role="dialog" aria-modal="true" aria-labelledby="app-alert-title">
            <div id="app-alert-header">
                <h4 id="app-alert-title">System Message</h4>
            </div>
            <p id="app-alert-message"></p>
            <div id="app-alert-actions">
                <button id="app-alert-ok" type="button">OK</button>
            </div>
        </div>
    `;

    const closeAlert = () => overlay.classList.remove('active');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAlert();
    });
    overlay.querySelector('#app-alert-ok').addEventListener('click', closeAlert);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) closeAlert();
    });

    document.body.appendChild(overlay);
    return overlay;
}

window.showAppAlert = function(message, title = 'System Message') {
    const overlay = ensureAlertModal();
    const titleEl = overlay.querySelector('#app-alert-title');
    const msgEl = overlay.querySelector('#app-alert-message');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = String(message || '');
    overlay.classList.add('active');
};

window.alert = function(message) {
    window.showAppAlert(message);
};

const page = document.body.dataset.page || 'home';
const isHomePage = page === 'home';
const isCreationsPage = page === 'creations';
const isInsightsPage = page === 'insights';
const isNorotPage = page === 'norot';
const isIdentityPage = page === 'identity';
const isCommunicatePage = page === 'communicate';

const isMobile = window.innerWidth < 768;
const isTouchDevice = ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const contentSource = document.getElementById('content-source');
const maskedLayer = document.getElementById('masked-layer');
const globalBg = document.getElementById('global-bg');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const hasScrollTrigger = typeof ScrollTrigger !== 'undefined';
if (typeof gsap !== 'undefined' && hasScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
}

if (isMobile) {
    if (maskedLayer) maskedLayer.style.display = 'none';
    const maskSvg = document.querySelector('svg');
    if (maskSvg) maskSvg.style.display = 'none';
}

window.navigateTo = function(targetView) {
    const map = {
        'home-view': '/',
        'creations-showcase-view': '/creations/',
        'project-norot-view': '/creations/norot/',
        'identity-view': '/identity/',
        'communicate-view': '/communicate/'
    };
    const destination = map[targetView] || '/';
    window.location.href = destination;
};

function applyBackground(imageUrl, opacity, bodyBg, bodyColor) {
    if (globalBg) {
        if (imageUrl) {
            globalBg.style.backgroundImage = `url('${imageUrl}')`;
        } else {
            globalBg.style.backgroundImage = 'none';
            globalBg.style.backgroundColor = bodyBg || '#000000';
        }
        globalBg.style.opacity = opacity;
    }
    if (document.body) {
        document.body.style.backgroundColor = bodyBg || '#000000';
        document.body.style.color = bodyColor || '#ffffff';
    }
}

function setupMaskLayer(bgUrl, bgColorFallback) {
    if (!maskedLayer || !contentSource || isMobile) return;
    maskedLayer.innerHTML = '';
    const maskBg = document.createElement('div');
    maskBg.id = 'mask-bg-image';
    maskBg.style.backgroundImage = bgUrl ? `url('${bgUrl}')` : 'none';
    maskBg.style.backgroundColor = bgColorFallback || '#000000';
    maskedLayer.appendChild(maskBg);

    const clonedContent = contentSource.cloneNode(true);
    clonedContent.id = 'cloned-content';
    maskedLayer.appendChild(clonedContent);
}

function clearMaskLayer() {
    if (maskedLayer) maskedLayer.innerHTML = '';
}

function initAnimations() {
    const showcaseItems = document.querySelectorAll('.anim-showcase');
    if (showcaseItems.length) {
        gsap.fromTo(showcaseItems, { x: -50, opacity: 0 }, { x: 0, opacity: 1, duration: 1.2, ease: "expo.out", stagger: 0.15 });
    }

    function animateBase(selector, varsFrom, varsTo) {
        document.querySelectorAll(selector).forEach((el) => {
            gsap.fromTo(el, varsFrom, { ...varsTo, scrollTrigger: { trigger: el, start: "top 85%" } });
        });
    }

    const clonedContent = document.getElementById('cloned-content');
    if (!isMobile && clonedContent) {
        function syncAnimation(selector, varsFrom, varsTo) {
            const baseElems = contentSource ? contentSource.querySelectorAll(selector) : [];
            const cloneElems = clonedContent.querySelectorAll(selector);
            baseElems.forEach((el, index) => {
                if (!cloneElems[index]) return;
                gsap.fromTo([el, cloneElems[index]], varsFrom, { ...varsTo, scrollTrigger: { trigger: el, start: "top 85%" } });
            });
        }
        syncAnimation('.anim-up', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: "expo.out" });
        syncAnimation('.anim-left', { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 1.2, ease: "expo.out" });
        syncAnimation('.anim-right', { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 1.2, ease: "expo.out" });
    } else {
        animateBase('.anim-up', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: "expo.out" });
        animateBase('.anim-left', { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 1, ease: "expo.out" });
        animateBase('.anim-right', { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 1, ease: "expo.out" });
    }
}

function initHomePage() {
    if (!document.querySelector('.home-view')) return;
    
    gsap.to(".home-view .animate-bounce", { opacity: 0, scrollTrigger: { trigger: ".home-view", start: "top top", end: "top -20%", scrub: true }});
    
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const disableLaunchForMotion = sessionStorage.getItem('disableLaunchAnimation') === 'true';
    const hasSeenLaunch = sessionStorage.getItem('hasSeenLaunch') === 'true';

    // Some environments report reduced-motion by default; only skip launch when explicitly disabled.
    if ((prefersReducedMotion && disableLaunchForMotion) || hasSeenLaunch) {
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.style.visibility = 'visible';
        const launchLayer = document.getElementById('launch-layer');
        if (launchLayer) {
            launchLayer.style.display = 'none';
            launchLayer.remove();
        }
        return;
    }

    sessionStorage.setItem('hasSeenLaunch', 'true');
    const mainContentToHide = document.getElementById('main-content');
    if (mainContentToHide) mainContentToHide.style.visibility = 'hidden';
    
    playHomeLaunch();
}

function initNorotPage() {
    if (!document.querySelector('.project-norot-view')) return;
        const isMobileLike = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
        const tl = gsap.timeline({ delay: isMobileLike ? 0.08 : 0.2 });

        tl.fromTo(".norot-nav", { opacity: 0, y: isMobileLike ? -10 : -20 }, { opacity: 1, y: 0, duration: isMobileLike ? 0.35 : 0.5 })
            .fromTo(".norot-hud span", { opacity: 0, y: isMobileLike ? -6 : -10 }, { opacity: 1, y: 0, duration: isMobileLike ? 0.3 : 0.4, stagger: isMobileLike ? 0.06 : 0.1 }, "-=0.2")
            // Blur animation looks cool on desktop but can be expensive on mid-range mobile GPUs.
            .fromTo(".norot-title", isMobileLike ? { x: -36, opacity: 0 } : { x: -80, opacity: 0, filter: "blur(10px)" }, isMobileLike ? { x: 0, opacity: 1, duration: 0.7, ease: "power3.out" } : { x: 0, opacity: 1, filter: "blur(0px)", duration: 1.2, ease: "power3.out" }, "-=0.15")
            .fromTo(".norot-subtitle", { x: isMobileLike ? -16 : -30, opacity: 0 }, { x: 0, opacity: 1, duration: isMobileLike ? 0.55 : 0.8, ease: "power2.out" }, "-=0.5")
            .fromTo(".norot-line", { scaleX: 0, transformOrigin: "left" }, { scaleX: 1, duration: isMobileLike ? 0.65 : 1, ease: "power2.out" }, "-=0.45")
            .fromTo(".norot-box", { opacity: 0, x: isMobileLike ? 32 : 80 }, { opacity: 1, x: 0, duration: isMobileLike ? 0.7 : 1.2, ease: "power3.out" }, "-=0.55")
            .fromTo(".norot-stagger", { opacity: 0, y: isMobileLike ? 16 : 30 }, { opacity: 1, y: 0, duration: isMobileLike ? 0.45 : 0.6, stagger: isMobileLike ? 0.06 : 0.1 }, "-=0.45");
}

function initCreationsShowcase() {
    if (!document.querySelector('.creations-showcase-view')) return;
    if (typeof gsap === 'undefined' || !hasScrollTrigger) return;

    const sections = Array.from(document.querySelectorAll('.creation-section'));
    if (!sections.length) return;

    sections.forEach((section, index) => {
        const media = section.querySelector('.creation-media');
        const copy = section.querySelector('.creation-copy') || section.querySelector('.anim-up');

        if (copy) {
            gsap.fromTo(copy,
                { y: 64, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: section,
                        start: 'top 72%',
                        once: true
                    }
                }
            );
        }

        if (media) {
            gsap.fromTo(media,
                {
                    scale: 1.16,
                    xPercent: index % 2 === 0 ? 8 : -8,
                    opacity: 0.5
                },
                {
                    scale: 1,
                    xPercent: 0,
                    opacity: 1,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: section,
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: 0.85
                    }
                }
            );
        }

        gsap.fromTo(section,
            { opacity: 0.55 },
            {
                opacity: 1,
                ease: 'none',
                scrollTrigger: {
                    trigger: section,
                    start: 'top 80%',
                    end: 'top 35%',
                    scrub: true
                }
            }
        );
    });
}

function initPageTheme() {
    if (isIdentityPage) {
        applyBackground(null, 0, "#f5f5f7", "#1d1d1f");
        if (maskedLayer) maskedLayer.style.display = 'none';
        document.body.style.overflow = 'hidden';
        clearMaskLayer();
        return;
    }

    document.body.style.overflow = '';

    if (isHomePage) {
        if (!isMobile && maskedLayer && contentSource) {
            maskedLayer.style.display = 'block';
            gsap.set("#masked-layer", { "--mask-text": "#ffffff", "--mask-border": "rgba(255, 255, 255, 0.2)" });
            setupMaskLayer(null, "#160202");
        } else {
            if (maskedLayer) maskedLayer.style.display = 'none';
            clearMaskLayer();
        }
        return;
    }

    if (isInsightsPage) {
        applyBackground(null, 0, "#f6f6f3", "#171717");
        if (maskedLayer) maskedLayer.style.display = 'none';
        clearMaskLayer();
        return;
    }

    if (isCreationsPage) {
        applyBackground(null, 0, "#000000", "#ffffff");
        if (maskedLayer) maskedLayer.style.display = 'none';
        clearMaskLayer();
        return;
    }

    if (isNorotPage) {
        applyBackground("/creations/norot/assets/norot-bg.webp", 0.3, "#000000", "#ffffff");
        if (!isMobile && maskedLayer) {
            maskedLayer.style.display = 'block';
            gsap.set("#masked-layer", { "--mask-text": "#ffffff", "--mask-border": "rgba(255, 255, 255, 0.2)" });
            // Use a solid accent backdrop for the mask layer so the blob reveal remains visible.
            setupMaskLayer(null, "#002200");
        }
        return;
    }

    if (isCommunicatePage) {
        applyBackground(null, 0, "#000000", "#ffffff");
        if (!isMobile && maskedLayer) {
            maskedLayer.style.display = 'block';
            gsap.set("#masked-layer", { "--mask-text": "#ffffff", "--mask-border": "rgba(255, 255, 255, 0.2)" });
            setupMaskLayer(null, "#140303");
        }
    }
}

// --- PRE-GENERATE ABOUT LISTS WITH REAL ASSETS ---
const carsData = [
    "1994 Mazda RX-7.webp", "2018 Dodge Challenger SRT Demon.webp", "2018_toyota_86_coupe.webp",
    "2021 audi rs6 avant wagon.webp", "2023-Koenigsegg-Jesko.webp", "2023 Ram 1500 TRX.webp",
    "BMW-F87-M2-Competition.webp", "Jeep-Grand-Cherokee-Trackhawk.webp", "Shelby cobra GT.webp", "Subaru brz.webp"
];
const gamesData = [
    "Assetto Corsa.webp", "Clair Obscur Expedition 33.webp", "Detroit Become Human.webp",
    "Dispatch.webp", "Expeditions A MudRunner Game.webp", "Forza Horizon 5.webp",
    "Hollow Knight Silksong .webp", "minecraft.webp", "Need for Speed Heat.webp", "WRC 10.webp"
];
const animeData = [
    "Initial D_1.webp", "MF Ghost_2.webp", "Chainsaw man_3.webp", "Wangan midnight_4.webp",
    "Cyberpunk Edgerunners.webp", "Dan da Dan.webp", "Frieren Beyond journey's End.webp",
    "Gachiakuta.webp", "Jujutsu Kaisen.webp", "My Dress-up Darling.webp"
];
const seriesData = [
    "Motorheads_1.jpg", "Silicon Valley_2.jpg", "Mr. Robot_3.jpg", "Fast & Furious Spy Racers_4.jpg",
    "Black Mirror.jpg", "Blindspot.jpg", "Love, Death & Robots.jpg", "Modern Family.jpg",
    "The Grand Tour.jpg", "The Originals.jpg"
];
const moviesData = [
    "ford v. ferrari_1.jpg", "Gone inn 60 seconds_2.jpg", "Ready Player One_3.jpg",
    "F1.jpg", "Fast and the Furious.jpg", "ferrari.jpg", "Gran Turismo.jpg",
    "Maintenance Required.jpg", "Rush.jpg", "Transformers series.jpg"
];

function buildListHtml(folder, items, sizeClass) {
    const stackClass = folder === 'cars' ? 'stack' : '';
    return items.map(file => {
        let cleanName = file.replace(/\.(webp|jpg)$/i, '').replace(/_\d+$/, '').replace(/-/g, ' ').replace(/_/g, ' ');
        return `
        <div class="about-list-item ${stackClass}">
            <div class="about-list-thumb ${sizeClass}">
                <img src="assets/images/about/${folder}/${file}" class="w-full h-full object-cover" loading="lazy">
            </div>
            <div class="about-list-title">${cleanName}</div>
        </div>`;
    }).join('');
}

function initAboutLists() {
    const carsItems = document.getElementById('cars-items');
    if (!carsItems) return;
    carsItems.innerHTML = buildListHtml('cars', carsData, 'w-[474px] h-[267px]');
    const gamingItems = document.getElementById('gaming-items');
    const animeItems = document.getElementById('anime-items');
    const seriesItems = document.getElementById('series-items');
    const moviesItems = document.getElementById('movies-items');
    if (gamingItems) gamingItems.innerHTML = buildListHtml('games', gamesData, 'w-[375px] h-[500px]');
    if (animeItems) animeItems.innerHTML = buildListHtml('anime', animeData, 'w-[267px] h-[400px]');
    if (seriesItems) seriesItems.innerHTML = buildListHtml('series', seriesData, 'w-[250px] h-[375px]');
    if (moviesItems) moviesItems.innerHTML = buildListHtml('movies', moviesData, 'w-[250px] h-[375px]');
}

// --- 3D TILT PHYSICS FOR CARDS ---
document.querySelectorAll('.project-card').forEach(card => {
    const glare = card.querySelector('.glare');
    card.addEventListener('mousemove', e => {
        card.classList.remove('tilt-reset');
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -12;
        const rotateY = ((x - centerX) / centerX) * 12;
        card.style.transform = `perspective(1500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`;
        if (glare) { glare.style.left = `${x}px`; glare.style.top = `${y}px`; glare.style.opacity = '1'; }
    });
    card.addEventListener('mouseleave', () => {
        card.classList.add('tilt-reset');
        card.style.transform = `perspective(1500px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        if (glare) glare.style.opacity = '0';
    });
});

// --- HOME LAUNCH EFFECT (Ink Bleed) ---
function playHomeLaunch() {
    const container = document.getElementById('launch-canvas-container');
    const launchLayer = document.getElementById('launch-layer');
    const mainContent = document.getElementById('main-content');
    if (!container || !launchLayer || !mainContent || typeof THREE === 'undefined') {
        if (mainContent) mainContent.style.visibility = 'visible';
        if (launchLayer) launchLayer.remove();
        return;
    }

    const scene = new THREE.Scene();
    
    // Use an orthographic camera for 2D overlays
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform float u_time;
        uniform vec2 u_resolution;
        varying vec2 vUv;

        float rand(vec2 n) { 
            return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); 
        }

        float noise(vec2 n) {
            const vec2 d = vec2(0.0, 1.0);
            vec2 b = floor(n);
            vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
            return mix(
                mix(rand(b), rand(b + d.yx), f.x), 
                mix(rand(b + d.xy), rand(b + d.yy), f.x), 
                f.y
            );
        }

        float fbm(vec2 p) {
            float f = 0.0; 
            float weight = 0.5;
            for(int i = 0; i < 6; i++) {
                f += weight * noise(p);
                p *= 2.0;
                weight *= 0.5;
            }
            return f;
        }

        void main() {
            vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
            float grain = (rand(p + u_time) - 0.5) * 0.05;
            
            // Accelerated time progress to ensure it shoots past the edges
            float timeProgress = u_time * 0.7; 
            float radius = pow(timeProgress, 1.1) * 2.0 - 0.2; 
            
            float n1 = fbm(p * 2.0 - u_time * 0.1);
            float n2 = fbm(p * 12.0 + u_time * 0.05);
            float totalNoise = (n1 * 1.2) + (n2 * 0.4);
            float dist = length(p) - radius + (totalNoise * 1.4);
            vec3 bgColor = vec3(1.0, 1.0, 1.0); 
            vec3 edgeColor = mix(vec3(0.32, 0.04, 0.04), vec3(0.16, 0.02, 0.02), n2); 
            float edgeSoftness = 0.08 + (timeProgress * 0.03); 
            float inkMask = smoothstep(0.0, -edgeSoftness, dist);
            float coreDist = dist + (0.5 * max(0.0, timeProgress - 0.5)); 
            float coreMask = smoothstep(0.0, -0.8, coreDist);
            vec3 inkColor = mix(edgeColor, vec3(0.0), coreMask);
            vec3 finalColor = mix(bgColor, inkColor, inkMask);
            float finalAlpha = 1.0 - coreMask;
            finalColor += grain * finalAlpha;
            gl_FragColor = vec4(finalColor * finalAlpha, finalAlpha);
        }
    `;

    const uniforms = {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
    };

    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: uniforms,
        transparent: true
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const clock = new THREE.Clock();
    let isPlaying = true;

    function animate() {
        if (!isPlaying) return;
        requestAnimationFrame(animate);
        
        const elapsedTime = clock.getElapsedTime();
        uniforms.u_time.value = elapsedTime;
        
        renderer.render(scene, camera);

        // Make content visible as soon as animation starts
        if (elapsedTime > 0.1 && mainContent.style.visibility !== 'visible') {
            mainContent.style.visibility = 'visible';
        }

        if (elapsedTime > 5.5) {
            isPlaying = false;
            
            // Use GSAP for a smooth fade out
            gsap.to(launchLayer, {
                opacity: 0,
                duration: 1,
                ease: "power1.inOut",
                onComplete: () => {
                    launchLayer.remove();
                    renderer.dispose();
                }
            });
        }
    }

    window.addEventListener('resize', () => {
        if (isPlaying) {
            renderer.setSize(window.innerWidth, window.innerHeight);
            uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
        }
    });

    animate();
}


// --- FLUID PHYSICS SYSTEM (Home Page Blob) ---
if (!isMobile) {
    const maskGroup = document.getElementById('mask-group');
    if (maskGroup) {
        const numCircles = 22; const circles = []; const history = [];
        for (let i = 0; i < numCircles; i++) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('fill', 'white'); maskGroup.appendChild(circle); circles.push(circle);
            history.push({ x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0 });
        }
        let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        let lastMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        let velocity = 0; let currentScale = 0; let targetScale = 0; let idleTimer = 0;

        window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
        window.addEventListener('touchmove', e => { if (e.touches && e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; } });

        function animate() {
            let dx = mouse.x - lastMouse.x; let dy = mouse.y - lastMouse.y;
            velocity = Math.sqrt(dx * dx + dy * dy); lastMouse.x = mouse.x; lastMouse.y = mouse.y;

            if (velocity > 0.5) { idleTimer = 0; targetScale = Math.min(1.5, targetScale + 0.05 + (velocity * 0.005)); }
            else { idleTimer++; if (idleTimer > 15) { targetScale = Math.max(0.3, targetScale - 0.02); } }

            currentScale += (targetScale - currentScale) * 0.08;
            history[0].x += (mouse.x - history[0].x) * 0.15; history[0].y += (mouse.y - history[0].y) * 0.15;

            for (let i = 1; i < numCircles; i++) {
                let node = history[i]; let target = history[i-1];
                node.vx += (target.x - node.x) * 0.25; node.vy += (target.y - node.y) * 0.25;
                node.vx *= 0.55; node.vy *= 0.55; node.x += node.vx; node.y += node.vy;
            }

            let time = Date.now() * 0.003; let scrollY = window.scrollY;

            for (let i = 0; i < numCircles; i++) {
                let baseRadius = Math.max(5, 70 - (i * 3.2)); let pulse = Math.sin(time + (i * 0.5)) * 10;
                let finalRadius = Math.max(0, (baseRadius + pulse) * currentScale);
                let squirmX = Math.sin(time * 1.4 + i) * 12 * currentScale; let squirmY = Math.cos(time * 1.1 + i * 0.8) * 12 * currentScale;
                circles[i].setAttribute('cx', history[i].x + squirmX); circles[i].setAttribute('cy', history[i].y + squirmY + scrollY); circles[i].setAttribute('r', finalRadius);
            }
            requestAnimationFrame(animate);
        }
        animate();
    }
}

// ==========================================
// 3D ABOUT ME PAGE ENGINE (Three.js - 9 Waypoints)
// ==========================================
let about3DInitialized = false;
let aboutUiFallback = false;
window.about3DObjects = [];
window.aboutScenePositions = [];

function createVideoElement(src) {
    const video = document.createElement('video');
    video.src = src;
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.play().catch(e => console.log("Autoplay prevented:", e));
    return video;
}

function enableAboutUiFallback() {
    if (aboutUiFallback) return;
    aboutUiFallback = true;
    document.body.style.overflow = '';

    const ui = document.getElementById('about-ui-layer');
    if (ui) {
        ui.style.opacity = '1';
        ui.classList.add('about-ui-active');
    }

    const sections = [
        document.getElementById('about-sec1'), document.getElementById('about-sec2'),
        document.getElementById('about-sec3'), document.getElementById('about-sec4'),
        document.getElementById('about-sec5'), document.getElementById('about-sec6'),
        document.getElementById('about-sec7'), document.getElementById('about-sec8'),
        document.getElementById('about-sec9')
    ];
    const progressText = document.getElementById('about-progress-text');

    const activateSectionByIndex = (index) => {
        sections.forEach((sec, i) => {
            if (!sec) return;
            if (i === index) {
                sec.classList.add('active');
                sec.classList.remove('shifted-up');
            } else if (index === 8 && i === 7) {
                sec.classList.add('active');
                sec.classList.add('shifted-up');
            } else {
                sec.classList.remove('active');
                sec.classList.remove('shifted-up');
            }
        });
        if (progressText) progressText.innerText = `${Math.min(index + 1, 8)} → 8`;
    };

    const updateFallbackScroll = () => {
        const h = document.documentElement;
        const b = document.body;
        const scrollTop = h.scrollTop || b.scrollTop;
        const scrollHeight = (h.scrollHeight || b.scrollHeight) - h.clientHeight;
        const percent = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
        const index = Math.round(percent * 8);
        activateSectionByIndex(Math.max(0, Math.min(8, index)));
    };

    activateSectionByIndex(0);
    updateFallbackScroll();
    window.addEventListener('scroll', updateFallbackScroll, { passive: true });
}

function initAbout3D() {
    const canvas = document.getElementById('about-webgl-canvas');
    if(!canvas) return false;
    try {

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f5f5f7');
    scene.fog = new THREE.FogExp2('#f5f5f7', 0.015);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    const initialWidth = canvas.clientWidth || window.innerWidth;
    const initialHeight = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initialWidth, initialHeight, false);
    camera.aspect = initialWidth / initialHeight;
    camera.updateProjectionMatrix();
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMappingExposure = 1.0;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    const textureLoader = new THREE.TextureLoader();
    const applySRGB = (tex) => {
        if (tex) tex.encoding = THREE.sRGBEncoding;
        return tex;
    };

    // Textures mapped from provided user specs
    const tex1 = applySRGB(textureLoader.load('assets/images/about/page 1.webp'));
    const vid2 = applySRGB(new THREE.VideoTexture(createVideoElement('assets/images/about/page 2.webm')));
    const tex3_1 = applySRGB(textureLoader.load('assets/images/about/page 3_1.webp'));
    const tex3_2 = applySRGB(textureLoader.load('assets/images/about/page 3_2.webp'));
    const tex3_3 = applySRGB(textureLoader.load('assets/images/about/page 3_3.webp'));
    const vid4 = applySRGB(new THREE.VideoTexture(createVideoElement('assets/images/about/page 4.webm')));
    const vid5 = applySRGB(new THREE.VideoTexture(createVideoElement('assets/images/about/page 5.webm')));
    const vid7 = applySRGB(new THREE.VideoTexture(createVideoElement('assets/images/about/page 7.webm')));
    const vid8 = applySRGB(new THREE.VideoTexture(createVideoElement('assets/images/about/page 8.webm')));

    const existingDebugReadout = document.getElementById('about-debug-readout');
    if (existingDebugReadout) existingDebugReadout.remove();

//    const floorGeo = new THREE.PlaneGeometry(200, 200);
//    const floorMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e5, roughness: 0.15, metalness: 0.1 });
//    const floor = new THREE.Mesh(floorGeo, floorMat);
//    floor.rotation.x = -Math.PI / 2; floor.position.y = -2;
//    scene.add(floor);

      const particlesGeo = new THREE.BufferGeometry();
      const particlesCount = 2000;
      const posArray = new Float32Array(particlesCount * 3);
      for(let i = 0; i < particlesCount * 3; i++) {
          posArray[i] = (Math.random() - 0.5) * 100;
          if(i % 3 === 1) posArray[i] = Math.random() * 350 - 300; // Y-axis covers from +50 down to -300
      }
      particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      const particlesMat = new THREE.PointsMaterial({ size: 0.08, color: 0x888888, transparent: true, opacity: 0.4, blending: THREE.NormalBlending });
      const particleMesh = new THREE.Points(particlesGeo, particlesMat);
      scene.add(particleMesh);

    const borderMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide });
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15, side: THREE.DoubleSide });

    const aboutMediaScale = 120;
    const getTextSectionWidth = (index) => {
        const sec = document.getElementById('about-sec' + (index + 1));
        if (!sec || !sec.classList.contains('active')) return 0;
        const style = window.getComputedStyle(sec);
        if (style.opacity === '0' || style.visibility === 'hidden') return 0;
        const rect = sec.getBoundingClientRect();
        return rect.width || 0;
    };

    const getListPanelWidth = (index) => {
        const obj = window.about3DObjects ? window.about3DObjects[index] : null;
        if (!obj || !obj.listOpen || !obj.listPanelId) return 0;
        const panel = document.getElementById(obj.listPanelId);
        if (!panel || !panel.classList.contains('active-list')) return 0;
        const rect = panel.getBoundingClientRect();
        return rect.width || 0;
    };

    const getFitConfig = (index) => {
        if (index === 5) return null;
        const isSmall = window.innerWidth <= 768;
        const occupied = Math.max(getTextSectionWidth(index), getListPanelWidth(index));
        const padding = isSmall ? 12 : 16;
        const fallback = isSmall ? 16 : 320;
        const textSafePx = Math.max(fallback, occupied + padding);
        const maxW = Math.max(0.7, Math.min(0.99, (window.innerWidth - textSafePx) / window.innerWidth));
        const maxH = isSmall ? 0.8 : 0.95;
        return { maxW, maxH };
    };

    const fitGroupToCamera = (group, camPos, maxW, maxH) => {
        if (!group || !camPos || !maxW || !maxH) return null;
        const previousScale = group.scale.clone();
        group.scale.set(1, 1, 1);
        group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(group);
        const size = new THREE.Vector3();
        box.getSize(size);
        group.scale.copy(previousScale);
        group.updateMatrixWorld(true);

        if (size.x <= 0 || size.y <= 0) return null;

        const distance = camPos.distanceTo(group.position);
        const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
        const viewWidth = viewHeight * camera.aspect;
        const scale = Math.min((viewWidth * maxW) / size.x, (viewHeight * maxH) / size.y);
        group.scale.setScalar(scale);
        return scale;
    };

    const applyGroupFit = (group, index) => {
        const cfg = getFitConfig(index);
        if (!cfg) return;
        fitGroupToCamera(group, waypoints[index].camPos, cfg.maxW, cfg.maxH);
        const obj = window.about3DObjects ? window.about3DObjects[index] : null;
        if (obj && obj.mesh === group) {
            obj.baseScale = group.scale.clone();
        }
    };

    window.aboutApplyGroupFit = (index) => {
        const obj = window.about3DObjects ? window.about3DObjects[index] : null;
        if (obj && obj.mesh) applyGroupFit(obj.mesh, index);
    };

    const bindTextureSizeToPlane = (texture, mesh, fallbackWidth, fallbackHeight) => {
        if (!mesh) return;

        const applyDecodedSize = () => {
            const img = texture && texture.image ? texture.image : null;
            const mediaW = img && (img.videoWidth || img.width) ? (img.videoWidth || img.width) : 0;
            const mediaH = img && (img.videoHeight || img.height) ? (img.videoHeight || img.height) : 0;

            if (mediaW > 0 && mediaH > 0) {
                mesh.geometry.dispose();
                mesh.geometry = new THREE.PlaneGeometry(mediaW / aboutMediaScale, mediaH / aboutMediaScale);
            } else if (fallbackWidth && fallbackHeight && mesh.geometry) {
                mesh.geometry.dispose();
                mesh.geometry = new THREE.PlaneGeometry(fallbackWidth, fallbackHeight);
            }

            let node = mesh;
            while (node) {
                if (node.userData && typeof node.userData.onSizeUpdate === 'function') {
                    node.userData.onSizeUpdate();
                    break;
                }
                node = node.parent;
            }
        };

        applyDecodedSize();

        const img = texture && texture.image ? texture.image : null;
        if (img && img.tagName === 'VIDEO') {
            img.addEventListener('loadedmetadata', applyDecodedSize, { once: true });
        } else if (img && img.complete === false) {
            img.addEventListener('load', applyDecodedSize, { once: true });
        }
    };

    function createImageGroup(texture, width, height, fitIndex) {
        const group = new THREE.Group();
        if (typeof fitIndex === 'number') {
            group.userData.fitIndex = fitIndex;
            group.userData.aboutIndex = fitIndex;
            group.userData.onSizeUpdate = () => applyGroupFit(group, fitIndex);
        }
        // Use unlit material and no overlays to keep colors clean
        const img = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
        img.position.set(0, 1, 0);
        if (texture) {
            texture.repeat.set(1, 1);
            texture.offset.set(0, 0);
            texture.needsUpdate = true;
        }

        bindTextureSizeToPlane(texture, img, width, height);

        group.add(img);
        return group;
    }

      const gapY = -35; // Distinct vertical stages
      const distZ = -14; 
      const camZ = 0; 
      
      const scenePositions = [
          { x: 0, y: gapY * 0, z: distZ },      
          { x: 0, y: gapY * 1, z: distZ },      
          { x: 0, y: gapY * 2, z: distZ },      
          { x: 0, y: gapY * 3, z: distZ },      
          { x: 0, y: gapY * 4, z: distZ },      
          { x: 0, y: gapY * 5, z: distZ },      
          { x: 0, y: gapY * 6, z: distZ },      
          { x: 0, y: gapY * 7, z: distZ }       
      ];
      window.aboutScenePositions = scenePositions;

      const waypoints = [
          { camPos: new THREE.Vector3(0, scenePositions[0].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[1].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[2].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[3].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[4].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[5].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[6].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[7].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[7].y - 15, camZ) } // 9: Terminal 
      ];

      for(let i = 0; i < 8; i++) {
          waypoints[i].lookAt = new THREE.Vector3(scenePositions[i].x, scenePositions[i].y, scenePositions[i].z);

          if (i === 5) {
              window.about3DObjects.push(null);
              continue; 
          }

          let group;
          if (i === 0) group = createImageGroup(tex1, 16, 9, i); 
          else if (i === 1) group = createImageGroup(vid2, 16, 9, i); 
          else if (i === 2) {
              group = new THREE.Group();
              group.userData.fitIndex = i;
              group.userData.aboutIndex = i;
              group.userData.onSizeUpdate = () => applyGroupFit(group, i);
              const img1 = createImageGroup(tex3_1, 9, 5.06); img1.position.set(-7.5, 1.5, 0.5); img1.rotation.z = 0.05; img1.rotation.y = 0.15;
              const img2 = createImageGroup(tex3_2, 9, 5.06); img2.position.set(0, 0, 1.5); 
              const img3 = createImageGroup(tex3_3, 9, 5.06); img3.position.set(7.5, -1.5, 0.5); img3.rotation.z = -0.05; img3.rotation.y = -0.15;
              group.add(img1, img2, img3);
          }
          else if (i === 3) group = createImageGroup(vid4, 16, 6.7, i); 
          else if (i === 4) group = createImageGroup(vid5, 16, 9, i); 
          else if (i === 6) group = createImageGroup(vid7, 16, 9, i); 
          else if (i === 7) group = createImageGroup(vid8, 9, 10.5, i); 

          if (group) {
              group.position.set(scenePositions[i].x, scenePositions[i].y, scenePositions[i].z);
              
              let basex = 0; let basey = 0;
              if (i !== 2) {
                  basey = (Math.random() - 0.5) * 0.12;
                  basex = (Math.random() - 0.5) * 0.08;
                  group.rotation.y = basey;
                  group.rotation.x = basex;
              }
              
              applyGroupFit(group, i);
              scene.add(group);
              window.about3DObjects.push({
                  mesh: group,
                  baseY: scenePositions[i].y,
                  baseScale: group.scale.clone(),
                  baseRotX: basex,
                  baseRotY: basey,
                  floatSpeed: 0.6 + Math.random() * 0.5,
                  floatAmplitude: 0.4 + Math.random() * 0.4,
                  floatOffset: i * 2.5
              });
          }
      }

      waypoints[8].lookAt = new THREE.Vector3(scenePositions[7].x, scenePositions[7].y - 5, scenePositions[7].z);

      camera.position.copy(waypoints[0].camPos);
      camera.lookAt(waypoints[0].lookAt);
    let scrollPercent = 0; let targetScrollPercent = 0;
    let mouseX = 0; let mouseY = 0; let targetMouseX = 0; let targetMouseY = 0;
    const numSegments = waypoints.length - 1;
    let lastWheelTime = 0;
    let lastActiveSectionIndex = -1;
    let targetIndex = 0;
    let scrollLocked = false;
    window.aboutUnlockScroll = () => {
        scrollLocked = false;
        lastWheelTime = 0;
    };

    window.addEventListener('mousemove', e => {
        targetMouseX = (e.clientX - window.innerWidth/2) * 0.001;
        targetMouseY = (e.clientY - window.innerHeight/2) * 0.001;
    });

    function handleWheelScroll(e) {
        if (!isIdentityPage) return;
        const ui = document.getElementById('about-ui-layer');
        if (!ui || !ui.classList.contains('about-ui-active')) return;
        const now = performance.now();
        if (scrollLocked && now - lastWheelTime < 60) return;
        const activePanel = document.querySelector('.about-list-panel.active-list');
        if (activePanel && document.activeElement && document.activeElement.closest && document.activeElement.closest('.about-list-panel.active-list')) return;
        if (activePanel && e.target && e.target.closest && e.target.closest('.about-list-panel.active-list')) return;
        e.preventDefault();
        if (now - lastWheelTime < 60) return;
        lastWheelTime = now;
        const direction = e.deltaY > 0 ? 1 : -1;
        targetIndex = Math.max(0, Math.min(numSegments, targetIndex + direction));
        targetScrollPercent = targetIndex / numSegments;
        scrollLocked = true;
    }

    window.addEventListener('wheel', handleWheelScroll, { passive: false });
    const syncRendererSize = () => {
        const width = canvas.clientWidth || window.innerWidth;
        const height = canvas.clientHeight || window.innerHeight;
        const pixelRatio = renderer.getPixelRatio();
        const targetWidth = Math.floor(width * pixelRatio);
        const targetHeight = Math.floor(height * pixelRatio);

        if (renderer.domElement.width !== targetWidth || renderer.domElement.height !== targetHeight) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
        }
    };

    window.addEventListener('resize', () => {
        syncRendererSize();
        if (window.about3DObjects) {
            window.about3DObjects.forEach((obj, index) => {
                if (obj && obj.mesh) applyGroupFit(obj.mesh, index);
            });
        }
    });

    const sections = [
        document.getElementById('about-sec1'), document.getElementById('about-sec2'),
        document.getElementById('about-sec3'), document.getElementById('about-sec4'),
        document.getElementById('about-sec5'), document.getElementById('about-sec6'),
        document.getElementById('about-sec7'), document.getElementById('about-sec8'),
        document.getElementById('about-sec9') // Feedback Terminal
    ];
    const progressText = document.getElementById('about-progress-text');
    const currentCamPos = new THREE.Vector3().copy(waypoints[0].camPos);
    const currentLookAt = new THREE.Vector3().copy(waypoints[0].lookAt);

    function animate() {
        requestAnimationFrame(animate);
        if (!isIdentityPage) return;
        syncRendererSize();
        const scrollDelta = targetScrollPercent - scrollPercent;
        if (Math.abs(scrollDelta) < 0.0004) {
            scrollPercent = targetScrollPercent;
            scrollLocked = false;
        } else {
            scrollPercent += scrollDelta * 0.06;
        }

        const scaledScroll = scrollPercent * numSegments;
        const segmentIndex = Math.min(Math.floor(scaledScroll), numSegments - 1);
        const segmentProgress = scaledScroll - segmentIndex;

        const wpStart = waypoints[segmentIndex];
        const wpEnd = waypoints[segmentIndex + 1];

        currentCamPos.lerpVectors(wpStart.camPos, wpEnd.camPos, segmentProgress);
        currentLookAt.lerpVectors(wpStart.lookAt, wpEnd.lookAt, segmentProgress);

        mouseX += (targetMouseX - mouseX) * 0.03;
        mouseY += (targetMouseY - mouseY) * 0.03;

        camera.position.x = currentCamPos.x + (mouseX * 1.0);
        camera.position.y = currentCamPos.y + (mouseY * 2.0);
        camera.position.z = currentCamPos.z;
        camera.lookAt(currentLookAt.x - (mouseX * 0.8), currentLookAt.y - (mouseY * 1.6), currentLookAt.z);

        const time = Date.now() * 0.001;
        window.about3DObjects.forEach(obj => {
            if (!obj || !obj.mesh) return;
            if (obj.baseY !== undefined) {
                obj.mesh.position.y = obj.baseY + Math.sin(time * obj.floatSpeed + obj.floatOffset) * obj.floatAmplitude;
                if (obj.baseRotY !== undefined) {
                    obj.mesh.rotation.y = obj.baseRotY + Math.sin(time * 0.4 + obj.floatOffset) * 0.05;
                    obj.mesh.rotation.x = obj.baseRotX + Math.cos(time * 0.3 + obj.floatOffset) * 0.05;
                }
            }
        });

        if (typeof particleMesh !== 'undefined' && particleMesh) {
            particleMesh.rotation.y += 0.0005;
        }

        let activeSectionIndex = Math.round(scrollPercent * numSegments);
        targetIndex = Math.max(0, Math.min(numSegments, activeSectionIndex));
        if (activeSectionIndex !== lastActiveSectionIndex) {
            closeAllAboutLists();
            lastActiveSectionIndex = activeSectionIndex;
        }

        sections.forEach((sec, index) => {
            if(!sec) return;
            if (index === activeSectionIndex) {
                if(!sec.classList.contains('active')) sec.classList.add('active');
                sec.classList.remove('shifted-up');
            } else if (activeSectionIndex === 8 && index === 7) {
                if(!sec.classList.contains('active')) sec.classList.add('active');
                if(!sec.classList.contains('shifted-up')) sec.classList.add('shifted-up');
            } else {
                if(sec.classList.contains('active')) sec.classList.remove('active');
                sec.classList.remove('shifted-up');
            }
        });

        if (progressText) progressText.innerText = `${Math.min(activeSectionIndex + 1, 9)} → 9`;
        renderer.render(scene, camera);
    }
    animate();
    about3DInitialized = true;
    return true;
    } catch (err) {
        console.warn('About 3D init failed, falling back to UI-only mode:', err);
        return false;
    }
}

window.renderAboutGatekeeper = function() {
    const content = document.getElementById('gatekeeper-content');
    if (!content) return;

    if (currentUser) {
        content.innerHTML = `
            <h2 class="font-oswald text-4xl md:text-5xl mb-4 text-[var(--about-accent)] uppercase tracking-widest">Viewer Discretion</h2>
            <p class="font-space text-sm md:text-base text-[var(--about-muted)] mb-8 leading-relaxed font-medium tracking-widest">
                A lot of personal stuff ahead.<br>For the best immersive experience, please use a device with a large screen.
            </p>
            <button onclick="startAboutExperience()" class="bg-[#1d1d1f] text-white font-oswald text-sm tracking-widest uppercase px-8 py-3 rounded-full hover:bg-[var(--about-accent)] transition-colors shadow-xl">Proceed to Experience</button>
            <button onclick="navigateTo('home-view')" class="block mx-auto mt-6 font-space text-xs text-[var(--about-muted)] hover:text-[#1d1d1f] uppercase tracking-widest border-b border-transparent hover:border-[#1d1d1f] transition-colors">Return to Safety</button>
        `;
    } else {
        content.innerHTML = `
            <h2 class="font-oswald text-4xl md:text-5xl mb-4 text-[#1d1d1f] uppercase tracking-widest">Access Restricted</h2>
            <p class="font-space text-sm md:text-base text-[var(--about-muted)] mb-8 leading-relaxed font-medium tracking-widest">
                This section contains highly personal logs and archives. Authentication is required to proceed.
            </p>
            <button onclick="openAuthModal('light')" class="bg-[var(--about-accent)] text-white font-oswald text-sm tracking-widest uppercase px-8 py-3 rounded-full hover:opacity-80 transition-opacity shadow-xl">Initiate Connection</button>
            <button onclick="navigateTo('home-view')" class="block mx-auto mt-6 font-space text-xs text-[var(--about-muted)] hover:text-[#1d1d1f] uppercase tracking-widest border-b border-transparent hover:border-[#1d1d1f] transition-colors">Return Home</button>
        `;
    }
};

window.startAboutExperience = function() {
    document.body.style.overflow = 'hidden';
    const gatekeeper = document.getElementById('about-gatekeeper');
    if (gatekeeper) gatekeeper.style.pointerEvents = 'none';
    gsap.to(gatekeeper, { opacity: 0, duration: 0.5, onComplete: () => {
        if (gatekeeper) gatekeeper.style.display = 'none';

        const canvas = document.getElementById('about-webgl-canvas');
        const ui = document.getElementById('about-ui-layer');
        if (canvas) canvas.style.opacity = '1';
        if (ui) {
            ui.style.opacity = '1';
            ui.classList.add('about-ui-active');
        }

        closeAllAboutLists();

        if (!about3DInitialized && !isMobile) {
            const ok = initAbout3D();
            if (!ok) enableAboutUiFallback();
        } else if (isMobile) {
            enableAboutUiFallback();
        }
    }});
    setTimeout(() => {
        if (gatekeeper && gatekeeper.style.display !== 'none') {
            gatekeeper.style.display = 'none';
        }
    }, 800);
};

// ==========================================
// TEXT READ MORE AND LIST TOGGLES
// ==========================================
// ==========================================
// TEXT READ MORE AND LIST TOGGLES
// ==========================================
// ==========================================
// TEXT READ MORE AND LIST TOGGLES
// ==========================================
window.toggleReadMore = function(evt, secId, objIndex) {
    const textEl = document.getElementById('text-' + secId);
    if (!textEl) return;
    const isExpanded = textEl.classList.contains('line-clamp-none');
    const btn = evt && evt.currentTarget ? evt.currentTarget : null;
    const groupObj = window.about3DObjects ? window.about3DObjects[objIndex] : null;
    const scenePos = window.aboutScenePositions ? window.aboutScenePositions[objIndex] : null;
    const baseScale = groupObj && groupObj.baseScale ? groupObj.baseScale : { x: 1, y: 1, z: 1 };
    const baseX = typeof baseScale === 'number' ? baseScale : baseScale.x;
    const baseY = typeof baseScale === 'number' ? baseScale : baseScale.y;
    const baseZ = typeof baseScale === 'number' ? baseScale : baseScale.z;

    if (isExpanded) {
        textEl.classList.remove('line-clamp-none');
        textEl.classList.add('line-clamp-4', 'md:line-clamp-5');
        if (btn) btn.innerText = 'See More';
        if (groupObj) groupObj.textExpanded = false;
        if (groupObj && scenePos) {
            gsap.to(groupObj.mesh.position, { x: scenePos.x, duration: 0.8, ease: "power2.out" });
            gsap.to(groupObj.mesh.scale, { x: baseX, y: baseY, z: baseZ, duration: 0.6, ease: "power2.out" });
        }
    } else {
        textEl.classList.remove('line-clamp-4', 'md:line-clamp-5');
        textEl.classList.add('line-clamp-none');
        if (btn) btn.innerText = 'See Less';
        if (groupObj) groupObj.textExpanded = true;
        if (groupObj && scenePos) {
            // Even indexes are left-aligned by CSS (actually odd, because 1-based CSS ids sec1, sec3, etc are left aligned)
            // objIndex: 0(sec1-left), 1(sec2-right), 2(sec3-left), 3(sec4-right), 4(sec5-left), 5(none), 6(sec7-left), 7(sec8-right)
            const isLeftAligned = [0, 2, 4, 6].includes(objIndex);
            // Move mesh away from the text which expands downwards. If text is left, move mesh right (positive X)
            const shiftAmount = window.innerWidth < 768 ? 0 : (isLeftAligned ? 7 : -7); 
            gsap.to(groupObj.mesh.position, { x: scenePos.x + shiftAmount, duration: 0.8, ease: "power2.out" });
        }
    }

    if (typeof window.aboutApplyGroupFit === 'function') {
        requestAnimationFrame(() => window.aboutApplyGroupFit(objIndex));
        setTimeout(() => window.aboutApplyGroupFit(objIndex), 180);
    }
};

function closeAllAboutLists() {
    const overlays = document.getElementById('about-list-overlays');
    if (overlays) overlays.classList.remove('about-list-overlays-active');
    document.querySelectorAll('#about-list-overlays > div').forEach(list => {
        list.classList.remove('active-list');
    });
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.about-list-panel')) {
        document.activeElement.blur();
    }
    if (typeof window.aboutUnlockScroll === 'function') window.aboutUnlockScroll();

    if (window.about3DObjects && window.aboutScenePositions) {
        window.about3DObjects.forEach((obj, idx) => {
            if (!obj || !obj.mesh) return;
            const scenePos = window.aboutScenePositions[idx];
            if (obj.listOpen) {
                obj.listOpen = false;
                obj.listPanelId = null;
                if (scenePos) {
                    gsap.to(obj.mesh.position, { x: scenePos.x, duration: 0.8, ease: "power2.out" });
                }
                const baseScale = obj.baseScale || { x: 1, y: 1, z: 1 };
                const baseX = typeof baseScale === 'number' ? baseScale : baseScale.x;
                const baseY = typeof baseScale === 'number' ? baseScale : baseScale.y;
                const baseZ = typeof baseScale === 'number' ? baseScale : baseScale.z;
                gsap.to(obj.mesh.scale, { x: baseX, y: baseY, z: baseZ, duration: 0.6, ease: "power2.out" });
                
                const secId = 'about-sec' + (idx + 1);
                const textSec = document.getElementById(secId);
                if (textSec) {
                    textSec.style.opacity = '1';
                    textSec.style.pointerEvents = 'auto';
                }
            }
        });
    }
}

window.toggleListView = function(evt, category, objIndex) {
    const secId = 'about-sec' + (objIndex + 1);
    const textSec = document.getElementById(secId);
    const listSec = document.getElementById('about-list-' + category);
    if (!textSec || !listSec) return;
    const groupObj = window.about3DObjects ? window.about3DObjects[objIndex] : null;
    const scenePos = window.aboutScenePositions ? window.aboutScenePositions[objIndex] : null;
    const isListOpen = listSec.classList.contains('active-list');

    if (isListOpen) {
        closeAllAboutLists();
    } else {
        closeAllAboutLists();
        if (typeof window.aboutUnlockScroll === 'function') window.aboutUnlockScroll();
        textSec.style.opacity = '0';
        textSec.style.pointerEvents = 'none';

        const overlays = document.getElementById('about-list-overlays');
        if (overlays) overlays.classList.add('about-list-overlays-active');
        listSec.style.right = '0'; // default panel to right
        listSec.style.left = 'auto';
        listSec.classList.add('active-list');

        if (groupObj) {
            groupObj.listOpen = true;
            groupObj.listPanelId = listSec.id;
        }

        if (category === 'watching') {
            const tab = window.currentWatchingTab || 'anime';
            window.setWatchingTab(tab);
        }

        if (groupObj && scenePos) {
            // Panel opens from the right (usually). Move 3D object to the left
            const shiftAmount = window.innerWidth < 768 ? 0 : -8; 
            gsap.to(groupObj.mesh.position, { x: scenePos.x + shiftAmount, duration: 0.8, ease: "power2.out" });
        }
    }

    if (typeof window.aboutApplyGroupFit === 'function') {
        requestAnimationFrame(() => window.aboutApplyGroupFit(objIndex));
        setTimeout(() => window.aboutApplyGroupFit(objIndex), 180);
    }
};

window.currentWatchingTab = 'anime';

window.setWatchingTab = function(tabName) {
    window.currentWatchingTab = tabName;
    const panel = document.getElementById('about-list-watching');
    if (!panel) return;

    panel.querySelectorAll('.about-list-tab').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    panel.querySelectorAll('[data-watch-section]').forEach(section => {
        const isActive = section.getAttribute('data-watch-section') === tabName;
        section.style.display = isActive ? 'block' : 'none';
    });
};

// ==========================================
// REAL FIREBASE BACKEND INTEGRATION
// ==========================================
let currentUser = null;
let systemLogs = [];
const shouldUseFeedbackStream = isNorotPage || isIdentityPage || isCommunicatePage;
let unsubscribeSnapshot = null;

function attachAuthListener() {
    if (authListenerAttached || !auth || !onAuthStateChanged) return;
    authListenerAttached = true;

    onAuthStateChanged(auth, (user) => {
        if (user && !user.isAnonymous) {
            currentUser = {
                name: user.displayName || (user.email ? user.email.split('@')[0] : "Agent"),
                uid: user.uid,
                photoURL: user.photoURL,
                email: user.email
            };
        } else {
            currentUser = null;
        }

        if (shouldUseFeedbackStream && !unsubscribeSnapshot && reviewsPath && query && orderBy && onSnapshot) {
            unsubscribeSnapshot = onSnapshot(query(reviewsPath, orderBy("timestamp", "desc")), (snapshot) => {
                systemLogs = [];
                snapshot.forEach((doc) => { systemLogs.push({ id: doc.id, ...doc.data() }); });
                renderFeedbackUI();
            }, (error) => {
                console.error("Snapshot error:", error);
            });
        }

        updateGlobalAuthUI(currentUser);
        renderFeedbackUI();

        if (isIdentityPage) {
            const gatekeeper = document.getElementById('about-gatekeeper');
            if (gatekeeper && gatekeeper.style.display !== 'none') {
                renderAboutGatekeeper();
            }
        }
    });
}

function timeAgo(dateInput) {
    if (!dateInput) return "Just now";
    const date = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
}

// Handle Global UI Updates (Button & Modal toggles)
function updateGlobalAuthUI(user) {
    const globalNode = document.getElementById('global-auth-node');
    if (!globalNode) return;
    if (user) {
        // Fetch actual photo or generate retro fallback
        const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email || 'User')}&background=0D0D0D&color=00FF66&bold=true`;

        globalNode.innerHTML = `
            <div class="group relative cursor-pointer flex items-center gap-3 bg-black/40 backdrop-blur-md border border-zinc-800 p-2 pr-4 rounded-full hover:border-zinc-500 transition-colors shadow-lg" onclick="toggleUserMenu()">
                <img src="${avatarUrl}" alt="Profile" class="w-8 h-8 rounded-full border border-zinc-700 object-cover bg-zinc-900">
                <span class="font-space text-xs font-bold text-white uppercase hidden md:inline-block">${user.name}</span>

                <!-- Dropdown Menu -->
                <div id="user-dropdown" class="absolute top-full right-0 mt-2 w-48 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl opacity-0 pointer-events-none transform -translate-y-2 transition-all duration-200 overflow-hidden">
                    <button onclick="firebaseLogout()" class="w-full text-left px-4 py-3 text-red-500 hover:bg-zinc-900 font-retro text-xs tracking-widest uppercase transition-colors">Disconnect</button>
                </div>
            </div>
        `;
    } else {
        globalNode.innerHTML = `
            <button onclick="openAuthModal()" class="bg-white/90 backdrop-blur-sm text-black hover:bg-white font-space font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-full transition-all shadow-lg hover:scale-105 border border-white/20">
                Initiate Connection
            </button>
        `;
    }
}

window.toggleUserMenu = function() {
    const dropdown = document.getElementById('user-dropdown');
    if(dropdown) {
        if(dropdown.classList.contains('opacity-0')) {
            dropdown.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
            dropdown.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
        } else {
            dropdown.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            dropdown.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
        }
    }
};

window.openAuthModal = function(theme) {
    // Lazy-load Firebase/Auth when the user explicitly opens authentication UI.
    ensureFirebaseInitialized({ attachListener: true }).catch((e) => {
        console.warn('Firebase warmup failed:', e);
    });

    const modal = document.getElementById('auth-modal');
    const content = document.getElementById('auth-modal-content');
    if (!modal || !content) return;
    if (theme) {
        modal.setAttribute('data-theme', theme);
    } else {
        modal.removeAttribute('data-theme');
    }
    modal.classList.remove('hidden');
    // Trigger reflow for animation
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    content.classList.remove('translate-y-4');
};

window.closeAuthModal = function() {
    const modal = document.getElementById('auth-modal');
    const content = document.getElementById('auth-modal-content');
    if (!modal || !content) return;
    modal.classList.add('opacity-0');
    content.classList.add('translate-y-4');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.removeAttribute('data-theme');
    }, 300);
};

// --- CLICK DEBUG OVERLAY ---
let clickDebugEnabled = false;
let clickDebugHandler = null;

function ensureClickDebugOverlay() {
    let overlay = document.getElementById('click-debug-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'click-debug-overlay';
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.zIndex = '9999';
        overlay.style.pointerEvents = 'none';
        document.body.appendChild(overlay);
    }
    return overlay;
}

function describeElement(el) {
    if (!el) return 'none';
    const parts = [el.tagName.toLowerCase()];
    if (el.id) parts.push('#' + el.id);
    if (el.classList && el.classList.length) parts.push('.' + Array.from(el.classList).slice(0, 4).join('.'));
    return parts.join('');
}

window.enableClickDebug = function() {
    if (clickDebugEnabled) return;
    clickDebugEnabled = true;
    const overlay = ensureClickDebugOverlay();

    clickDebugHandler = (e) => {
        const x = e.clientX;
        const y = e.clientY;
        const el = document.elementFromPoint(x, y);
        const rect = el ? el.getBoundingClientRect() : null;
        overlay.innerHTML = '';

        if (rect) {
            const box = document.createElement('div');
            box.style.position = 'absolute';
            box.style.left = rect.left + 'px';
            box.style.top = rect.top + 'px';
            box.style.width = rect.width + 'px';
            box.style.height = rect.height + 'px';
            box.style.border = '2px solid #ff3b3b';
            box.style.boxShadow = '0 0 0 2px rgba(255,59,59,0.25) inset';
            box.style.pointerEvents = 'none';

            const label = document.createElement('div');
            label.style.position = 'absolute';
            label.style.left = rect.left + 'px';
            label.style.top = Math.max(0, rect.top - 28) + 'px';
            label.style.background = '#ff3b3b';
            label.style.color = '#ffffff';
            label.style.padding = '4px 8px';
            label.style.fontFamily = 'monospace';
            label.style.fontSize = '12px';
            label.style.borderRadius = '6px';
            label.style.pointerEvents = 'none';
            label.textContent = describeElement(el);

            overlay.appendChild(box);
            overlay.appendChild(label);
        }

        console.log('[ClickDebug]', describeElement(el), el);
    };

    document.addEventListener('click', clickDebugHandler, true);
    console.log('[ClickDebug] Enabled. Click any element to inspect.');
};

window.disableClickDebug = function() {
    clickDebugEnabled = false;
    if (clickDebugHandler) {
        document.removeEventListener('click', clickDebugHandler, true);
        clickDebugHandler = null;
    }
    const overlay = document.getElementById('click-debug-overlay');
    if (overlay) overlay.remove();
    console.log('[ClickDebug] Disabled.');
};

// Firebase Authenticators
window.handleEmailLogin = async function() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    if(!email || !pass) { alert("Credentials required."); return; }

    await ensureFirebaseInitialized({ attachListener: true });

    signInWithEmailAndPassword(auth, email, pass).then(() => {
        trackAnalytics('login', { method: 'email' });
        closeAuthModal();
    }).catch(e => {
        alert("Access Denied: " + e.message);
    });
};

window.handleEmailSignup = async function() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    if(!email || !pass) { alert("Credentials required."); return; }

    await ensureFirebaseInitialized({ attachListener: true });

    createUserWithEmailAndPassword(auth, email, pass).then(() => {
        trackAnalytics('sign_up', { method: 'email' });
        closeAuthModal();
    }).catch(e => {
        alert("Registration Failed: " + e.message);
    });
};

window.firebaseLogin = async function() {
    await ensureFirebaseInitialized({ attachListener: true });

    signInWithPopup(auth, provider).then(() => {
        trackAnalytics('login', { method: 'google' });
        closeAuthModal();
    }).catch((error) => {
        console.error("Login failed:", error);
        alert("Connection failed. Please try again.");
    });
};

window.firebaseLogout = async function() {
    await ensureFirebaseInitialized({ attachListener: true });

    signOut(auth)
        .then(() => {
            if (shouldUseFeedbackStream) {
                signInAnonymously(auth);
            }
        })
        .catch((error) => { console.error("Logout failed:", error); });
};

window.submitLog = async function(source) {
    await ensureFirebaseInitialized({ attachListener: true, ensureAnonymousSession: true });

    if (!currentUser) return;
    const prefix = source === 'about' ? 'about-' : '';
    const textInput = document.getElementById(`${prefix}log-text`);
    const typeInput = document.getElementById(`${prefix}log-type`);

    if (textInput.value.trim() === "") { alert("Log cannot be empty."); return; }

    const submitBtn = document.getElementById(`${prefix}submit-btn`);
    submitBtn.disabled = true;
    submitBtn.innerText = "TRANSMITTING...";

    try {
        await addDoc(reviewsPath, {
            user: currentUser.name,
            uid: currentUser.uid,
            type: typeInput.value,
            source,
            text: textInput.value,
            timestamp: serverTimestamp()
        });

        trackAnalytics('submit_feedback', { type: typeInput.value, source: source });
        textInput.value = "";
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("Failed to transmit data. Check database rules.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = source === 'about' ? "Post Message" : "Transmit Data";
    }
};

window.submitContactMessage = async function() {
    await ensureFirebaseInitialized({ attachListener: true, ensureAnonymousSession: true });

    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const messageInput = document.getElementById('contact-message');
    const submitBtn = document.getElementById('contact-submit-btn');

    if (!nameInput || !emailInput || !messageInput || !submitBtn) return;

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = messageInput.value.trim();

    if (!name || !email || !message) {
        alert('Please fill in your name, email, and message.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Sending...';

    try {
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }

        await addDoc(reviewsPath, {
            user: name,
            uid: auth.currentUser ? auth.currentUser.uid : null,
            email,
            type: 'Contact',
            source: 'communicate',
            text: message,
            timestamp: serverTimestamp()
        });

        trackAnalytics('submit_feedback', { type: 'Contact', source: 'communicate' });

        nameInput.value = '';
        emailInput.value = '';
        messageInput.value = '';
        alert('Message sent successfully.');
    } catch (e) {
        console.error('Error sending contact message:', e);
        alert('Failed to send message. Check database rules.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Send Message';
    }
};

function renderFeedbackUI() {
    const targets = [
        { prefix: 'norot-', source: 'norot' },
        { prefix: 'about-', source: 'about' }
    ];

    targets.forEach(t => {
        const authContainer = document.getElementById(`${t.prefix}auth-ui-container`);
        const formWrapper = document.getElementById(`${t.prefix}feedback-form-wrapper`);
        const logsContainer = document.getElementById(`${t.prefix}logs-container`);

        if(!authContainer || !formWrapper) return;

        if (currentUser) {
            authContainer.innerHTML = t.source === 'about' ? '' : `<span class="text-green-400">[ STATUS: AUTHORIZED ]</span>`;

            if (t.source === 'about') {
                formWrapper.innerHTML = `
                    <select id="${t.prefix}log-type" class="w-full bg-white/20 border border-white/30 rounded-lg mb-3 cursor-pointer text-sm p-2 text-[#1d1d1f] font-space focus:border-[#1d1d1f] focus:outline-none backdrop-blur-md">
                        <option value="Review">General Comment</option>
                        <option value="Bug">Bug Report</option>
                        <option value="Idea">Cool Idea</option>
                    </select>
                    <textarea id="${t.prefix}log-text" rows="3" class="w-full bg-white/20 border border-white/30 text-[#1d1d1f] font-space p-3 rounded-lg mb-3 resize-none placeholder-[#1d1d1f]/50 light-focus text-sm backdrop-blur-md" placeholder="Leave your thoughts..."></textarea>
                    <button id="${t.prefix}submit-btn" onclick="submitLog('${t.source}')" class="w-full bg-[#1d1d1f] text-white hover:bg-[var(--about-accent)] font-bold font-oswald py-3 rounded-lg transition-colors uppercase tracking-widest text-sm shadow-lg">Post Message</button>
                `;
            } else {
                formWrapper.innerHTML = `
                    <h5 class="font-orbitron font-bold text-white mb-4">Post Field Report</h5>
                    <select id="${t.prefix}log-type" class="w-full bg-black/50 border border-green-900/50 text-green-400 font-retro p-3 rounded-lg mb-4 cursor-pointer">
                        <option value="Review">General Review</option>
                        <option value="Bug">Bug Report</option>
                        <option value="Feature">Feature Request</option>
                    </select>
                    <textarea id="${t.prefix}log-text" rows="4" class="w-full bg-black/50 border border-green-900/50 text-zinc-300 font-space p-3 rounded-lg mb-4 resize-none placeholder-zinc-600 focus:outline-none focus:border-green-500" placeholder="Detail your experience or issues here..."></textarea>
                    <button id="${t.prefix}submit-btn" onclick="submitLog('${t.source}')" class="w-full bg-green-900/20 hover:bg-green-500/20 border border-green-500/50 text-green-400 font-retro py-3 rounded-lg transition-colors uppercase tracking-widest">Transmit Data</button>
                `;
            }
        } else {
            authContainer.innerHTML = t.source === 'about' ? '' : `<span class="text-red-500 animate-pulse">[ CONNECTION REQUIRED ]</span>`;

            if (t.source === 'about') {
                formWrapper.innerHTML = `
                    <div class="h-full flex flex-col items-center justify-center text-center py-6 bg-white/20 backdrop-blur-md rounded-lg border border-white/30">
                        <p class="font-space text-[#1d1d1f] mb-4 text-sm font-medium">You must be connected to leave a message.</p>
                        <button onclick="openAuthModal()" class="bg-[#1d1d1f] text-white hover:bg-[var(--about-accent)] font-oswald px-6 py-2 rounded-full transition-colors uppercase tracking-widest text-xs shadow-lg">
                            Initiate Connection
                        </button>
                    </div>
                `;
            } else {
                formWrapper.innerHTML = `
                    <div class="h-full flex flex-col items-center justify-center text-center py-8">
                        <svg class="w-12 h-12 text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <p class="font-retro text-zinc-500 mb-6">Authentication required to post to system logs.</p>
                        <button onclick="openAuthModal()" class="border border-green-500/50 text-green-400 hover:bg-green-500/10 font-retro px-6 py-2 rounded transition-colors uppercase tracking-widest flex items-center gap-3 mx-auto">
                            Initiate Connection
                        </button>
                    </div>
                `;
            }
        }

        if (logsContainer) {
            logsContainer.innerHTML = '';
            const filteredLogs = systemLogs.filter(log => log.source === t.source);

            if (filteredLogs.length === 0) {
                logsContainer.innerHTML = `<p class="text-zinc-600 font-retro p-4 border border-zinc-800/50 rounded-xl bg-black/30 text-sm">No logs found. Be the first.</p>`;
            } else {
                filteredLogs.forEach(log => {
                    let badgeColor, textColor, borderColor, bgClass;

                    if (t.source === 'about') {
                        badgeColor = log.type === 'Bug' ? 'text-red-600 border-red-200 bg-red-50' :
                                     log.type === 'Idea' ? 'text-blue-600 border-blue-200 bg-blue-50' :
                                     'text-[#1d1d1f] border-gray-300 bg-white/50';
                        textColor = 'text-[#1d1d1f]';
                        borderColor = 'border-white/40 hover:border-gray-400';
                        bgClass = 'bg-white/20 backdrop-blur-md';
                    } else {
                        badgeColor = log.type === 'Bug' ? 'text-red-400 border-red-900/50 bg-red-900/10' :
                                     log.type === 'Idea' || log.type === 'Feature' ? 'text-blue-400 border-blue-900/50 bg-blue-900/10' :
                                     'text-green-400 border-green-900/50 bg-green-900/10';
                        textColor = 'text-zinc-400';
                        borderColor = 'border-zinc-800/60 hover:border-green-900/50';
                        bgClass = 'bg-black/40 backdrop-blur-sm';
                    }

                    let displayDate = timeAgo(log.timestamp);

                    logsContainer.innerHTML += `
                        <div class="${bgClass} border ${borderColor} rounded-xl p-5 transition-colors shadow-sm">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded bg-zinc-900 flex items-center justify-center border border-zinc-800">
                                        <span class="font-orbitron font-bold text-zinc-500">${log.user.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <div>
                                        <div class="font-retro ${t.source==='about'?'text-[#1d1d1f] font-bold':'text-zinc-300'} text-sm">${log.user}</div>
                                        <div class="font-space ${t.source==='about'?'text-gray-500':'text-zinc-600'} text-xs">${displayDate}</div>
                                    </div>
                                </div>
                                <span class="font-retro text-[10px] px-2 py-1 rounded border ${badgeColor} uppercase tracking-widest">${log.type}</span>
                            </div>
                            <p class="font-space ${textColor} text-sm leading-relaxed pl-11 font-medium">
                                ${log.text}
                            </p>
                        </div>
                    `;
                });
            }
        }
    });
}

function initGatekeeperBlob() {
    if (isMobile) return;
    const gatekeeperGroup = document.getElementById('gatekeeper-blob-group');
    const gatekeeper = document.getElementById('about-gatekeeper');
    if (!gatekeeperGroup || !gatekeeper) return;
    const numCircles = 22;
    const circles = [];
    const history = [];
    for (let i = 0; i < numCircles; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('fill', 'white');
        gatekeeperGroup.appendChild(circle);
        circles.push(circle);
        history.push({ x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0 });
    }

    let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let lastMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let velocity = 0;
    let currentScale = 0;
    let targetScale = 0;
    let idleTimer = 0;

    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener('touchmove', e => {
        if (e.touches && e.touches[0]) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
        }
    });

    function animateGatekeeperBlob() {
        requestAnimationFrame(animateGatekeeperBlob);
        if (gatekeeper.style.display === 'none') return;

        let dx = mouse.x - lastMouse.x;
        let dy = mouse.y - lastMouse.y;
        velocity = Math.sqrt(dx * dx + dy * dy);
        lastMouse.x = mouse.x;
        lastMouse.y = mouse.y;

        if (velocity > 0.5) {
            idleTimer = 0;
            targetScale = Math.min(1.5, targetScale + 0.05 + (velocity * 0.005));
        } else {
            idleTimer++;
            if (idleTimer > 15) {
                targetScale = Math.max(0.3, targetScale - 0.02);
            }
        }

        currentScale += (targetScale - currentScale) * 0.08;
        history[0].x += (mouse.x - history[0].x) * 0.15;
        history[0].y += (mouse.y - history[0].y) * 0.15;

        for (let i = 1; i < numCircles; i++) {
            let node = history[i];
            let target = history[i - 1];
            node.vx += (target.x - node.x) * 0.25;
            node.vy += (target.y - node.y) * 0.25;
            node.vx *= 0.55;
            node.vy *= 0.55;
            node.x += node.vx;
            node.y += node.vy;
        }

        let time = Date.now() * 0.003;

        for (let i = 0; i < numCircles; i++) {
            let baseRadius = Math.max(5, 70 - (i * 3.2));
            let pulse = Math.sin(time + (i * 0.5)) * 10;
            let finalRadius = Math.max(0, (baseRadius + pulse) * currentScale);
            let squirmX = Math.sin(time * 1.4 + i) * 12 * currentScale;
            let squirmY = Math.cos(time * 1.1 + i * 0.8) * 12 * currentScale;
            circles[i].setAttribute('cx', history[i].x + squirmX);
            circles[i].setAttribute('cy', history[i].y + squirmY);
            circles[i].setAttribute('r', finalRadius);
        }
    }

    animateGatekeeperBlob();
}

function initPage() {
    initAboutLists();
    initPageTheme();
    initAnimations();

    if (isHomePage) initHomePage();
    if (isCreationsPage) initCreationsShowcase();
    if (isNorotPage) initNorotPage();

    if (isIdentityPage) {
        initGatekeeperBlob();
        renderAboutGatekeeper();
    }

    trackAnalytics('page_view', {
        page_path: window.location.pathname,
        page_title: page
    });

    setTimeout(() => { if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); }, 150);
}

if (shouldUseFeedbackStream) {
    // Pages with feedback forms need auth/session ready as soon as possible.
    ensureFirebaseInitialized({ attachListener: true, ensureAnonymousSession: true }).catch((e) => {
        console.error('Eager Firebase init failed:', e);
    });
} else {
    // Defer Firebase on lightweight pages to reduce startup cost on low-end phones.
    const warmupFirebase = () => {
        ensureFirebaseInitialized({ attachListener: true }).catch((e) => {
            console.warn('Deferred Firebase init failed:', e);
        });
    };

    if ('requestIdleCallback' in window) {
        requestIdleCallback(warmupFirebase, { timeout: 6000 });
    } else {
        setTimeout(warmupFirebase, 3000);
    }
}

// Initialize UI on load
updateGlobalAuthUI(null);
initPage();
