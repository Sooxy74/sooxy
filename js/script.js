import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.167.0/build/three.module.js';
        import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js';

        const LABEL_DESKTOP_PX = 14; // taille de base desktop / paysage
        const LABEL_MOBILE_PX  = 12; // taille de base mobile / tablette


        const FontMetrics = {
    charWidth: 0,
    baseFontSize: LABEL_DESKTOP_PX,
    initialized: false,
    init: function () {
        if (this.initialized) return;
        const el = document.createElement('span');
        el.style.fontFamily = '"Space Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace';
        el.style.fontSize = LABEL_DESKTOP_PX + 'px';
        el.style.fontWeight = '700';
        el.style.position = 'absolute';
        el.style.visibility = 'hidden';
        el.style.whiteSpace = 'nowrap';
        el.textContent = 'X';
        document.body.appendChild(el);
        const rect = el.getBoundingClientRect();
        this.charWidth = rect.width;
        this.baseFontSize = LABEL_DESKTOP_PX;
        document.body.removeChild(el);
        this.initialized = true;
            },
            measure: function (text) {
                if (!this.initialized) this.init();
                const lines = String(text).split('\n');
                let maxLen = 0;
                for (const line of lines) {
                    if (line.length > maxLen) maxLen = line.length;
                }
                return { width: maxLen * this.charWidth, fontSize: this.baseFontSize };
            }
        };


        function rootScroller() {
            return document.scrollingElement || document.documentElement;
        }

        let loaderOverlay;


        const BUCKETS = [
            { id: 'desktop-32:9', match: (w, h) => w >= 1025 && (w / h) >= 3.1, grid: { cols: 6, rows: 2 } },
            { id: 'desktop-21:9', match: (w, h) => w >= 1025 && (w / h) >= 1.8 && (w / h) < 3.1, grid: { cols: 5, rows: 2 } },
            { id: 'desktop-16:9', match: (w, h) => (w / h) >= 1.6 && (w / h) < 1.8 && w >= 768, grid: { cols: 4, rows: 2 } },
            { id: 'tablet-4:3', match: (w, h) => (w / h) >= 1.28 && (w / h) < 1.6 && w >= 641 && w < 1025, grid: { cols: 3, rows: 2 } },
            { id: 'tablet-3:4', match: (w, h) => (h / w) >= 1.2 && (h / w) < 1.5 && w >= 641 && w < 1025, grid: { cols: 2, rows: 3 } },
            { id: 'tablet-9:16', match: (w, h) => (h / w) >= 1.5 && w >= 641 && w < 1025, grid: { cols: 2, rows: 4 } },
            { id: 'mobile-h', match: (w, h) => w <= 640 && w > h, grid: { cols: 6, rows: 2 } },
            { id: 'mobile-v', match: (w, h) => w <= 640 && h >= w, grid: { cols: 2, rows: 4 } },
        ];
        const HYST = 0.03;
        let currentBucket = null;
        let lastAspect = null;

        function pickBucket(w, h) {
            const a = w / h;

            if (w > h && w < 1025) {
                lastAspect = a;
                return 'desktop-16:9';
            }

            if (currentBucket && lastAspect && Math.abs(a - lastAspect) < HYST) return currentBucket;

            for (const b of BUCKETS) {
                if (b.match(w, h)) {
                    lastAspect = a;
                    return b.id;
                }
            }
            lastAspect = a;
            return 'desktop-16:9';
        }

        const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const COLORS = {
            background: 0x0055ff,
            square: 0x090B0B,
            accent: 0xf3ff00,
            textCSS: '#f3f1ee',
            placeholder: '#CAC4B7'
        };

        const config = {
            borderWidth: 0.005,
            backgroundColor: COLORS.background,
            darkColor: COLORS.square,
            cursorColor: COLORS.accent,
            initialProbabilityToSubdivide: 0.99,
            depthDecayFactor: 0.04,
            noiseScale: 1,
            minDepth: 1,
            maxDepthVariation: 7,
            mouseSquareAnimationSpeed: prefersReducedMotion ? 0.15 : 0.4,
            gridAnimationSpeed: prefersReducedMotion ? 0.05 : 0.08,
            grainOpacity: prefersReducedMotion ? 0.0 : 0.12,
            showDots: true,
            dotSize: 0.12,
            dotColor: COLORS.accent,
            dotSizeIsRelative: false,
            baseColsOverride: null,
            overlayGapCols: 0.5,


            labelBaffleSpeedMs: 30,
            labelRevealMs: 50,
            refineChanceD2: 0.55,
            extraChildChanceAfterD2: 0.30,

        };

        const LABEL_MARGIN_DEPTH_RIGHT = 6;
        const LABEL_MARGIN_DEPTH_TOP = 6;
        const LABEL_NUDGE_PX_Y = -2;
        const LABEL_RIGHT_EXTRA_PX = 1;
        const SAFE_TOP_GAP_PX = 0;


        function viewportLabelScaleFactor() {
            const s = Math.min(window.innerWidth, window.innerHeight);
            const MIN = 360;
            const OK = 912;
            const t = (s - MIN) / (OK - MIN);
            return Math.max(0.70, Math.min(1.00, t));
        }


        function worldToClientXY(v3) {
            const v = v3.clone().project(camera);
            const pxW = STABLE_VP_W || window.innerWidth;
            const pxH = STABLE_VP_H || window.innerHeight;
            return {
                x: (v.x * 0.5 + 0.5) * pxW,
                y: (-v.y * 0.5 + 0.5) * pxH
            };
        }


        function makeDomLabelEl(text) {
            const el = document.createElement('div');
            el.className = 'hover-label';

            const parts = String(text).replace(/\\n/g, '\n').split('\n');
            el.innerHTML = parts
                .map((s, i) => `<span class="line${i === 2 ? ' sub' : ''}">${s}</span>`)
                .join('');

            el.style.textAlign = 'right';
            el.style.direction = 'ltr';

            el.querySelectorAll('.line').forEach(line => {
                line.style.display = 'block';
                line.style.whiteSpace = 'nowrap';
                line.style.textAlign = 'right';
            });

            return el;
        }


        // Vœux d’images par bucket
        const LAYOUT_WISH = {
            'desktop-32:9': { wantD1: 2, wantD2: 6, buttonsOnD2: true },
            'desktop-21:9': { wantD1: 2, wantD2: 5, buttonsOnD2: true },
            'desktop-16:9': { wantD1: 3, wantD2: 4, buttonsOnD2: true },
            'tablet-4:3': { wantD1: 1, wantD2: 4, buttonsOnD2: false },
            'tablet-3:4': { wantD1: 1, wantD2: 4, buttonsOnD2: false },
            'tablet-9:16': { wantD1: 1, wantD2: 4, buttonsOnD2: false },
            'mobile-h': { wantD1: 0, wantD2: 0, buttonsOnD2: false },
            'mobile-v': { wantD1: 0, wantD2: 0, buttonsOnD2: false },
        };

        const PRESETS = {
            'desktop-16:9': {

                buttons: [
                    { size: 'D2', row: 0, col: 1, quad: 0, key: 'motion' },
                    { size: 'D2', row: 1, col: 2, quad: 1, key: 'ui' },
                    { size: 'D2', row: 1, col: 0, quad: 1, key: 'fractal' },
                    { size: 'D2', row: 0, col: 3, quad: 3, key: 'random' },
                    { size: 'D2', row: 1, col: 1, quad: 3, key: 'code' }
                ],

                imagesD1: [
                    { row: 0, col: 0 }
                ],

                imagesD2: [
                    { size: 'D2', row: 0, col: 2, quad: 1 }
                ],
            },

            'tablet-4:3': {
                buttons: [
                    { size: 'D2', row: 0, col: 0, quad: 0, key: 'motion' },
                    { size: 'D2', row: 0, col: 1, quad: 0, key: 'ui' },
                    { size: 'D2', row: 0, col: 2, quad: 2, key: 'fractal' },
                    { size: 'D2', row: 1, col: 0, quad: 1, key: 'random' },
                    { size: 'D2', row: 1, col: 2, quad: 2, key: 'code' },
                ],
                imagesD1: [], imagesD2: [],
            },
            'tablet-3:4': {
                buttons: [
                    { size: 'D1', row: 0, col: 1, key: 'motion' },
                    { size: 'D1', row: 1, col: 0, key: 'ui' },
                    { size: 'D1', row: 2, col: 1, key: 'fractal' },
                    { size: 'D1', row: 3, col: 0, key: 'random' },
                    { size: 'D1', row: 4, col: 1, key: 'code' },
                ],
                imagesD1: [], imagesD2: [],
            },
            'tablet-9:16': {
                buttons: [
                    { size: 'D1', row: 0, col: 1, key: 'motion' },
                    { size: 'D1', row: 1, col: 0, key: 'ui' },
                    { size: 'D1', row: 2, col: 1, key: 'fractal' },
                    { size: 'D1', row: 3, col: 0, key: 'random' },
                    { size: 'D1', row: 4, col: 1, key: 'code' },
                ],
                imagesD1: [], imagesD2: [],
            },
            'mobile-v': {
                buttons: [
                    { size: 'D2', row: 0, col: 0, quad: 1, key: 'motion' },
                    { size: 'D2', row: 1, col: 1, quad: 2, key: 'ui' },
                    { size: 'D2', row: 2, col: 0, quad: 3, key: 'fractal' },
                    { size: 'D2', row: 3, col: 1, quad: 0, key: 'random' },
                    { size: 'D2', row: 1, col: 0, quad: 0, key: 'code' },
                ],
                imagesD1: [], imagesD2: [],
            },
            'mobile-h': {
                buttons: [
                    { size: 'D2', row: 0, col: 0, quad: 1, key: 'motion' },
                    { size: 'D2', row: 0, col: 1, quad: 2, key: 'ui' },
                    { size: 'D2', row: 1, col: 2, quad: 0, key: 'fractal' },
                    { size: 'D2', row: 1, col: 0, quad: 3, key: 'random' },
                    { size: 'D2', row: 0, col: 2, quad: 2, key: 'code' },
                ],
                imagesD1: [], imagesD2: [],
            },

            'desktop-21:9': {
                buttons: [
                    { size: 'D2', row: 0, col: 1, quad: 0, key: 'motion' },
                    { size: 'D2', row: 1, col: 2, quad: 1, key: 'ui' },
                    { size: 'D2', row: 1, col: 0, quad: 1, key: 'fractal' },
                    { size: 'D2', row: 0, col: 3, quad: 3, key: 'random' },
                    { size: 'D2', row: 1, col: 1, quad: 3, key: 'code' }
                ],
                imagesD1: [{ row: 0, col: 0 }],
                imagesD2: [{ size: 'D2', row: 0, col: 2, quad: 1 }],
            },
            'desktop-32:9': {
                buttons: [
                    { size: 'D2', row: 0, col: 1, quad: 0, key: 'motion' },
                    { size: 'D2', row: 1, col: 2, quad: 1, key: 'ui' },
                    { size: 'D2', row: 1, col: 0, quad: 1, key: 'fractal' },
                    { size: 'D2', row: 0, col: 3, quad: 3, key: 'random' },
                    { size: 'D2', row: 1, col: 1, quad: 3, key: 'code' }
                ],
                imagesD1: [{ row: 0, col: 0 }],
                imagesD2: [{ size: 'D2', row: 0, col: 2, quad: 1 }],
            },
        };



        const CATEGORIES = [
            { key: 'motion', label: 'Motion\nDesign', url: '/motion-design' },
            { key: 'fractal', label: 'Fractal\nArt', url: '/fractal-art' },
            { key: 'code', label: 'Creative\nCoding\nAI-assisted', url: '/creative-coding' },
            { key: 'ui', label: 'UI\nDesign', url: '/UI-design' },
            { key: 'random', label: 'Random\nStuff', url: '/random-stuff' }
        ];
        const REQUIRED_BUTTONS = 5;

        // Runtime state
        let scene, camera, renderer, noise2D, rngFn, mouseSquare, cursorBorder, grainPlane, menuPlane, menuBorderBottom;
        let lastMouseScreenPos = new THREE.Vector2(0, 0);
        const fractalState = new Map(); const meshPool = []; const dotMeshPool = [];
        let targetState = new Map();
        let targetStateDirty = true;
        let darkMaterial, cursorMaterial, geometry, dotMaterial, menuBorderMaterial;
        let needsBaseUpdate = true; let needsRefineCheck = false; let refineBudgetPerFrame = 64;
        const imageCells = new Set(); const buttonCells = new Map(); let persistentButtonPaths = [];
        const imageAssignment = new Map(); const imageSlots = new Set(); const buttonSlots = new Set();
        const materialCache = new Map(); const textureLoader = new THREE.TextureLoader();
        let baseCols = 4, baseRowsPrimary = 2, WANT_D1 = 1, WANT_D2 = 4, BUTTONS_ON_D2 = true;
        let TARGET_DEPTH = prefersReducedMotion ? 5 : 7;
        let cursorInHeader = false;
        let lastGridCursorSizeWorld = 0;
        let persistentImageUrls = null;
        let freeOverlays = [];

        // Instanced Meshes
        let bgSquaresInstanced, btnSquaresInstanced;
        let bgDotsInstanced, btnDotsInstanced;
        const MAX_INSTANCES = 20000;
        const dummyObj = new THREE.Object3D();

        const USE_MOBILE_DETERMINISTIC = true;
        const MOBILE_CATEGORY_ORDER = ['motion', 'fractal', 'ui', 'code', 'random'];
        const MOBILE_BTN_OCCLUDER_PAD_PX = 1;

        let contentGroup;

        let mobileWorldContentHeight = 0;
        let instantKill = new Set();
        let STABLE_VP_W = window.innerWidth;
        let STABLE_VP_H = window.innerHeight;



        let scrollOffsetWorld = 0;
        let mobileBuildScrollAt = 0;


        let imageTextures = [];
        const LOCAL_IMG_DIR = 'img/fractal-art_img/';
        const IMG_EXT = '.png';
        const IMG_PAD = 2;
        const MAX_INDEX = 200;
        const STOP_AFTER_MISSES = 10;

        async function scanLocalImages(onProgress) {
            imageTextures = [];
            let misses = 0;
            const BATCH = 5;

            for (let i = 1; i <= MAX_INDEX; i += BATCH) {
                const promises = [];
                for (let j = 0; j < BATCH; j++) {
                    if (i + j > MAX_INDEX) break;
                    const num = String(i + j).padStart(IMG_PAD, '0');
                    const url = `${LOCAL_IMG_DIR}${num}${IMG_EXT}`;
                    promises.push(imageExists(url).then(exists => ({ url, exists })));
                }

                const results = await Promise.all(promises);

                let stop = false;
                for (const res of results) {
                    if (res.exists) {
                        imageTextures.push(res.url);
                        misses = 0;
                    } else {
                        misses++;
                    }
                }

                if (onProgress) {
                    const current = Math.min(MAX_INDEX, i + BATCH - 1);
                    const expectedTotal = Math.min(MAX_INDEX, current + Math.max(0, STOP_AFTER_MISSES - misses));
                    onProgress(current, expectedTotal);
                }

                if (misses >= STOP_AFTER_MISSES && imageTextures.length > 0) break;
            }

            imageTextures.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

            if (onProgress) onProgress(1, 1);
        }



        function imageExists(url) {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                img.src = url;
            });
        }


        function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return h; }
        function saltedKey(path, salt) { return (hashCode(path) ^ salt) | 0; }
        const sessionSalt = (Math.random() * 0x7fffffff) | 0;

        let globalClickNonce = 0;
        function mulberry32(seed) {
            let t = seed >>> 0;
            return function () {
                t += 0x6D2B79F5;
                let r = Math.imul(t ^ (t >>> 15), 1 | t);
                r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
                return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
            };
        }

        function reseed(extraSeed = 0) {
            const nonce = (scene?.userData?._regenNonce | 0) >>> 0;
            const base = (sessionSalt ^ (Date.now() >>> 0) ^ nonce ^ (extraSeed >>> 0)) >>> 0;
            rngFn = mulberry32(base);
            noise2D = createNoise2D(rngFn);
            scene = scene || {};
            scene.userData = scene.userData || {};
            scene.userData._randSalt = base >>> 0;
        }


        function getLayoutMetrics() {
            const headerEl = document.getElementById('ui-header');
            const headerPx = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 0;

            const key =
                [camera.left, camera.right, camera.top, camera.bottom, baseCols, STABLE_VP_W, STABLE_VP_H, headerPx].join('|');

            const m = getLayoutMetrics._memo || {};
            if (m.key === key && m.val) return m.val;

            const viewHeight = camera.top - camera.bottom;
            const viewWidth = camera.right - camera.left;

            const w = viewWidth / baseCols;

            const pxH = STABLE_VP_H || window.innerHeight;
            const headerWorld = (headerPx / pxH) * viewHeight;
            const onePxWorld = viewHeight / pxH;

            if (Math.abs(config.borderWidth - onePxWorld) > 1e-6) config.borderWidth = onePxWorld;

            const rawTop = camera.top - headerWorld;
            const contentTop = Math.round(rawTop / onePxWorld) * onePxWorld;

            const val = { viewHeight, viewWidth, w, menuHeight: headerWorld, contentTop, onePxWorld };
            getLayoutMetrics._memo = { key, val };
            return val;
        }



        function isInCullWindow(x, y, size) {
            const { contentTop } = getLayoutMetrics();
            const gx = (contentGroup?.position?.x || 0);
            const gy = (contentGroup?.position?.y || 0);
            const viewW = camera.right - camera.left;
            const viewH = contentTop - camera.bottom;
            const extendX = isLandscapeLike() ? viewW * 4.0 : 0;
            const extendY = isLandscapeLike() ? 0 : viewH * 4.0;
            const L = camera.left - gx - extendX;
            const R = camera.right - gx + extendX;
            const B = camera.bottom - gy - extendY;
            const T = contentTop - gy + extendY;
            const h = size * 0.5;
            const l = x - h, r = x + h, b = y - h, t = y + h;
            return !(r <= L || l >= R || t <= B || b >= T);
        }





        function isFullyVisible(x, y, size, contentTop) {
            const { contentTop: ct, onePxWorld } = getLayoutMetrics();
            const gx = (contentGroup?.position?.x || 0);
            const gy = (contentGroup?.position?.y || 0);
            const eps = Math.max(config.borderWidth * 2, onePxWorld * 0.5);
            const L = camera.left - gx + eps;
            const R = camera.right - gx - eps;
            const B = camera.bottom - gy + eps;
            const T = ct - gy - eps;
            const h = size * 0.5;
            return (x - h >= L && x + h <= R && y - h >= B && y + h <= T);
        }


        function isVisibleEnough(x, y, size, contentTop, minRatio = 0.5) {
            const { contentTop: ct } = getLayoutMetrics();
            const gx = (contentGroup?.position?.x || 0);
            const gy = (contentGroup?.position?.y || 0);
            const L = camera.left - gx;
            const R = camera.right - gx;
            const B = camera.bottom - gy;
            const T = ct - gy;
            const h = size * 0.5;
            const l = Math.max(L, x - h);
            const r = Math.min(R, x + h);
            const b = Math.max(B, y - h);
            const t = Math.min(T, y + h);
            const w = Math.max(0, r - l);
            const hh = Math.max(0, t - b);
            const overlap = w * hh;
            const full = size * size;
            return full > 0 ? (overlap / full) >= minRatio : false;
        }


        const canvas = document.createElement('canvas'); canvas.id = 'webgl-canvas'; document.body.appendChild(canvas);

        (async () => {
            init();
            await bootstrap();
            animate();

            if (loaderOverlay && window.baffle) {
                const loaderBaffle = window.baffle(loaderOverlay);
                loaderBaffle.set({ characters: '!/|~#.^+*$#', speed: 120 });
                loaderBaffle.start();
                setTimeout(() => {
                    loaderBaffle.text(() => ' ').reveal(500);
                    setTimeout(() => { if (loaderOverlay) loaderOverlay.remove(); }, 600);
                }, 300);
            } else if (loaderOverlay) {
                loaderOverlay.style.opacity = '0';
                loaderOverlay.addEventListener('transitionend', () => {
                    if (loaderOverlay) loaderOverlay.remove();
                }, { once: true });
            }
        })();


        function init() {
            scene = new THREE.Scene(); scene.background = new THREE.Color(config.backgroundColor);

            const aspect = window.innerWidth / window.innerHeight;
            const height = 10;
            const width = height * aspect;

            camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 1, 1000);
            camera.position.z = 10;

            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, canvas, powerPreference: 'high-performance' });
            renderer.setPixelRatio(1);
            renderer.setSize(window.innerWidth, window.innerHeight);

            loaderOverlay = document.getElementById('loader-overlay');

            geometry = new THREE.PlaneGeometry(1, 1);
            cursorMaterial = new THREE.MeshBasicMaterial({ color: config.cursorColor, transparent: true, opacity: 0.85 });
            darkMaterial = new THREE.MeshBasicMaterial({ color: config.darkColor });
            dotMaterial = new THREE.MeshBasicMaterial({ color: config.dotColor, depthTest: false });
            menuBorderMaterial = new THREE.MeshBasicMaterial({ color: config.backgroundColor });

            contentGroup = new THREE.Group();
            contentGroup.name = 'contentRoot';
            scene.add(contentGroup);

            mouseSquare = new THREE.Mesh(geometry, cursorMaterial);
            mouseSquare.userData.targetPosition = new THREE.Vector3();
            mouseSquare.userData.targetScale = new THREE.Vector3();
            mouseSquare.renderOrder = 200;
            scene.add(mouseSquare);

            cursorBorder = new THREE.Mesh(geometry, darkMaterial);
            cursorBorder.userData.targetPosition = new THREE.Vector3();
            cursorBorder.userData.targetScale = new THREE.Vector3();
            cursorBorder.renderOrder = 199;
            scene.add(cursorBorder);

            // --- Instanced Meshes Setup ---
            // 1. Background Squares (Order 0)
            bgSquaresInstanced = new THREE.InstancedMesh(geometry, darkMaterial, MAX_INSTANCES);
            bgSquaresInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            bgSquaresInstanced.renderOrder = 0;
            contentGroup.add(bgSquaresInstanced);

            // 2. Button Squares (Order 3.0)
            btnSquaresInstanced = new THREE.InstancedMesh(geometry, darkMaterial, MAX_INSTANCES);
            btnSquaresInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            btnSquaresInstanced.renderOrder = 3.0;
            contentGroup.add(btnSquaresInstanced);

            // 3. Background Dots (Order 2.5)
            bgDotsInstanced = new THREE.InstancedMesh(geometry, dotMaterial, MAX_INSTANCES);
            bgDotsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            bgDotsInstanced.renderOrder = 2.5;
            contentGroup.add(bgDotsInstanced);

            // 4. Button Dots (Order 3.4)
            btnDotsInstanced = new THREE.InstancedMesh(geometry, dotMaterial, MAX_INSTANCES);
            btnDotsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            btnDotsInstanced.renderOrder = 3.4;
            contentGroup.add(btnDotsInstanced);


            createGrainPlane();
            createMenuPlane();
            menuBorderBottom.visible = false;

            window.addEventListener('mousemove', onMouseMove, { passive: true });
            window.addEventListener('click', onClick, { passive: true });
            window.addEventListener('scroll', onScroll, { passive: true });

            function enableNavButtonHoverAnimation() {
                if (typeof window.gsap === 'undefined') {
                    requestAnimationFrame(enableNavButtonHoverAnimation);
                    return;
                }
                const buttons = document.querySelectorAll('#nav-links .nav-btn');
                buttons.forEach(setupAnimatedNavButton);
            }

            function setupAnimatedNavButton(button) {
                if (!button) return;
                const label = button.textContent.trim();
                button.innerHTML = `
    <span class="text-container">
      <span class="button-text initial-text">${label}</span>
      <span class="button-text hover-text">${label}</span>
    </span>
  `;
                const splitTextIntoSpans = (el) => {
                    const text = el.textContent;
                    el.innerHTML = [...text].map(ch => `<span class="letter">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
                    return el.querySelectorAll('.letter');
                };
                const initialEl = button.querySelector('.initial-text');
                const hoverEl = button.querySelector('.hover-text');
                const initialLetters = splitTextIntoSpans(initialEl);
                const hoverLetters = splitTextIntoSpans(hoverEl);
                gsap.set(hoverEl, { position: 'absolute', top: 0, left: 0 });
                gsap.set(initialLetters, { y: '0%' });
                gsap.set(hoverLetters, { y: '100%' });
                const tl = gsap.timeline({ paused: true });
                tl.to(initialLetters, { y: '-100%', stagger: 0.015, duration: 0.20, ease: 'power2.inOut' })
                    .to(hoverLetters, { y: '0%', stagger: 0.015, duration: 0.20, ease: 'power2.inOut' }, '<0.05');
                button.addEventListener('mouseenter', () => tl.play());
                button.addEventListener('mouseleave', () => tl.reverse());
            }

            enableNavButtonHoverAnimation();

            requestAnimationFrame(() => { updateMenuGeometry(); });
        }



        function syncCssHeaderHeight() {
            const headerEl = document.getElementById('ui-header');
            const headerPx = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 0;
            document.documentElement.style.setProperty('--menu-h', headerPx + 'px');
        }
        syncCssHeaderHeight();
        window.addEventListener('resize', syncCssHeaderHeight, { passive: true });



        async function bootstrap() {
            await document.fonts.ready;

            // --- CORRECTION : On calcule le layout et on applique la taille du texte TOUT DE SUITE ---
            const w = window.innerWidth, h = window.innerHeight;
            currentBucket = pickBucket(w, h);
            applyBucket();

            // On force la taille du label "Fractal Art" maintenant, avant le chargement des images
            syncCategoryLabelSize(getLayoutMetrics());
            // ----------------------------------------------------------------------------------------

            const onProgress = (current, total) => {
                if (loaderOverlay) {
                    const percent = Math.min(100, Math.floor((current / total) * 100));
                    loaderOverlay.textContent = `[ ${percent}% ]`;
                }
            };

            // Ensuite seulement, on lance le scan d'images (qui peut prendre du temps)
            await scanLocalImages(onProgress);
            FontMetrics.init();

            if (loaderOverlay) loaderOverlay.textContent = `[ 100% ]`;

            resetFractalRandom();

            buildFreeOverlays();

            syncStateToMeshes();

            installDragSwipeScroll();
            forceBrowserToLayoutForHScroll();

            lastGridCursorSizeWorld = computeDefaultGridCursorSize();

            setContentTransformFromScroll();

            const catLabel = document.getElementById('category-label');
            if(catLabel) catLabel.style.opacity = '1';
        }


        function applyBucket() {
            const b = BUCKETS.find(x => x.id === currentBucket);

            const isTabletPortrait = (currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16');
            const isPhonePortrait = (currentBucket === 'mobile-v');

            const isTabletLand = isTabletLandscapeStrict();
            const forceSubDesktopLandscape = isSubDesktopLandscape() && !isTabletLand;

            const ULTRAWIDE_AR = 22 / 9;
            const aspect = window.innerWidth / window.innerHeight;

            if (forceSubDesktopLandscape) {
                baseCols = 4;
                baseRowsPrimary = 2;

            } else if (isTabletPortrait) {
                if (isShortPortrait()) {
                    baseCols = 2;
                } else {
                    baseCols = 3;
                }
                baseRowsPrimary = b?.grid.rows || 3;

            } else if (!isPhonePortrait) {
                if (isTabletLand) {
                    baseCols = b?.grid?.cols ?? 4;
                    baseRowsPrimary = b?.grid?.rows ?? 2;
                } else if (config.baseColsOverride != null) {
                    baseCols = Math.max(1, config.baseColsOverride);
                    baseRowsPrimary = b?.grid?.rows ?? 2;
                } else if (config.targetCellPx) {
                    baseCols = Math.max(1, Math.round(window.innerWidth / config.targetCellPx));
                    baseRowsPrimary = b?.grid?.rows ?? 2;
                } else {
                    baseCols = b?.grid?.cols || 4;
                    baseRowsPrimary = b?.grid?.rows || 2;
                }

            } else {
                baseCols = 2;
                baseRowsPrimary = 2;
            }

            const wishKey =
                forceSubDesktopLandscape ? 'desktop-16:9'
                    : (currentBucket === 'mobile-h' ? 'desktop-16:9' : currentBucket);

            const wish = LAYOUT_WISH[wishKey] || { wantD1: 1, wantD2: 4, buttonsOnD2: true };
            WANT_D1 = wish.wantD1;
            WANT_D2 = wish.wantD2;
            BUTTONS_ON_D2 = wish.buttonsOnD2;

            const portraitMobileLike = isPhonePortrait || isTabletPortrait;

            TARGET_DEPTH = portraitMobileLike ? (prefersReducedMotion ? 3 : 6)
                : (prefersReducedMotion ? 4 : 6);

            if (portraitMobileLike) {
                TARGET_DEPTH = Math.max(config.minDepth, (TARGET_DEPTH | 0) - 1);
            }
            config.refineChanceD2 = portraitMobileLike ? 0.3 : 0.55;

            updateScrollDocHeight();
        }


        function createGrainPlane() {
            const mat = new THREE.ShaderMaterial({
                transparent: config.grainOpacity > 0,
                depthTest: false,
                depthWrite: false,
                uniforms: { uOpacity: { value: config.grainOpacity } },
                vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
                fragmentShader: 'uniform float uOpacity; varying vec2 vUv; float r(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233)))*43758.5453123);} void main(){ vec2 uv=gl_FragCoord.xy/512.0; float g=r(uv); gl_FragColor=vec4(1.0,1.0,1.0,g*uOpacity); }'
            });
            grainPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
            grainPlane.position.z = 1; grainPlane.renderOrder = 2; scene.add(grainPlane);
            grainPlane.visible = config.grainOpacity > 0;
            updateGrainPlaneSize();
        }

        function createMenuPlane() {
            const menuOccluderMaterial = new THREE.MeshBasicMaterial({
                color: config.darkColor,
                depthTest: false,
                depthWrite: false,
                transparent: false
            });

            menuPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), menuOccluderMaterial);
            menuPlane.position.z = 10;
            menuPlane.renderOrder = 100;
            scene.add(menuPlane);

            menuBorderBottom = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), menuBorderMaterial);
            menuBorderBottom.position.z = 11;
            menuBorderBottom.renderOrder = 101;
            scene.add(menuBorderBottom);

            menuPlane.visible = true;
            menuBorderBottom.visible = false;

            const header = document.getElementById('ui-header');
            if (header) header.style.background = 'transparent';

            updateMenuGeometry();
        }

        (function installMobileFooterGPU() {
            const ID = 'mobile-footer';
            let el = document.getElementById(ID);
            if (!el) {
                el = document.createElement('div');
                el.id = ID;
                el.setAttribute('aria-hidden', 'true');
                document.body.appendChild(el);
            }

            const MAX = 320;
            const PAD = 2;
            const UNDER_DESKTOP = () => Math.min(innerWidth, innerHeight) <= 1024;

            let lastPX = MAX;
            let lastH = 0;

            function layoutHeight() {
                return (typeof STABLE_VP_H === 'number' && STABLE_VP_H > 0) ? STABLE_VP_H : innerHeight;
            }

            function measureH() {
                const vv = visualViewport;
                let extra = 0;
                if (vv) {
                    const vvBottom = vv.height + (vv.offsetTop || 0);
                    extra = Math.max(0, vvBottom - layoutHeight());
                }
                return Math.max(0, Math.ceil(extra) + PAD);
            }

            function setTransformInstant(h) {
                el.style.transition = 'transform 0s';
                const ty = Math.max(0, MAX - h);
                if (ty !== lastPX) {
                    el.style.transform = `translateY(${ty}px)`;
                    lastPX = ty; lastH = h;
                }
            }

            function setTransformAnimated(h) {
                el.style.transition = 'transform .12s ease-out';
                const ty = Math.max(0, MAX - h);
                if (ty !== lastPX) {
                    el.style.transform = `translateY(${ty}px)`;
                    lastPX = ty; lastH = h;
                }
            }

            function tick() {
                if (!UNDER_DESKTOP()) {
                    if (lastPX !== MAX) {
                        el.style.transition = 'transform .12s ease-out';
                        el.style.transform = `translateY(${MAX}px)`;
                        lastPX = MAX; lastH = 0;
                    }
                    return;
                }
                el.style.display = 'block';

                const h = measureH();
                if (h > lastH) setTransformInstant(h);
                else if (h < lastH) setTransformAnimated(h);
            }

            window.__mobileFooterTick = tick;

            tick();
            addEventListener('resize', tick, { passive: true });
            addEventListener('orientationchange', tick, { passive: true });
            if (window.visualViewport) {
                visualViewport.addEventListener('resize', tick, { passive: true });
                visualViewport.addEventListener('scroll', tick, { passive: true });
            }
        })();

        function computeScrollOffsetWorldFromScrollY() {
            const V = (scene.userData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 10, gapRows: 0 });
            const y = Math.max(0, Math.min(V.yWorld || 0, V.maxWorld || 0));
            const { onePxWorld } = getLayoutMetrics();
            return Math.round(y / (onePxWorld || 1e-6)) * (onePxWorld || 0);
        }




        function isSubDesktopLandscapeNoScroll() {
            return false;
        }

        function isSubDesktopLandscape() {
            const W = STABLE_VP_W || window.innerWidth;
            const H = STABLE_VP_H || window.innerHeight;
            return (W > H) && (W < 1025);
        }


        function setContentTransformFromScroll() {
    if (!contentGroup) return;
    const { w } = getLayoutMetrics();

    if (isLandscapeLike()) {
        const H = (scene.userData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 10, gapCols: 0 });
        const xWorld = Math.max(0, Math.min(H.xWorld || 0, H.maxWorld || 0));

        // déplacement simple, sans recalculs intempestifs
        contentGroup.position.set(-xWorld, 0, 0);

        const last = scene.userData._lastBuildX || 0;
        if (Math.abs(xWorld - last) > w) {
            needsBaseUpdate = true;
            scene.userData._lastBuildX = xWorld;
        }
    } else {
        const V = (scene.userData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 10, gapRows: 0 });
        const yWorld = Math.max(0, Math.min(V.yWorld || 0, V.maxWorld || 0));

        contentGroup.position.set(0, yWorld, 0);

        const last = scene.userData._lastBuildY || 0;
        if (Math.abs(yWorld - last) > w) {
            needsBaseUpdate = true;
            scene.userData._lastBuildY = yWorld;
        }
    }

    const wp = new THREE.Vector3(lastMouseScreenPos.x, lastMouseScreenPos.y, 0).unproject(camera);
    updateMouseSquareTarget(wp);
}





        function updateScrollDocHeight() {
    const spacer = document.getElementById('scroll-spacer');
    if (!spacer) return;

    const stableW = STABLE_VP_W || window.innerWidth;
    const stableH = STABLE_VP_H || window.innerHeight;

    // Nombre d’images trouvées dans img/fractal-art_img
    const imgCount = (imageTextures && imageTextures.length) ? imageTextures.length : 0;

    // --- SCROLL VERTICAL (portrait / mobile-like) ---
    if (!isLandscapeLike()) {
        const { viewHeight, w, menuHeight } = getLayoutMetrics();
        const V = (scene.userData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 0, gapRows: 0 });

        // une "ligne" par image
        V.patternRows = imgCount > 0 ? imgCount : 1;
        V.gapRows = (typeof config.overlayGapCols === 'number' ? config.overlayGapCols : 0.5);

        const gapYWorld = Math.max(0, V.gapRows) * w;

        // 🔥 hauteur totale du contenu en world units
        const totalWorld =
            (V.patternRows * w) +
            Math.max(0, V.patternRows - 1) * gapYWorld;

        // 🔥 zone visible (viewport - header)
        const visibleWorld = Math.max(0, (viewHeight - menuHeight));

        // 🔥 on veut pouvoir scroller jusqu’en bas : maxWorld = total - visible
        V.maxWorld = Math.max(0, totalWorld - visibleWorld);
        mobileWorldContentHeight = totalWorld;

        // On garde le spacer à la taille de la viewport
        spacer.style.height = stableH + 'px';
        spacer.style.width = '1px';
        spacer.style.display = 'block';

        const root = rootScroller();
        root.style.overflowX = 'hidden';
        root.style.overflowY = 'hidden';
        root.style.webkitOverflowScrolling = 'auto';

        // Clamp du scroll courant
        V.yWorld = Math.min(Math.max(0, V.yWorld || 0), V.maxWorld || 0);
        return;
    }

    // --- SCROLL HORIZONTAL (paysage / desktop) ---
    const { w } = getLayoutMetrics();
    const H = (scene.userData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 0, gapCols: 0 });

    const contentCols = contentColsForBucket();

    H.gapCols = (typeof config.overlayGapCols === 'number' ? config.overlayGapCols : 0.5);

    if (imgCount > 0) {
        const slots = Math.ceil(imgCount / 2);
        const minPatternCols = 2 * slots;
        const extraCols = imgCount > 3 ? 1 : 0;
        H.patternCols = Math.max(contentCols, minPatternCols + extraCols);
    } else {
        H.patternCols = contentCols;
    }

    const patternCols = H.patternCols;
    const gapXWorld = Math.max(0, H.gapCols) * w;

    const totalWorld =
        (patternCols * w) +
        Math.max(0, patternCols - 1) * gapXWorld;

    const visibleWorld =
        (contentCols * w) +
        Math.max(0, contentCols - 1) * gapXWorld;

    const extraWorld = Math.max(0, totalWorld - visibleWorld);
    H.maxWorld = extraWorld;

    spacer.style.height = stableH + 'px';
    spacer.style.width = '1px';
    spacer.style.display = 'block';

    const root = rootScroller();
    root.style.overflowX = 'hidden';
    root.style.overflowY = 'hidden';
    root.style.webkitOverflowScrolling = 'auto';

    H.xWorld = Math.min(Math.max(0, H.xWorld || 0), H.maxWorld || 0);
}






        function updateMenuGeometry() {
            const { viewWidth, menuHeight } = getLayoutMetrics();

            menuPlane.scale.set(viewWidth, menuHeight, 1);
            menuPlane.position.set((camera.left + camera.right) / 2, camera.top - menuHeight / 2, 0.1);

            const headerEl = document.getElementById('ui-header');
            const layer = document.getElementById('labels-layer');
            if (headerEl && layer) {
                const headerPx = Math.round(headerEl.getBoundingClientRect().height);
                headerEl.style.maxWidth = '100vw';
                headerEl.style.overflow = 'hidden';

                layer.style.clipPath = `inset(${headerPx}px 0 0 0)`;
                layer.style.webkitClipPath = `inset(${headerPx}px 0 0 0)`;
                layer.style.zIndex = '3';
                document.documentElement.style.setProperty('--menu-h', headerPx + 'px');
            }
        }



        function updateGrainPlaneSize() { if (!grainPlane) return; const h = camera.top - camera.bottom; const w = camera.right - camera.left; grainPlane.scale.set(w, h, 1); }

        (function installStableResizeHandlers() {
    let lastW = Math.round(window.visualViewport?.width || window.innerWidth);
    let lastH = Math.round(window.visualViewport?.height || window.innerHeight);
    let lastOT = Math.round(window.visualViewport?.offsetTop || 0);
    let raf = 0;

    const WIDTH_JIGGLE = 32;
    const HEIGHT_JIGGLE = 260;
    const OFFSET_JIGGLE = 260;

    function snapshotVV() {
        return {
            w: Math.round(window.visualViewport?.width || window.innerWidth),
            h: Math.round(window.visualViewport?.height || window.innerHeight),
            ot: Math.round(window.visualViewport?.offsetTop || 0),
        };
    }

    function orientationFlip(pw, ph, w, h) {
        const prevPortrait = ph >= pw;
        const nowPortrait = h >= w;
        return prevPortrait !== nowPortrait;
    }

    function applyFooterTick() {
        if (typeof window.__mobileFooterTick === 'function') {
            window.__mobileFooterTick();
        }
    }

    function handleResizeNow() {
    raf = 0;
    const { w, h, ot } = snapshotVV();
    const dw = Math.abs(w - lastW);
    const dh = Math.abs(h - lastH);
    const dot = Math.abs(ot - lastOT);

    const flip = orientationFlip(lastW, lastH, w, h);
    const jiggle = !flip && dw <= WIDTH_JIGGLE && (dh <= HEIGHT_JIGGLE || dot <= OFFSET_JIGGLE);

    if (jiggle) {
        syncCssHeaderHeight();
        updateMenuGeometry();
        updateScrollDocHeight();
        updateFreeOverlays();

        const prevWorld = scrollOffsetWorld;
        const nextWorld = computeScrollOffsetWorldFromScrollY();
        scrollOffsetWorld = nextWorld;

        if (mouseSquare?.userData?.anchor) {
            mobileBuildScrollAt += (nextWorld - prevWorld);
        }

        applyFooterTick();
        needsRefineCheck = true;

        lastW = w; lastH = h; lastOT = ot;
        return;
    }

    const aspect = (w || 1) / (h || 1);
    const height = 10;
    const width = height * aspect;

    camera.left   = -width / 2;
    camera.right  =  width / 2;
    camera.top    =  height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();

    renderer.setSize(w, h);

    STABLE_VP_W = w;
    STABLE_VP_H = h;

    updateGrainPlaneSize();
    syncCssHeaderHeight();
    updateMenuGeometry();
    applyFooterTick();

    const newBucket = pickBucket(w, h);
    if (newBucket !== currentBucket) {
        currentBucket = newBucket;
        applyBucket();
        reformGridKeepImages();
        buildFreeOverlays();
        lastGridCursorSizeWorld = computeDefaultGridCursorSize();
        needsRefineCheck = true;
        updateScrollDocHeight();
        installDragSwipeScroll();
    } else {
        updateScrollDocHeight();
        updateFreeOverlays();
        needsRefineCheck = true;
        installDragSwipeScroll();
    }

    syncCategoryLabelSize(getLayoutMetrics());

    lastW = w;
    lastH = h;
    lastOT = ot;
}


    function onResize() {
        if (raf) return;
        raf = requestAnimationFrame(handleResizeNow);
    }

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    if (window.visualViewport) {
        visualViewport.addEventListener('resize', onResize, { passive: true });
        visualViewport.addEventListener('scroll', onResize, { passive: true });
    }
})();




        function forceBrowserToLayoutForHScroll() {
            if (!isLandscapeLike()) {
                const spacer = document.getElementById('scroll-spacer');
                if (!spacer) return;
                const h = spacer.offsetHeight || 0;
                spacer.style.height = (h + 1) + 'px';
                spacer.offsetHeight;
                spacer.style.height = h + 'px';
            }
        }



        function mobileRowsNeeded() {
            const { viewHeight, w, menuHeight } = getLayoutMetrics();
            const rowsVisible = Math.max(1, Math.ceil((viewHeight - menuHeight) / w));
            const V = (scene.userData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 10, gapRows: 0 });
            const rowsScrolled = Math.max(0, Math.floor(Math.max(0, Math.min(V.yWorld || 0, V.maxWorld || 0)) / w));
            const EXTRA_BOTTOM_ROWS = 3;
            const SAFETY_ROWS = 2;
            let rowsPattern = 0;
            if (!isLandscapeLike()) {
                rowsPattern = Math.max(baseRowsPrimary, (V.patternRows || 10) + SAFETY_ROWS);
            }
            return Math.max(
                baseRowsPrimary,
                rowsScrolled + rowsVisible + EXTRA_BOTTOM_ROWS + SAFETY_ROWS,
                rowsPattern
            );
        }



        function isLandscapeLike() {
            const W = STABLE_VP_W || window.innerWidth;
            const H = STABLE_VP_H || window.innerHeight;
            return W > H;
        }

        function computeScrollOffsetWorldFromScrollX() {
            const H = (scene.userData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 10, gapCols: 0 });
            return Math.max(0, Math.min(H.xWorld || 0, H.maxWorld || 0));
        }



        let isScrolling = false;
let scrollTimeout = null;

function onScroll() {
    // On ne fait plus de logique de scroll logique ici,
    // juste un petit flag si tu veux t’en servir plus tard.
    isScrolling = true;
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { isScrolling = false; }, 100);
}





        function installDragSwipeScroll() {
    const dragTarget = document.getElementById('webgl-canvas') || window;
    const html = document.documentElement;
    const body = document.body;

    // Nettoyage des anciens handlers (comme avant)
    if (window.__pointerDrag)   { dragTarget.removeEventListener('pointerdown', window.__pointerDrag);   window.__pointerDrag = null; }
    if (window.__pointerMove)   { window.removeEventListener('pointermove', window.__pointerMove);       window.__pointerMove = null; }
    if (window.__pointerUp)     { window.removeEventListener('pointerup', window.__pointerUp);           window.__pointerUp = null; }
    if (window.__pointerCancel) { window.removeEventListener('pointercancel', window.__pointerCancel);   window.__pointerCancel = null; }
    if (window.__wheelScroll)   { window.removeEventListener('wheel', window.__wheelScroll);             window.__wheelScroll = null; }
    if (window.__arrowScroll)   { window.removeEventListener('keydown', window.__arrowScroll);           window.__arrowScroll = null; }

    const isLand = isLandscapeLike();

    // On verrouille le scroll natif comme avant
    html.style.setProperty('overscroll-behavior-x', 'none', 'important');
    html.style.setProperty('overscroll-behavior-y', 'none', 'important');
    html.style.setProperty('touch-action', 'none', 'important');
    html.style.setProperty('overflow', 'hidden', 'important');

    body.style.setProperty('touch-action', 'none', 'important');
    body.style.setProperty('overflow', 'hidden', 'important');
    body.style.setProperty('position', 'fixed', 'important');
    body.style.setProperty('width', '100%', 'important');
    body.style.setProperty('top', '0', 'important');
    body.style.setProperty('left', '0', 'important');

    if (dragTarget && dragTarget.style) {
        dragTarget.style.setProperty('touch-action', 'none', 'important');
    }

    const pxPerWorldX = () => {
        const pxW = STABLE_VP_W || window.innerWidth;
        const worldW = (camera.right - camera.left) || 1;
        return pxW / worldW;
    };

    const pxPerWorldY = () => {
        const pxH = STABLE_VP_H || window.innerHeight;
        const worldH = (camera.top - camera.bottom) || 1;
        return pxH / worldH;
    };

    // 🔥 Helper : marque qu’on est en train de "scroller logiquement"
    const markLogicalScroll = () => {
        isScrolling = true;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isScrolling = false;
        }, 120); // fenêtre courte après le dernier mouvement
    };

    const setXWorld = (v) => {
        const H = (scene.userData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 10, gapCols: 0 });
        const maxW = Math.max(0, H.maxWorld || 0);
        const next = Math.max(0, Math.min(v, maxW));

        if (next !== H.xWorld) {
            H.xWorld = next;
            markLogicalScroll();          // ⬅️ on note le scroll
        }

        setContentTransformFromScroll();
    };

    const setYWorld = (v) => {
        const V = (scene.userData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 10, gapRows: 0 });
        const maxH = Math.max(0, V.maxWorld || 0);
        const next = Math.max(0, Math.min(v, maxH));

        if (next !== V.yWorld) {
            V.yWorld = next;
            markLogicalScroll();          // ⬅️ on note le scroll
        }

        setContentTransformFromScroll();
    };

    const updateMouseFromClient = (ev) => {
        const W = STABLE_VP_W || window.innerWidth;
        const H = STABLE_VP_H || window.innerHeight;
        const nx = (ev.clientX / W) * 2 - 1;
        const ny = -(ev.clientY / H) * 2 + 1;
        lastMouseScreenPos.set(nx, ny);
        needsRefineCheck = true;
    };

    let dragId = null;
    let startX = 0;
    let startY = 0;
    let startWorld = 0;
    let dragging = false;

    window.__pointerDrag = (ev) => {
        updateMouseFromClient(ev);
        dragging = true;
        dragId = ev.pointerId;
        startX = ev.clientX;
        startY = ev.clientY;
        startWorld = isLand
            ? ((scene.userData._hscroll || {}).xWorld || 0)
            : ((scene.userData._vscroll || {}).yWorld || 0);

        dragTarget.setPointerCapture?.(dragId);
        ev.preventDefault();
    };

    window.__pointerMove = (ev) => {
        if (!dragging || ev.pointerId !== dragId) return;
        updateMouseFromClient(ev);

        if (isLand) {
            const dx = ev.clientX - startX;
            setXWorld(startWorld - dx / pxPerWorldX());
        } else {
            const dy = ev.clientY - startY;
            setYWorld(startWorld - dy / pxPerWorldY());
        }

        ev.preventDefault();
    };

    window.__pointerUp = (ev) => {
        if (ev.pointerId === dragId) {
            updateMouseFromClient(ev);
            dragging = false;
            dragId = null;
            dragTarget.releasePointerCapture?.(ev.pointerId);
            ev.preventDefault();
        }
    };

    window.__pointerCancel = window.__pointerUp;

    dragTarget.addEventListener('pointerdown', window.__pointerDrag, { passive: false });
    window.addEventListener('pointermove', window.__pointerMove, { passive: false });
    window.addEventListener('pointerup', window.__pointerUp, { passive: false });
    window.addEventListener('pointercancel', window.__pointerCancel, { passive: false });

    const WHEEL_SENS = 1;

    window.__wheelScroll = (e) => {
        if (isLand) {
            const absY = Math.abs(e.deltaY);
            const absX = Math.abs(e.deltaX);
            const delta = (absX > absY ? e.deltaX : e.deltaY) * WHEEL_SENS;
            const current = ((scene.userData._hscroll || {}).xWorld || 0);
            setXWorld(current + delta / pxPerWorldX());
        } else {
            const absY = Math.abs(e.deltaY);
            const absX = Math.abs(e.deltaX);
            const delta = (absY >= absX ? e.deltaY : e.deltaX) * WHEEL_SENS;
            const current = ((scene.userData._vscroll || {}).yWorld || 0);
            setYWorld(current + delta / pxPerWorldY());
        }
        e.preventDefault();
    };
    window.addEventListener('wheel', window.__wheelScroll, { passive: false });

    window.__arrowScroll = (e) => {
        if (isLand) {
            const stepPx = Math.round((STABLE_VP_W || window.innerWidth) * 0.25);
            const worldW = (camera.right - camera.left) || 1;
            const stepW = stepPx / ((STABLE_VP_W || window.innerWidth) / worldW);

            if (e.key === 'ArrowRight') {
                const current = ((scene.userData._hscroll || {}).xWorld || 0);
                setXWorld(current + stepW);
                e.preventDefault();
            }
            if (e.key === 'ArrowLeft') {
                const current = ((scene.userData._hscroll || {}).xWorld || 0);
                setXWorld(current - stepW);
                e.preventDefault();
            }
        } else {
            const stepPx = Math.round((STABLE_VP_H || window.innerHeight) * 0.25);
            const worldH = (camera.top - camera.bottom) || 1;
            const stepH = stepPx / ((STABLE_VP_H || window.innerHeight) / worldH);

            if (e.key === 'ArrowDown') {
                const current = ((scene.userData._vscroll || {}).yWorld || 0);
                setYWorld(current + stepH);
                e.preventDefault();
            }
            if (e.key === 'ArrowUp') {
                const current = ((scene.userData._vscroll || {}).yWorld || 0);
                setYWorld(current - stepH);
                e.preventDefault();
            }
        }
    };
    window.addEventListener('keydown', window.__arrowScroll);
}





        function resetFractalRandom() {
            forceRecreateLabelsOnce = true;
            for (const [key, st] of Array.from(fractalState.entries())) {
                if (st.mesh) {
                    contentGroup.remove(st.mesh);
                    meshPool.push(st.mesh);
                }
                if (st.dotMesh) { contentGroup.remove(st.dotMesh); dotMeshPool.push(st.dotMesh); }
                if (st.labelSprite) { scene.remove(st.labelSprite); }
                if (st.domLabelEl) { st.domLabelEl.remove(); st.domLabelEl = null; }
                if (st.baffles) { st.baffles.forEach(b => b.stop()); st.baffles = null; }
                if (st.occluderMesh) { contentGroup.remove(st.occluderMesh); st.occluderMesh = null; }
                fractalState.delete(key);
            }
            if (typeof instantKill !== 'undefined' && instantKill.clear) instantKill.clear();
            targetState.clear();
            imageCells.clear();
            buttonCells.clear();
            imageSlots.clear();
            buttonSlots.clear();
            for (let tries = 0; tries < 50; tries++) {
                reseed();
                targetState.clear();
                imageCells.clear();
                buttonCells.clear();
                imageAssignment.clear && imageAssignment.clear();
                imageSlots.clear();
                buttonSlots.clear();
                const ok = updateFractalBase(true);
                if (ok) {
                    syncStateToMeshes();
                    needsBaseUpdate = false;
                    return;
                }
            }
            ensureFallbackButtons();
            syncStateToMeshes();
            needsBaseUpdate = false;
        }


        function createQuadTree(x, y, size, depth, path, maxDepthOverride = -1) {
            if (!isInCullWindow(x, y, size)) return;
            const salt = ((scene?.userData?._randSalt | 0) >>> 0);
            const n = (noise2D(x * config.noiseScale, y * config.noiseScale) + 1) / 2;
            const baseRegional = (maxDepthOverride !== -1) ? maxDepthOverride : (config.minDepth + Math.floor(n * config.maxDepthVariation));
            let hardCap = (typeof TARGET_DEPTH === 'number' && TARGET_DEPTH > 0) ? TARGET_DEPTH : baseRegional;
            if (maxDepthOverride !== -1) hardCap = Math.max(hardCap, maxDepthOverride);
            const regionalMaxDepth = Math.min(baseRegional, hardCap);
            const currentProbability = config.initialProbabilityToSubdivide - depth * config.depthDecayFactor;
            const ix = (Math.fround(x * 8192) | 0) >>> 0;
            const iy = (Math.fround(y * 8192) | 0) >>> 0;
            let h = saltedKey(path, salt) ^ Math.imul(ix ^ (depth * 127), 374761393) ^ Math.imul(iy ^ (depth * 131), 668265263) ^ salt;
            h = (h >>> 0) & 0x7fffffff;
            const r1 = h / 2147483647;
            const r2 = (noise2D(x * config.noiseScale * 0.5 + 13.37, y * config.noiseScale * 0.5 - 9.21) + 1) / 2;
            const rand = Math.min(1, Math.max(0, 0.7 * r1 + 0.3 * r2));
            const stop = depth >= regionalMaxDepth || (depth > 0 && rand > currentProbability) || size / 2 <= config.borderWidth;
            if (stop) {
                const scale = size - config.borderWidth;
                if (scale > 0) {
                    targetState.set(path, { x, y, size: scale, depth, path, originalSize: size });
                }
                return;
            }
            const ns = size / 2, o = size / 4, d = depth + 1;
            createQuadTree(x - o, y + o, ns, d, path + '/0', maxDepthOverride);
            createQuadTree(x + o, y + o, ns, d, path + '/1', maxDepthOverride);
            createQuadTree(x - o, y - o, ns, d, path + '/2', maxDepthOverride);
            createQuadTree(x + o, y - o, ns, d, path + '/3', maxDepthOverride);
        }



        const CONTENT_COLS = 4;
        const NO_D1_CONTENT_COLS = new Set([1, 2]);
        const D1_EXCEPTIONS = new Set();


        function contentOffsetColsForBucket() {
            if (isShortPortrait()) return 0;

            if (isTabletLandscapeStrict()) return 0;

            const contentCols = contentColsForBucket();
            return Math.max(0, (baseCols - contentCols) / 2);
        }



        function contentColsForBucket() {
            if (currentBucket === 'mobile-v' || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16') {
                return 2;
            }
            return CONTENT_COLS;
        }


        function addPrimaryRowSideFillers(row, offsetCols) {
            if (isShortPortrait()) return;
            if (isTabletLandscapeStrict()) return;

            const { w, contentTop } = getLayoutMetrics();
            const y = contentTop - row * w - w / 2;

            const innerLeftEdge = camera.left + offsetCols * w;

            const x = innerLeftEdge - 0.5 * w;
            const p = `filler/L/${row}/0`;
            createQuadTree(x, y, w, 1, p, -1);
        }

        function addRightFillersForOverlayPattern(row, offsetCols, maxMeshX) {
            const { w, contentTop } = getLayoutMetrics();
            const y = contentTop - row * w - w / 2;

            const contentCols = contentColsForBucket();

            const H = (scene.userData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 10, gapCols: 0 });
            const patternCols = H.patternCols || 10;
            H.gapCols = (typeof config.overlayGapCols === 'number' ? config.overlayGapCols : 0.5);
            const gapXWorld = Math.max(0, H.gapCols) * w;

            const baseX = camera.left + (offsetCols + 0.5) * w;
            const lastCenterX = baseX + (patternCols - 1) * (w + gapXWorld);
            let rightEdge = lastCenterX + w / 2;

            // Ensure we cover the requested generation bounds for infinite scroll
            if (maxMeshX !== undefined && maxMeshX > rightEdge) {
                rightEdge = maxMeshX;
            }

            const innerRightEdge = camera.left + (offsetCols + contentCols) * w;

            const stepX = w;
            const startX = innerRightEdge + w / 2;

            const EPS = 1e-6;
            let i = 0;
            for (let cx = startX; cx - w / 2 <= rightEdge + EPS; cx += stepX) {
                const p = `fillR/${row}/${i++}`;
                createQuadTree(cx, y, w, 1, p, -1);
            }
        }



        function addUltrawideRightFiller(row, offsetCols) {
            return;
        }


        function getGenerationBounds() {
            const { w, viewHeight, viewWidth, contentTop } = getLayoutMetrics();
            const GEN_BUFFER = 2.5;

            // Vertical
            const V = scene.userData._vscroll || { yWorld: 0 };
            const yWorld = V.yWorld || 0;
            const bufferPxV = viewHeight * GEN_BUFFER;

            // Visible + Buffer: [camera.bottom - yWorld - bufferPxV, camera.top - yWorld + bufferPxV]
            const minMeshY = camera.bottom - yWorld - bufferPxV;
            const maxMeshY = camera.top - yWorld + bufferPxV;

            const topY = contentTop - w / 2;
            let minRow = Math.floor((topY - maxMeshY) / w);
            let maxRow = Math.ceil((topY - minMeshY) / w);
            minRow = Math.max(0, minRow);
            // Ensure we cover at least baseRowsPrimary
            maxRow = Math.max(maxRow, baseRowsPrimary);

            // Horizontal
            const H = scene.userData._hscroll || { xWorld: 0 };
            const xWorld = H.xWorld || 0;
            const bufferPxH = viewWidth * GEN_BUFFER;

            // Visible + Buffer: [camera.left + xWorld - bufferPxH, camera.right + xWorld + bufferPxH]
            const minMeshX = camera.left + xWorld - bufferPxH;
            const maxMeshX = camera.right + xWorld + bufferPxH;

            const offsetCols = contentOffsetColsForBucket();
            const colBase = camera.left + (offsetCols + 0.5) * w;

            let minCol = Math.floor((minMeshX - colBase) / w);
            let maxCol = Math.ceil((maxMeshX - colBase) / w);
            minCol = Math.max(0, minCol);

            return { minRow, maxRow, minCol, maxCol, maxMeshX };
        }

        function updateFractalBase(forceFull = false) {
    if (forceFull) targetState.clear();

    const { w } = getLayoutMetrics();
    const preset = presetForBucket(currentBucket);

    if (!preset) {
        ensureFallbackButtons();
        return true;
    }

    // Bounds based on scroll + buffer
    const bounds = getGenerationBounds();

    if (isMobileBucket()) {
       // Mobile: ensure we cover patternRows
       const V = scene.userData._vscroll;
       const patRows = (V && V.patternRows) ? V.patternRows : 0;
       // getGenerationBounds covers visible area. If pattern is visible, it will be covered.
       // We also ensure we cover at least the "needed" rows if we are near the top, to avoid initial glitches
       const needed = mobileRowsNeeded();
       if (bounds.maxRow < needed) bounds.maxRow = needed;
    }

    const FORCE_D1 = new Set();
    (preset?.buttons || []).forEach(b => { FORCE_D1.add(`content/${b.row}/${b.col}`); });
    (preset?.imagesD2 || []).forEach(im => { FORCE_D1.add(`content/${im.row}/${im.col}`); });

    const offsetCols = contentOffsetColsForBucket();
    const contentCols = contentColsForBucket();

    // --- création de la base content/filler ---
    for (let row = bounds.minRow; row < bounds.maxRow; row++) {
        const isPrimary = row < baseRowsPrimary;
        const colsThisRow = isPrimary ? Math.min(contentCols, baseCols) : baseCols;

        for (let col = 0; col < colsThisRow; col++) {
            const pref = isPrimary ? 'content' : 'filler';
            const path = `${pref}/${row}/${col}`;

            const x = camera.left + (col + 0.5 + (isPrimary ? offsetCols : 0)) * w;
            const y = (getLayoutMetrics().contentTop) - row * w - w / 2;

            const forceThisCell = (pref === 'content') && FORCE_D1.has(path);
            createQuadTree(x, y, w, 1, path, forceThisCell ? 1 : -1);
        }

        if (isPrimary) addPrimaryRowSideFillers(row, offsetCols);

        // Right Fillers (Infinite Horizontal)
        addRightFillersForOverlayPattern(row, offsetCols, bounds.maxMeshX);

        // Ultrawide
         if (currentBucket === 'desktop-21:9' || currentBucket === 'desktop-32:9') {
            addUltrawideRightFiller(row, offsetCols);
        }
    }

    if (!isMobileBucket()) {
        enforceNoD1InColumns(NO_D1_CONTENT_COLS);
        enforceNoD1InSideFillers();

        const requiredD2 = (BUTTONS_ON_D2 ? REQUIRED_BUTTONS : 0) + WANT_D2;
        const protectedD1Paths = new Set();
        (preset?.buttons || []).forEach(b => {
            if (b.size === 'D1') protectedD1Paths.add(`content/${b.row}/${b.col}`);
        });

        ensureMinDepth2Cells(requiredD2, 0, protectedD1Paths);
    }

    if (isMobileBucket()) {
        forceMobilePattern();
    }

    // Nettoyage / contraintes générales
    cutOutUnderButtons();
    dedupeTargetState();
    forceNoD1GlobalExceptFixed();

    // ⚠️ IMPORTANT : on ne fait des raffinements aléatoires que lors
    // d'une reconstruction "complète" (forceFull = true).
    // Les rebuilds dus au scroll (forceFull = false) n'ajoutent plus
    // de subdivisions partout dans la grille.
    if (forceFull) {
        sprinkleRefinements(isMobileBucket() ? 12 : 12);
    }

    if (!isMobileBucket() && isLandscapeLike()) {
        enforceD2AdjacencyConstraint();
    }

    if (!isMobileBucket()) {
        enforceDepth6AdjacencyConstraint();
        enforceNoD1InColumns(NO_D1_CONTENT_COLS);
    }

    ensureCoverage();
    targetStateDirty = true;
    return true;
}



        function enforceD2AdjacencyConstraint() {
            const { w } = getLayoutMetrics();
            const d2Size = w / 2;
            const eps = 1e-6;

            // Collect all D2 squares (size w/2)
            const d2Squares = [];
            for (const [path, sq] of targetState.entries()) {
                if (Math.abs(sq.originalSize - d2Size) < eps) {
                    d2Squares.push({ path, sq });
                }
            }

            if (d2Squares.length === 0) return;

            const areAdjacent = (sq1, sq2) => {
                const h1 = sq1.originalSize / 2;
                const h2 = sq2.originalSize / 2;
                const dx = Math.abs(sq1.x - sq2.x);
                const dy = Math.abs(sq1.y - sq2.y);

                const adjH = Math.abs(dy) < eps && Math.abs(dx - (h1 + h2)) < eps;
                const adjV = Math.abs(dx) < eps && Math.abs(dy - (h1 + h2)) < eps;

                return adjH || adjV;
            };

            const toSubdivide = new Set();
            for (let i = 0; i < d2Squares.length; i++) {
                for (let j = i + 1; j < d2Squares.length; j++) {
                    const item1 = d2Squares[i];
                    const item2 = d2Squares[j];

                    const sameSize = Math.abs(item1.sq.originalSize - item2.sq.originalSize) < eps;
                    if (sameSize && areAdjacent(item1.sq, item2.sq)) {
                        toSubdivide.add(item2.path);
                    }
                }
            }

            for (const path of toSubdivide) {
                const sq = targetState.get(path);
                if (!sq) continue;
                if (imageCells.has(path) || buttonCells.has(path)) continue;

                targetState.delete(path);
                const { x, y, originalSize: os, depth: d } = sq;
                const ns = os / 2, nd = d + 1, o = os / 4;
                createQuadTree(x - o, y + o, ns, nd, path + '/0', -1);
                createQuadTree(x + o, y + o, ns, nd, path + '/1', -1);
                createQuadTree(x - o, y - o, ns, nd, path + '/2', -1);
                createQuadTree(x + o, y - o, ns, nd, path + '/3', -1);
            }
        }


        function enforceDepth6AdjacencyConstraint() {
            const eps = 1e-6;
            const targetDepth = 5;

            const depth5Squares = [];
            for (const [path, sq] of targetState.entries()) {
                if (sq.depth === targetDepth) {
                    depth5Squares.push({ path, sq });
                }
            }

            if (depth5Squares.length === 0) return;

            const areAdjacent = (sq1, sq2) => {
                const h1 = sq1.originalSize / 2;
                const h2 = sq2.originalSize / 2;
                const dx = Math.abs(sq1.x - sq2.x);
                const dy = Math.abs(sq1.y - sq2.y);

                const adjH = Math.abs(dy) < eps && Math.abs(dx - (h1 + h2)) < eps;
                const adjV = Math.abs(dx) < eps && Math.abs(dy - (h1 + h2)) < eps;

                return adjH || adjV;
            };

            const toSubdivide = new Set();
            for (const item1 of depth5Squares) {
                let adjacentCount = 0;
                const adjacentItems = [];

                for (const item2 of depth5Squares) {
                    if (item1.path === item2.path) continue;
                    if (areAdjacent(item1.sq, item2.sq)) {
                        adjacentCount++;
                        adjacentItems.push(item2);
                        if (adjacentCount > 4) break;
                    }
                }

                if (adjacentCount > 2) {
                    for (let i = 2; i < adjacentItems.length; i++) {
                        toSubdivide.add(adjacentItems[i].path);
                    }
                }
            }

            for (const path of toSubdivide) {
                const sq = targetState.get(path);
                if (!sq) continue;
                if (imageCells.has(path) || buttonCells.has(path)) continue;

                targetState.delete(path);
                const { x, y, originalSize: os, depth: d } = sq;
                const ns = os / 2, nd = d + 1, o = os / 4;
                createQuadTree(x - o, y + o, ns, nd, path + '/0', -1);
                createQuadTree(x + o, y + o, ns, nd, path + '/1', -1);
                createQuadTree(x - o, y - o, ns, nd, path + '/2', -1);
                createQuadTree(x + o, y - o, ns, nd, path + '/3', -1);
            }
        }


        function forceMobilePattern() {
            if (!isMobileBucket()) return;

            const { w } = getLayoutMetrics();

            const subdivideToD2 = (path, s) => {
                if (Math.abs(s.originalSize - w) > 1e-6) return;

                targetState.delete(path);

                const size = s.originalSize;
                const ns = size / 2;
                const d = 2;
                const o = size / 4;
                const childSize = Math.max(0, ns - config.borderWidth);

                const add = (suffix, dx, dy) => {
                    const p = path + suffix;
                    targetState.set(p, {
                        x: s.x + dx,
                        y: s.y + dy,
                        size: childSize,
                        depth: d,
                        path: p,
                        originalSize: ns
                    });
                };

                add('/0', -o, +o);
                add('/1', +o, +o);
                add('/2', -o, -o);
                add('/3', +o, -o);
            };

            for (const [path, s] of Array.from(targetState.entries())) {
                if (path.startsWith('content/')) subdivideToD2(path, s);
            }
            for (const [path, s] of Array.from(targetState.entries())) {
                if (path.startsWith('filler/')) subdivideToD2(path, s);
            }
            for (const [path, s] of Array.from(targetState.entries())) {
                if (path.startsWith('btn/')) continue;
                if (Math.abs(s.originalSize - w) > 1e-6) continue;
                subdivideToD2(path, s);
            }
        }



        function cutOutUnderButtons() {
            const { onePxWorld } = getLayoutMetrics();
            const insetPx = Math.max(MOBILE_BTN_OCCLUDER_PAD_PX || 1, 1);
            const inset = insetPx * onePxWorld;
            const eps = Math.max(config.borderWidth * 0.5, 0);
            const rects = [];
            const pushRect = (s) => {
                const h = s.originalSize / 2;
                rects.push({
                    left: s.x - h + inset - eps,
                    right: s.x + h - inset + eps,
                    bottom: s.y - h + inset - eps,
                    top: s.y + h - inset + eps
                });
            };
            for (const [btnPath] of buttonCells.entries()) {
                const s = targetState.get(btnPath);
                if (s) pushRect(s);
            }
            for (const imgPath of imageCells) {
                const s = targetState.get(imgPath);
                if (s) pushRect(s);
            }
            if (rects.length === 0) return;
            const intersects = (tile, r) => {
                const h = tile.originalSize / 2;
                const L = tile.x - h, R = tile.x + h, B = tile.y - h, T = tile.y + h;
                return !(R <= r.left || L >= r.right || T <= r.bottom || B >= r.top);
            };
            for (const [path, s] of Array.from(targetState.entries())) {
                if (buttonCells.has(path) || imageCells.has(path)) continue;
                for (const r of rects) {
                    if (intersects(s, r)) {
                        targetState.delete(path);
                        if (typeof instantKill !== 'undefined' && instantKill.add) instantKill.add(path);
                        break;
                    }
                }
            }
        }



        function dedupeTargetState() {
            const { onePxWorld } = getLayoutMetrics();
            const EPS = Math.max(1e-6, (onePxWorld || 0.001) * 0.45);
            const keyOf = s => `${Math.round(s.x / EPS)}|${Math.round(s.y / EPS)}|${Math.round(s.originalSize / EPS)}`;
            const rank = (path) => {
                if (imageCells.has(path)) return 100;
                if (buttonCells.has(path)) return 90;
                if (path.startsWith('content/')) return 80;
                if (/^filler\/[LR]/.test(path)) return 70;
                if (path.startsWith('filler/')) return 60;
                if (path.startsWith('fillR/')) return 50;
                if (path.startsWith('rib/')) return 95;
                return 10;
            };
            const items = Array.from(targetState.entries()).map(([path, s]) => ({ path, s })).sort((a, b) => rank(b.path) - rank(a.path));
            const kept = new Set();
            const keptBoxes = [];
            const box = (s) => { const h = s.originalSize * 0.5; return { L: s.x - h, R: s.x + h, B: s.y - h, T: s.y + h }; };
            const overlap = (A, B) => {
                const w = Math.max(0, Math.min(A.R, B.R) - Math.max(A.L, B.L));
                const h = Math.max(0, Math.min(A.T, B.T) - Math.max(A.B, B.B));
                return (w >= EPS && h >= EPS);
            };
            for (const it of items) {
                const b = box(it.s);
                let collides = false;
                for (const kb of keptBoxes) { if (overlap(b, kb)) { collides = true; break; } }
                if (!collides) {
                    kept.add(it.path);
                    keptBoxes.push(b);
                }
            }
            for (const [path] of Array.from(targetState.entries())) { if (!kept.has(path)) { targetState.delete(path); if (typeof instantKill !== 'undefined' && instantKill.add) instantKill.add(path); } }
        }


        function forceNoD1GlobalExceptFixed() {
            const { w } = getLayoutMetrics();
            const toSplit = [];

            for (const [path, s] of targetState.entries()) {
                if (imageCells.has(path)) continue;

                if (Math.abs(s.originalSize - w) < 1e-6) {
                    toSplit.push({ path, s });
                }
            }

            for (const { path, s } of toSplit) {
                targetState.delete(path);
                const size = s.originalSize;
                const ns = size / 2;
                const nd = (s.depth || 1) + 1;
                const o = size / 4;

                createQuadTree(s.x - o, s.y + o, ns, nd, path + '/0', -1);
                createQuadTree(s.x + o, s.y + o, ns, nd, path + '/1', -1);
                createQuadTree(s.x - o, s.y - o, ns, nd, path + '/2', -1);
                createQuadTree(s.x + o, s.y - o, ns, nd, path + '/3', -1);
            }
        }



        function enforceNoD1InColumns(colsSet) {
            const { w, contentTop } = getLayoutMetrics();
            const toSplit = [];

            for (const [path, s] of targetState.entries()) {
                if (!path.startsWith('content/')) continue;

                const m = path.match(/^content\/(\d+)\/(\d+)$/);
                if (!m) continue;

                const col = parseInt(m[2], 10);
                if (!colsSet.has(col)) continue;

                if (Math.abs(s.originalSize - w) > 1e-6) continue;
                if (!isVisibleEnough(s.x, s.y, s.originalSize, contentTop, 0.05)) continue;

                toSplit.push({ path, s });
            }

            for (const { path, s } of toSplit) {
                targetState.delete(path);

                const size = s.originalSize;
                const ns = size / 2;
                const d = 2;
                const o = size / 4;

                const quads = [
                    { x: s.x - o, y: s.y + o, suffix: '/0' },
                    { x: s.x + o, y: s.y + o, suffix: '/1' },
                    { x: s.x - o, y: s.y - o, suffix: '/2' },
                    { x: s.x + o, y: s.y - o, suffix: '/3' },
                ];

                for (const q of quads) {
                    if (!isVisibleEnough(q.x, q.y, ns, contentTop, 0.05)) continue;
                    const p = path + q.suffix;
                    targetState.set(p, {
                        x: q.x, y: q.y,
                        size: ns - config.borderWidth,
                        depth: d, path: p, originalSize: ns
                    });
                }
            }
        }


        function enforceNoD1InSideFillers() {
            const { w, contentTop } = getLayoutMetrics();
            const toSplit = [];
            for (const [path, s] of targetState.entries()) {
                if (!path.startsWith('filler/')) continue;
                if (Math.abs(s.originalSize - w) > 1e-6) continue;
                if (!isVisibleEnough(s.x, s.y, s.originalSize, contentTop, 0.05)) continue;
                toSplit.push({ path, s });
            }
            for (const { path, s } of toSplit) {
                targetState.delete(path);
                const size = s.originalSize;
                const ns = size / 2;
                const d = 2;
                const o = size / 4;
                const quads = [
                    { x: s.x - o, y: s.y + o, suffix: '/0' },
                    { x: s.x + o, y: s.y + o, suffix: '/1' },
                    { x: s.x - o, y: s.y - o, suffix: '/2' },
                    { x: s.x + o, y: s.y - o, suffix: '/3' },
                ];
                for (const q of quads) {
                    if (!isVisibleEnough(q.x, q.y, ns, contentTop, 0.05)) continue;
                    const p = path + q.suffix;
                    targetState.set(p, {
                        x: q.x, y: q.y,
                        size: ns - config.borderWidth,
                        depth: d, path: p, originalSize: ns
                    });
                }
            }
        }


        function specToPath(spec, contentTop, w) {
            if (!spec) return null;

            if (spec.size === 'D1') {
                const quad = (typeof spec.quad === 'number') ? spec.quad : 0;
                return ensureD2Path(spec.row, spec.col, quad, contentTop, w);
            }

            if (spec.size === 'D2') {
                return ensureD2Path(spec.row, spec.col, spec.quad, contentTop, w);
            }

            return null;
        }


        function reformGridKeepImages() {
    scene.userData = scene.userData || {};
    scene.userData._regenNonce = ((scene.userData._regenNonce | 0) + 1) | 0;
    globalClickNonce = (globalClickNonce + 1) | 0;
    forceRecreateLabelsOnce = true;
    reseed(globalClickNonce);

    // on garde uniquement les états liés aux images
    for (const [key, st] of Array.from(fractalState.entries())) {
        if (st.isImage) continue;

        if (st.mesh) {
            contentGroup.remove(st.mesh);
            meshPool.push(st.mesh);
        }
        if (st.dotMesh) {
            contentGroup.remove(st.dotMesh);
            dotMeshPool.push(st.dotMesh);
        }
        if (st.labelSprite) {
            scene.remove(st.labelSprite);
        }
        if (st.domLabelEl) {
            st.domLabelEl.remove();
            st.domLabelEl = null;
        }
        if (st.baffles) {
            st.baffles.forEach(b => b.stop());
            st.baffles = null;
        }
        if (st.occluderMesh) {
            contentGroup.remove(st.occluderMesh);
            st.occluderMesh = null;
        }
        fractalState.delete(key);
    }

    if (typeof instantKill !== 'undefined' && instantKill.clear) instantKill.clear();

    targetState.clear();
    buttonCells.clear();
    buttonSlots.clear();
    imageSlots.clear();

    if (isMobileBucket()) mobileWorldContentHeight = 0;

    // 🔁 ici on veut un rebuild "riche" (clic → nouvelle fractale),
    // donc on utilise forceFull = true pour réactiver sprinkleRefinements.
    updateFractalBase(true);
    buildFreeOverlays();
    syncStateToMeshes();
    needsRefineCheck = true;
    updateScrollDocHeight();
    forceBrowserToLayoutForHScroll();
}



        function simplifyGrid() {
            const groups = new Map();
            for (const [path, s] of targetState.entries()) {
                if (imageCells.has(path) || buttonCells.has(path)) continue;
                if (s.depth <= 2) continue;

                const lastSlash = path.lastIndexOf('/');
                const parentPath = path.substring(0, lastSlash);

                if (!groups.has(parentPath)) groups.set(parentPath, []);
                groups.get(parentPath).push({ path, s });
            }

            for (const [parentPath, children] of groups.entries()) {
                if (children.length !== 4) continue;

                const depth = children[0].s.depth;
                if (!children.every(c => c.s.depth === depth)) continue;

                let chance = 0;
                if (depth === 6) chance = 0.85;
                else if (depth === 5) chance = 0.5;
                else if (depth === 4) chance = 0.2;

                if (rngFn() < chance) {
                    for (const c of children) targetState.delete(c.path);

                    const c0 = children[0].s;
                    const size = c0.originalSize * 2;
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    for (const c of children) {
                        minX = Math.min(minX, c.s.x - c.s.originalSize / 2);
                        maxX = Math.max(maxX, c.s.x + c.s.originalSize / 2);
                        minY = Math.min(minY, c.s.y - c.s.originalSize / 2);
                        maxY = Math.max(maxY, c.s.y + c.s.originalSize / 2);
                    }
                    const centerX = (minX + maxX) / 2;
                    const centerY = (minY + maxY) / 2;

                    targetState.set(parentPath, {
                        x: centerX,
                        y: centerY,
                        size: size - config.borderWidth,
                        depth: depth - 1,
                        path: parentPath,
                        originalSize: size
                    });
                }
            }
        }

        function presetForBucket(id) {
            if (id === 'mobile-h') return PRESETS['desktop-16:9'];
            return PRESETS[id] || PRESETS['desktop-16:9'];
        }

        function ensureD2Path(row, col, quad, contentTop, w) {
            const force = isSubDesktopLandscape();

            const parent = `content/${row}/${col}`;
            const child = `${parent}/${quad}`;

            const sChild = targetState.get(child);
            if (sChild) {
                if (!force && !isVisibleEnough(sChild.x, sChild.y, sChild.originalSize, contentTop, 0.40)) return null;
                return child;
            }

            const s = targetState.get(parent);
            if (!s) return null;
            if (Math.abs(s.originalSize - w) > 1e-6) return null;
            if (!force && !isVisibleEnough(s.x, s.y, s.originalSize, contentTop, 0.05)) return null;

            targetState.delete(parent);
            const size = s.originalSize, ns = size / 2, d = 2, o = size / 4;
            const quads = [
                { x: s.x - o, y: s.y + o, suffix: '/0' },
                { x: s.x + o, y: s.y + o, suffix: '/1' },
                { x: s.x - o, y: s.y - o, suffix: '/2' },
                { x: s.x + o, y: s.y - o, suffix: '/3' },
            ];
            for (const q of quads) {
                if (!force && !isVisibleEnough(q.x, q.y, ns, contentTop, 0.05)) continue;
                const p = parent + q.suffix;
                targetState.set(p, { x: q.x, y: q.y, size: ns - config.borderWidth, depth: 2, path: p, originalSize: ns });
            }

            const sNew = targetState.get(child);
            if (!sNew) return null;
            if (!force && !isVisibleEnough(sNew.x, sNew.y, sNew.originalSize, contentTop, 0.40)) return null;
            return child;
        }




        function ensureFallbackButtons() {
            const { w, contentTop } = getLayoutMetrics();
            const candidates = [];
            for (const [path, s] of targetState.entries()) {
                if (!path.startsWith('content/')) continue;
                if (!isFullyVisible(s.x, s.y, s.originalSize, contentTop)) continue;
                candidates.push({ path, s });
            }
            candidates.sort((a, b) => a.s.y === b.s.y ? a.s.x - b.s.x : b.s.y - a.s.y);

            const need = Math.min(REQUIRED_BUTTONS, candidates.length);
            const keys = ['motion', 'ui', 'fractal', 'random', 'code'];

            for (let i = 0; i < need; i++) {
                const p = candidates[i].path;
                const spec = CATEGORIES.find(c => c.key === keys[i % keys.length]);
                if (!spec) continue;
                buttonCells.set(p, { label: spec.label, url: spec.url, key: spec.key });
                if (!persistentButtonPaths.includes(p)) persistentButtonPaths.push(p);
            }
        }



        function ensureMinDepth2Cells(required, preserveD1Count, protectedD1Paths = new Set()) {
            const { w, contentTop } = getLayoutMetrics();
            let d1 = [], d2 = [];
            for (const [path, s] of targetState.entries()) {
                if (!path.startsWith('content/')) continue;
                if (!isFullyVisible(s.x, s.y, s.originalSize, contentTop)) continue;
                if (Math.abs(s.originalSize - w) < 1e-6) {
                    if (!protectedD1Paths.has(path)) d1.push({ path, s });
                }
                if (Math.abs(s.originalSize - w / 2) < 1e-6) {
                    d2.push({ path, s });
                }
            }
            if (d2.length < required) {
                const salt = ((scene?.userData?._randSalt | 0) >>> 0);
                d1.sort((a, b) => saltedKey(a.path, salt) - saltedKey(b.path, salt));
                let remainingD1 = d1.length;
                for (const { path, s } of d1) {
                    if (d2.length >= required) break;
                    if ((remainingD1 - 1) < preserveD1Count) break;
                    targetState.delete(path); remainingD1--;
                    const size = s.originalSize, ns = size / 2, d = 2, o = size / 4;
                    const quads = [
                        { x: s.x - o, y: s.y + o, suffix: '/0' },
                        { x: s.x + o, y: s.y + o, suffix: '/1' },
                        { x: s.x - o, y: s.y - o, suffix: '/2' },
                        { x: s.x + o, y: s.y - o, suffix: '/3' },
                    ];
                    for (const q of quads) {
                        if (!isVisibleEnough(q.x, q.y, ns, contentTop, 0.05)) continue;
                        const p = path + q.suffix;
                        targetState.set(p, { x: q.x, y: q.y, size: ns - config.borderWidth, depth: d, path: p, originalSize: ns });
                        d2.push({ path: p, s: targetState.get(p) });
                        if (d2.length >= required) break;
                    }
                }
            }
            if (!isMobileBucket()) {
                const pathUnderFirstImage = 'content/1/0';
                const s = targetState.get(pathUnderFirstImage);
                if (s && Math.abs(s.originalSize - w) < 1e-6 && isVisibleEnough(s.x, s.y, s.originalSize, contentTop, 0.05)) {
                    targetState.delete(pathUnderFirstImage);
                    const size = s.originalSize, ns = size / 2, d = 2, o = size / 4;
                    const quads = [
                        { x: s.x - o, y: s.y + o, suffix: '/0' },
                        { x: s.x + o, y: s.y + o, suffix: '/1' },
                        { x: s.x - o, y: s.y - o, suffix: '/2' },
                        { x: s.x + o, y: s.y - o, suffix: '/3' },
                    ];
                    for (const q of quads) {
                        if (!isVisibleEnough(q.x, q.y, ns, contentTop, 0.05)) continue;
                        const p = pathUnderFirstImage + q.suffix;
                        targetState.set(p, { x: q.x, y: q.y, size: ns - config.borderWidth, depth: d, path: p, originalSize: ns });
                    }
                }
            }
        }



        function buildMobileButtonsDeterministic() {
            imageCells.clear();
            buttonCells.clear();
            persistentButtonPaths = [];
            return true;
        }


        function sprinkleRefinements(maxOps = 24) {
            const { w, contentTop } = getLayoutMetrics();
            const isMobileLike = isMobileBucket();

            if (isMobileLike) refineHaloAroundFixed(56);

            const nonce = (scene.userData && (scene.userData._regenNonce | 0)) || 0;
            const saltFront = ((sessionSalt ^ 0x5151) + ((nonce * 0x9e3779b9) | 0)) | 0;
            const saltAll = ((sessionSalt ^ 0xABCDEF) + ((nonce * 0x9e3779b9) | 0)) | 0;

            const refineOnce = (it) => {
                targetState.delete(it.path);
                const { x, y, originalSize: os, depth: d, path: p } = it.s;
                const ns = os / 2, nd = d + 1, o = os / 4;
                createQuadTree(x - o, y + o, ns, nd, p + '/0', -1);
                createQuadTree(x + o, y + o, ns, nd, p + '/1', -1);
                createQuadTree(x - o, y - o, ns, nd, p + '/2', -1);
                createQuadTree(x + o, y - o, ns, nd, p + '/3', -1);
            };

            let ops = 0;

            const candidates = [];
            for (const [path, s] of targetState.entries()) {
                // Unified logic: treat content and filler exactly the same
                if (!isMobileLike && !(path.startsWith('content/') || path.startsWith('filler/'))) continue;
                if (imageCells.has(path) || buttonCells.has(path)) continue;
                if (s.depth >= TARGET_DEPTH) continue;

                if (isMobileLike && Math.abs(s.originalSize - w / 2) < 1e-6) {
                    if (rngFn() > (config.refineChanceD2 ?? 0.3)) continue;
                }
                candidates.push({ path, s });
            }

            candidates.sort((a, b) => saltedKey(a.path, saltAll) - saltedKey(b.path, saltAll));

            for (const it of candidates) {
                if (ops >= maxOps) break;
                refineOnce(it); ops++;
            }
        }


        function refineHaloAroundFixed(maxOps = 56) {
            return 0; // Disabled for uniformity
            /*
            const { w, contentTop } = getLayoutMetrics();
            const d2Size = w / 2;

            const rects = [];
            for (const [p] of buttonCells) {
              const s = targetState.get(p); if (!s) continue;
              const h = s.originalSize / 2;
              rects.push({ left: s.x - h, right: s.x + h, bottom: s.y - h, top: s.y + h });
            }
            for (const p of imageCells) {
              const s = targetState.get(p); if (!s) continue;
              const h = s.originalSize / 2;
              rects.push({ left: s.x - h, right: s.x + h, bottom: s.y - h, top: s.y + h });
            }
            if (!rects.length) return 0;

            const inner = d2Size * (config.mobileHaloInner ?? 0.0);
            const outer = d2Size * (config.mobileHaloOuter ?? 1.0);
            const chance = config.mobileHaloChance ?? 0.6;

            const cand = [];
            for (const [path, s] of targetState.entries()) {
              if (!path.startsWith('content/')) continue;
              if (buttonCells.has(path) || imageCells.has(path)) continue;
              if (s.depth >= TARGET_DEPTH) continue;
              if (Math.abs(s.originalSize - d2Size) > 1e-6) continue;
              if (!isVisibleEnough(s.x, s.y, s.originalSize, contentTop, 0.05)) continue;

              let d = Infinity, cx = s.x, cy = s.y;
              for (const r of rects) {
                const dx = Math.max(r.left - cx, 0, cx - r.right);
                const dy = Math.max(r.bottom - cy, 0, cy - r.top);
                d = Math.min(d, Math.hypot(dx, dy));
              }
              if (d >= inner && d <= outer) cand.push({ path, s, d });
            }

            cand.sort((a, b) => a.d - b.d);

            let ops = 0;
            for (const it of cand) {
              if (ops >= maxOps) break;
              if (rngFn() > chance) continue;              // 👈
              targetState.delete(it.path);
              const { x, y, originalSize: os, depth: d, path: p } = it.s;
              const ns = os / 2, nd = d + 1, o = os / 4;
              createQuadTree(x - o, y + o, ns, nd, p + '/0', -1);
              createQuadTree(x + o, y + o, ns, nd, p + '/1', -1);
              createQuadTree(x - o, y - o, ns, nd, p + '/2', -1);
              createQuadTree(x + o, y - o, ns, nd, p + '/3', -1);
              ops++;
            }
            return ops;
            */
        }


        function getImageMaterial(url) {
            const PLACEHOLDER_KEY = '__placeholder__';
            const BLACK_IMAGE_KEY = 'BLACK_IMAGE';

            const getPlaceholder = () => {
                if (!materialCache.has(PLACEHOLDER_KEY)) {
                    materialCache.set(PLACEHOLDER_KEY, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.placeholder) }));
                }
                return materialCache.get(PLACEHOLDER_KEY);
            };

            // Handle black images
            if (url === BLACK_IMAGE_KEY) {
                if (!materialCache.has(BLACK_IMAGE_KEY)) {
                    materialCache.set(BLACK_IMAGE_KEY, new THREE.MeshBasicMaterial({ color: config.darkColor }));
                }
                return materialCache.get(BLACK_IMAGE_KEY);
            }

            if (!url) return getPlaceholder();

            if (materialCache.has(url)) return materialCache.get(url);

            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: null });
            textureLoader.load(url, tex => {
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
                mat.map = tex; mat.needsUpdate = true;
            }, undefined, () => {
                mat.map = null; mat.color.set(COLORS.placeholder);
                mat.needsUpdate = true;
            });

            materialCache.set(url, mat);
            return mat;
        }


        let overlayCursor = 0;
        function pickOverlayUrl(extraUsed = new Set()) {
            if (!imageTextures || imageTextures.length === 0) return 'img/logo-sooxy-art.png';
            const url = imageTextures[overlayCursor % imageTextures.length];
            overlayCursor = (overlayCursor + 1) % imageTextures.length;
            return url;
        }



        function createBlackNeighborImages() {
    const { w } = getLayoutMetrics();
    const isPortrait = !isLandscapeLike();

    // Parcourt toutes les images "rib/*" pour créer un carré noir voisin
    for (const imgPath of imageCells) {
        if (!imgPath.startsWith('rib/')) continue;

        const img = targetState.get(imgPath);
        if (!img || Math.abs(img.originalSize - w) > 1e-6) continue;

        const match = imgPath.match(/^rib\/(\d+)$/);
        if (!match) continue;

        const index = parseInt(match[1], 10);

        let blackX, blackY, blackPath;

        if (isPortrait) {
            // En mode portrait : alternance colonne 0 / 1
            const col = (index % 2 === 0) ? 0 : 1;

            if (col === 0) {
                // Image à gauche → texte à droite
                blackX = img.x + w;
                blackY = img.y;
                blackPath = `black/${index}_right`;
            } else {
                // Image à droite → texte à gauche
                blackX = img.x - w;
                blackY = img.y;
                blackPath = `black/${index}_left`;
            }
        } else {
            // En mode paysage : alternance ligne 0 / 1
            const row = (index % 2 === 0) ? 0 : 1;

            if (row === 0) {
                // Image en haut → texte en dessous
                blackX = img.x;
                blackY = img.y - w;
                blackPath = `black/${index}_below`;
            } else {
                // Image en bas → texte au-dessus
                blackX = img.x;
                blackY = img.y + w;
                blackPath = `black/${index}_above`;
            }
        }

        const size = w - config.borderWidth;

        targetState.set(blackPath, {
            x: blackX,
            y: blackY,
            size: size,
            depth: 1,
            path: blackPath,
            originalSize: w
        });

        // --- Texte : titre + lorem ipsum plus long ---
        const title = `Title ${index + 1}`;
        const paragraph = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`;

        const labelText = `${title}\n${paragraph}`;

        // Bouton "texte" sur carré noir (pas de navigation réelle)
        buttonCells.set(blackPath, {
            category: 'black_text',
            label: labelText,
            url: '#'
        });
    }
}



        function buildFreeOverlays() {
    if (!imageTextures || imageTextures.length === 0) {
        updateScrollDocHeight();
        forceBrowserToLayoutForHScroll();
        return;
    }

    const lm = getLayoutMetrics();
    const { w, contentTop } = lm;
    const stableTop = contentTop;

    const H = (scene.userData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 10, gapCols: 0 });
    H.gapCols = (typeof config.overlayGapCols === 'number' ? config.overlayGapCols : 0.5);
    const gapXWorld = Math.max(0, H.gapCols) * w;

    const bucketOffset = contentOffsetColsForBucket();
    const baseX = camera.left + (bucketOffset + 0.5) * w;

    const isPortrait = !isLandscapeLike();

    const expectedCount = imageTextures.length;

    const desired = new Set();
    const slots = [];

    if (isPortrait) {
        const V = (scene.userData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 0, gapRows: 0 });
        V.patternRows = expectedCount;
        V.gapRows = (typeof config.overlayGapCols === 'number' ? config.overlayGapCols : 0.5);
        const gapYWorld = Math.max(0, V.gapRows) * w;

        for (let i = 0; i < expectedCount; i++) {
            const col = (i % 2 === 0) ? 0 : 1;
            const cx = camera.left + (bucketOffset + col + 0.5) * w;
            const cy = stableTop - (i * (w + gapYWorld) + w / 2);
            const path = `rib/${i}`;
            desired.add(path);
            slots.push({
                index: i,
                path,
                x: cx,
                y: cy,
                os: w,
                sz: Math.max(0, w - config.borderWidth)
            });
        }

        const totalWorld =
            (expectedCount * w) +
            Math.max(0, expectedCount - 1) * gapYWorld;

        mobileWorldContentHeight = totalWorld;
        V.maxWorld = Math.max(0, totalWorld - (lm.viewHeight - lm.menuHeight));
    } else {
        for (let i = 0; i < expectedCount; i++) {
            const row = (i % 2 === 0) ? 0 : 1;
            const slot = Math.floor(i / 2);
            const col = (row === 0) ? (2 * slot) : (2 * slot + 1);
            const cx = baseX + col * (w + gapXWorld);
            const cy = stableTop - (row + 0.5) * w;
            const path = `rib/${i}`;
            desired.add(path);
            slots.push({
                index: i,
                path,
                x: cx,
                y: cy,
                os: w,
                sz: Math.max(0, w - config.borderWidth)
            });
        }
    }

    for (const s of slots) {
        const existing = targetState.get(s.path);
        if (!existing) {
            targetState.set(s.path, {
                x: s.x,
                y: s.y,
                size: s.sz,
                depth: 1,
                path: s.path,
                originalSize: s.os
            });
        } else {
            existing.x = s.x;
            existing.y = s.y;
            existing.originalSize = s.os;
            existing.size = s.sz;
            existing.depth = 1;
        }

        imageCells.add(s.path);
        const url = imageTextures[s.index] || 'img/logo-sooxy-art.png';
        imageAssignment.set(s.path, url);
    }

    for (const key of Array.from(targetState.keys())) {
        if (key.startsWith('rib/') && !desired.has(key)) {
            targetState.delete(key);
            imageCells.delete(key);
        }
    }

    cutOutUnderButtons();
    dedupeTargetState();
    createBlackNeighborImages();
    cutOutUnderButtons();
    syncStateToMeshes();

    updateScrollDocHeight();
    forceBrowserToLayoutForHScroll();
}





        function updateFreeOverlays() {
    if (!imageTextures || imageTextures.length === 0) return;

    const lm = getLayoutMetrics();
    const { w, contentTop } = lm;
    const stableTop = contentTop;

    const H = (scene.userData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 10, gapCols: 0 });
    H.gapCols = (typeof config.overlayGapCols === 'number' ? config.overlayGapCols : 0.5);
    const gapXWorld = Math.max(0, H.gapCols) * w;

    const bucketOffset = contentOffsetColsForBucket();
    const baseX = camera.left + (bucketOffset + 0.5) * w;

    const isPortrait = !isLandscapeLike();

    const expectedCount = imageTextures.length;

    const desired = new Set();
    let changed = false;

    if (isPortrait) {
        const V = (scene.userData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 0, gapRows: 0 });
        V.patternRows = expectedCount;
        V.gapRows = (typeof config.overlayGapCols === 'number' ? config.overlayGapCols : 0.5);
        const gapYWorld = Math.max(0, V.gapRows) * w;

        for (let i = 0; i < expectedCount; i++) {
            const col = (i % 2 === 0) ? 0 : 1;
            const cx = camera.left + (bucketOffset + col + 0.5) * w;
            const cy = stableTop - (i * (w + gapYWorld) + w / 2);
            const path = `rib/${i}`;
            desired.add(path);

            const s = targetState.get(path);
            const os = w;
            const sz = Math.max(0, os - config.borderWidth);

            if (!s) {
                targetState.set(path, { x: cx, y: cy, size: sz, depth: 1, path, originalSize: os });
                changed = true;
            } else {
                if (
                    Math.abs(s.x - cx) > 1e-6 ||
                    Math.abs(s.y - cy) > 1e-6 ||
                    Math.abs(s.originalSize - os) > 1e-6 ||
                    Math.abs(s.size - sz) > 1e-6 ||
                    s.depth !== 1
                ) {
                    s.x = cx;
                    s.y = cy;
                    s.originalSize = os;
                    s.size = sz;
                    s.depth = 1;
                    changed = true;
                }
            }

            imageCells.add(path);
            const url = imageTextures[i] || 'img/logo-sooxy-art.png';
            if (imageAssignment.get(path) !== url) {
                imageAssignment.set(path, url);
                changed = true;
            }
        }

        const totalWorld =
            (expectedCount * w) +
            Math.max(0, expectedCount - 1) * gapYWorld;

        mobileWorldContentHeight = totalWorld;
        V.maxWorld = Math.max(0, totalWorld - (lm.viewHeight - lm.menuHeight));
    } else {
        for (let i = 0; i < expectedCount; i++) {
            const row = (i % 2 === 0) ? 0 : 1;
            const slot = Math.floor(i / 2);
            const col = (row === 0) ? (2 * slot) : (2 * slot + 1);
            const cx = baseX + col * (w + gapXWorld);
            const cy = stableTop - (row + 0.5) * w;
            const path = `rib/${i}`;
            desired.add(path);

            const s = targetState.get(path);
            const os = w;
            const sz = Math.max(0, os - config.borderWidth);

            if (!s) {
                targetState.set(path, { x: cx, y: cy, size: sz, depth: 1, path, originalSize: os });
                changed = true;
            } else {
                if (
                    Math.abs(s.x - cx) > 1e-6 ||
                    Math.abs(s.y - cy) > 1e-6 ||
                    Math.abs(s.originalSize - os) > 1e-6 ||
                    Math.abs(s.size - sz) > 1e-6 ||
                    s.depth !== 1
                ) {
                    s.x = cx;
                    s.y = cy;
                    s.originalSize = os;
                    s.size = sz;
                    s.depth = 1;
                    changed = true;
                }
            }

            imageCells.add(path);
            const url = imageTextures[i] || 'img/logo-sooxy-art.png';
            if (imageAssignment.get(path) !== url) {
                imageAssignment.set(path, url);
                changed = true;
            }
        }
    }

    for (const key of Array.from(targetState.keys())) {
        if (key.startsWith('rib/') && !desired.has(key)) {
            targetState.delete(key);
            imageCells.delete(key);
            changed = true;
        }
    }

    if (changed) {
        cutOutUnderButtons();
        dedupeTargetState();
    }

    createBlackNeighborImages();
    cutOutUnderButtons();

    if (changed || buttonCells.size > 0) {
        syncStateToMeshes();
    }

    updateScrollDocHeight();
}









        function makeTopRightLabelSprite(text, squareSize) {
            const lines = text.split('\\n');
            const cvs = document.createElement('canvas'); const W = 512, H = 384;
            cvs.width = W; cvs.height = H;
            const ctx = cvs.getContext('2d');
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = COLORS.textCSS;
            ctx.textBaseline = 'top'; ctx.textAlign = 'right';
            const fontPx = Math.floor(H * 0.11);
            ctx.font = `700 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace`;
            const margin = Math.floor(H * 0.08); const lineGap = Math.floor(fontPx * 0.12);
            let y = margin; for (const line of lines) { ctx.fillText(line, W - margin, y); y += fontPx + lineGap; }
            const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace;
            const sprMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, color: new THREE.Color(COLORS.textCSS) });
            const spr = new THREE.Sprite(sprMat); const aspect = H / W; spr.scale.set(squareSize, squareSize * aspect, 1); spr.center.set(1, 1); spr.renderOrder = 6; return spr;
        }

        let forceRecreateLabelsOnce = false;

        function destroyDomLabel(st) {
            if (st.baffles) { st.baffles.forEach(b => b.stop()); st.baffles = null; }
            if (st.domLabelEl) { st.domLabelEl.remove(); st.domLabelEl = null; }
        }

        function rebuildDomLabel(st, label) {
    // Nettoyage ancien label / baffle
    if (st.baffles) {
        st.baffles.forEach(b => b.stop());
        st.baffles = null;
    }
    if (st.domLabelEl) {
        st.domLabelEl.remove();
        st.domLabelEl = null;
    }

    const layer = document.getElementById('labels-layer');
    if (layer) layer.style.zIndex = '3';

    const el = makeDomLabelEl(label);

    // Carré noir = paragraphe sous les images (détecté au Lorem ipsum)
    const isBlackSquare = String(label).toLowerCase().includes('lorem ipsum');
    st.isBlackSquare = isBlackSquare;   // on mémorise sur le state

    if (isBlackSquare) {
        el.classList.add('black-text');
    }

    // on laisse une valeur par défaut, la vraie origine / alignement
    // sera recalculée dans updateDomLabelLayout()
    el.style.transformOrigin = '100% 0%';
    el.style.textAlign = 'right';

    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.textRendering = 'optimizeLegibility';
    el.style.webkitFontSmoothing = 'antialiased';
    el.style.direction = 'ltr';

    // invisible au départ
    el.style.opacity = '0';
    el.style.transition = 'opacity 0s linear';

    const lines = Array.from(el.querySelectorAll('.line'));
    st.lines = lines;
    st.labelText = label;

    // Mise en forme de base des lignes
    lines.forEach(line => {
        line.style.display = 'block';
        line.style.whiteSpace = isBlackSquare ? 'normal' : 'nowrap';
        // l’alignement sera forcé dans updateDomLabelLayout()
        line.style.textAlign = isBlackSquare ? 'left' : 'right';
    });

    layer?.appendChild(el);
    st.domLabelEl = el;

    // Mesure "offscreen"
    const prev = el.style.transform;
    el.style.transform = 'translate(-10000px,-10000px)';

    const fm = FontMetrics.measure(label);
    st.baseFontPx = fm.fontSize;
    st.labelBaseWidthPx = fm.width;

    const firstLine = String(label).split('\n')[0];
    st.firstLineBaseWidthPx = FontMetrics.measure(firstLine).width;

    el.style.transform = prev || '';

    // Flag : est-ce que ce label a DÉJÀ été animé une fois ?
    const alreadyAnimated = !!st.hasAnimatedBaffle;

    if (!isMobileBucket() && window.baffle && !alreadyAnimated) {
        st.baffles = lines.map(line =>
            window.baffle(line).set({
                characters: '!/|~#.^+*$#%sooxy',
                speed: 100
            })
        );
    } else {
        st.baffles = null;
    }

    st.hovering = false;
    st.appearTriggered = false;
}



    function ensureGlobalLabelFontPx(lm) {
    // On différencie un peu mieux :
    // - desktop (tous formats paysage "larges")
    // - tablette portrait
    // - mobile portrait
    const isMobilePortrait  = currentBucket === 'mobile-v';
    const isTabletPortrait  = currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16';

    // Bases plus petites qu'avant
    const baseDesktop = 13;  // avant ~14–15 visuellement
    const baseTablet  = 12;  // un poil plus petit
    const baseMobile  = 11;  // nettement plus raisonnable en mobile

    let base;
    if (isMobilePortrait) {
        base = baseMobile;
    } else if (isTabletPortrait) {
        base = baseTablet;
    } else {
        base = baseDesktop;
    }

    const scale = viewportLabelScaleFactor(); // garde ta logique de scale existante
    return base * scale;
}

    function syncCategoryLabelSize(lmOverride) {
    const catEl = document.getElementById('category-label');
    if (!catEl) return;

    const lm = lmOverride || getLayoutMetrics();
    const basePx = ensureGlobalLabelFontPx(lm);   // même base que les titres de paragraphes
    const titlePx = basePx * 1.6;                 // même facteur que ton 1.6em

    catEl.style.fontSize = `${titlePx}px`;
}



   function updateDomLabelLayout(st, lm) {
    if (!st.domLabelEl) return;
    const el = st.domLabelEl;
    const { w } = lm;

    // --- ratio d’agrandissement du carré (0 → 1) ---
    const targetSize = (st.targetScale && st.targetScale.x) || st.originalSize || w;
    const currentSize = (st.currentScale && st.currentScale.x) ||
        (st.mesh ? st.mesh.scale.x : targetSize);

    const ratio = targetSize > 0 ? (currentSize / targetSize) : 1;

    // Taille affichée du carré
    const dispS = Math.max(0, currentSize);

    // Centre en coordonnées locales (contentGroup)
    const localX = st.currentPosition ? st.currentPosition.x :
        (st.mesh ? st.mesh.position.x : 0);
    const localY = st.currentPosition ? st.currentPosition.y :
        (st.mesh ? st.mesh.position.y : 0);

    // Décalage du groupe (scroll)
    const gx = contentGroup?.position?.x || 0;
    const gy = contentGroup?.position?.y || 0;

    // Coordonnées monde
    const worldX = localX + gx;
    const worldY = localY + gy;

    const half = dispS / 2;

    // Carrés noirs "paragraphe" (ceux sous les images)
    const isBlackSquare =
        !!st.isBlackSquare ||
        (st.labelText && st.labelText.toLowerCase().includes('lorem ipsum'));

    // Sommes-nous dans un format vertical ?
    const isPortraitBucket =
        currentBucket === 'mobile-v' ||
        currentBucket === 'tablet-3:4' ||
        currentBucket === 'tablet-9:16';

    // Est-ce que ce carré noir est à gauche de l’image la plus proche ?
    let isLeftOfImage = false;
    if (isBlackSquare && isPortraitBucket) {
        const cx = localX;
        const cy = localY;

        let bestD2 = Infinity;
        let bestImageX = null;

        for (const other of fractalState.values()) {
            if (!other.isImage) continue;
            const ox = other.currentPosition
                ? other.currentPosition.x
                : (other.mesh ? other.mesh.position.x : 0);
            const oy = other.currentPosition
                ? other.currentPosition.y
                : (other.mesh ? other.mesh.position.y : 0);

            const dx = ox - cx;
            const dy = oy - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                bestImageX = ox;
            }
        }

        if (bestImageX != null) {
            // si l'image est à droite du texte → texte à gauche de l'image
            if (bestImageX > cx + 1e-4) {
                isLeftOfImage = true;
            }
        }
    }

    // Ici on décide si le texte doit être ferré à droite dans le carré
    const alignRightInside = isBlackSquare && isPortraitBucket && isLeftOfImage;

    const marginPctRight = 1 / Math.pow(2, (LABEL_MARGIN_DEPTH_RIGHT - 2));
    const marginPctTop   = 1 / Math.pow(2, (LABEL_MARGIN_DEPTH_TOP   - 2));

    let mRightWorld = dispS * marginPctRight;
    const mTopWorld = dispS * marginPctTop;
    let mLeftWorld = 0;

    let txWorld, tyWorld;

    if (isBlackSquare) {
        // Même marge à gauche et à droite
        mLeftWorld  = dispS * marginPctTop;
        mRightWorld = mLeftWorld;

        if (alignRightInside) {
            // Texte ferré à droite dans le carré
            txWorld = worldX + half - mRightWorld;
        } else {
            // Texte ferré à gauche comme avant
            txWorld = worldX - half + mLeftWorld;
        }

        tyWorld = worldY + half - mTopWorld;
    } else {
        // Boutons "normaux" : ancrage haut-droit
        txWorld = worldX + half - mRightWorld;
        tyWorld = worldY + half - mTopWorld;
    }

    // Re-mesure au besoin
    if ((!st.labelBaseWidthPx || st.labelBaseWidthPx <= 0) && st.domLabelEl) {
        const fm = FontMetrics.measure(st.labelText || '');
        st.baseFontPx = fm.fontSize;
        st.labelBaseWidthPx = fm.width;
        const firstLine = String(st.labelText || '').split('\n')[0];
        st.firstLineBaseWidthPx = FontMetrics.measure(firstLine).width;
    }

    const targetS = Math.max(0, st.targetScale?.x || dispS);

    const pxPerWorldX =
        (STABLE_VP_W || window.innerWidth) / (camera.right - camera.left);

    // Largeur dispo en px
    let availablePxFinal;
    if (isBlackSquare) {
        const innerWorld = Math.max(0, dispS - (mLeftWorld + mRightWorld));
        availablePxFinal = innerWorld * pxPerWorldX;
        el.style.maxWidth = `${availablePxFinal}px`;
    } else {
        availablePxFinal = computeSquareInnerWidthPx(targetS);
        el.style.maxWidth = '';
    }

    // Taille de base calculée en fonction du viewport + bucket
    const baseFontPx = ensureGlobalLabelFontPx(lm);

    const isDesktopBucket =
        currentBucket === 'desktop-16:9' ||
        currentBucket === 'desktop-21:9' ||
        currentBucket === 'desktop-32:9';

    const isMobilePortrait  = currentBucket === 'mobile-v';
    const isTabletPortrait  = currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16';
    const isCompact         = isMobilePortrait || isTabletPortrait;

    const perPx =
        (st.labelBaseWidthPx > 0 && st.baseFontPx > 0)
            ? (st.labelBaseWidthPx / st.baseFontPx)
            : 0;

    // Taille max permise par la place dispo
    let maxByWidth = perPx > 0
        ? (availablePxFinal / perPx)
        : (st.baseFontPx || baseFontPx);

    let finalFontPx;

    if (isBlackSquare) {
        // Paragraphes sous images
        if (isCompact) {
            finalFontPx = Math.min(maxByWidth, baseFontPx * 0.9);
            finalFontPx = Math.max(
                finalFontPx,
                isMobilePortrait ? 11 : 12
            );
        } else {
            finalFontPx = Math.min(maxByWidth, baseFontPx);
            finalFontPx = Math.max(finalFontPx, 13);
        }
    } else {
        // Labels de boutons
        if (isCompact) {
            finalFontPx = Math.min(maxByWidth, baseFontPx * 0.9);
            finalFontPx = Math.max(
                finalFontPx,
                isMobilePortrait ? 10 : 11
            );
        } else {
            finalFontPx = Math.min(maxByWidth, baseFontPx * 0.9);
            finalFontPx = Math.max(finalFontPx, 12);
        }
    }

    // Arrondi et bornes globales
    finalFontPx = Math.round(finalFontPx * 2) / 2;
    finalFontPx = Math.max(9, Math.min(64, finalFontPx));
    el.style.fontSize = finalFontPx + 'px';
    el.style.color = '#f3f1ee';

    // 🔥 SEUIL 80% : apparition du texte + ANIMATION UNE SEULE FOIS
    if (!st.appearTriggered && ratio >= 0.8) {
        st.appearTriggered = true;

        // Apparition brutale du texte
        el.style.opacity = '1';

        if (st.baffles && !st.hasAnimatedBaffle) {
            st.hasAnimatedBaffle = true;
            st.baffles.forEach(b => {
                b.start();
                b.reveal(600);
            });
        }
    }

    // Alignement final (en tenant compte des CSS !important)
    const desiredAlign = isBlackSquare
        ? (alignRightInside ? 'right' : 'left')
        : 'right';

    el.style.setProperty('text-align', desiredAlign, 'important');
    if (st.lines) {
        st.lines.forEach(line => {
            line.style.setProperty('text-align', desiredAlign, 'important');
        });
    }

    // Origine de transform pour coller à l’alignement
    const originX = (isBlackSquare && !alignRightInside) ? '0%' : '100%';
    el.style.transformOrigin = `${originX} 0%`;

    // Projection monde → pixels
    const p = worldToClientXY(new THREE.Vector3(txWorld, tyWorld, 0));
    const translateX = (isBlackSquare && !alignRightInside)
        ? 'translateX(0%)'
        : 'translateX(-100%)';

    el.style.transform =
        `translate(${Math.round(p.x)}px, ${Math.round(p.y + LABEL_NUDGE_PX_Y)}px) ${translateX}`;
}



        function syncStateToMeshes() {
            // Rebuild spatial hash ONLY if dirty
            if (targetStateDirty) {
                spatialHashCache = buildSpatialHash();
                spatialHashCacheVersion++;
                targetStateDirty = false;
            }

            const getOccluderMaterial = () => {
                if (!scene.userData.occluderMaterial) {
                    scene.userData.occluderMaterial = new THREE.MeshBasicMaterial({ color: config.darkColor, depthTest: false, depthWrite: false });
                }
                return scene.userData.occluderMaterial;
            };
            const isMobile = isMobileBucket();
            const newKeys = new Set(targetState.keys());
            const IMAGE_ORDER = 2.96;
            const DOT_ORDER_NONBTN = 2.50;
            const BUTTON_ORDER = 3.00;
            const DOT_ORDER_BUTTON = 3.40;
            const lm = getLayoutMetrics();
            const gx = contentGroup?.position?.x || 0;
            const gy = contentGroup?.position?.y || 0;
            const viewW = camera.right - camera.left;
            const viewH = lm.contentTop - camera.bottom;

            // Culling margins must be strictly > generation margins (2.5)
            // We use 3.0 or 4.0
            const CULL_MARGIN = 4.0;
            const extendX = isLandscapeLike() ? viewW * CULL_MARGIN : 0;
            const extendY = isLandscapeLike() ? 0 : viewH * CULL_MARGIN;
            const hardX = isLandscapeLike() ? viewW * CULL_MARGIN : extendX;
            const hardY = isLandscapeLike() ? extendY : viewH * CULL_MARGIN;
            const Lhard = camera.left - gx - hardX;
            const Rhard = camera.right - gx + hardX;
            const Bhard = camera.bottom - gy - hardY;
            const Thard = lm.contentTop - gy + hardY;

            const POPIN_MARGIN = 1.0; // Margin relative to view size to disable animation
            const popX = isLandscapeLike() ? viewW * POPIN_MARGIN : 0;
            const popY = isLandscapeLike() ? 0 : viewH * POPIN_MARGIN;
            const Lpop = camera.left - gx - popX;
            const Rpop = camera.right - gx + popX;
            const Bpop = camera.bottom - gy - popY;
            const Tpop = lm.contentTop - gy + popY;

            const isVisibleForAnim = (x, y) => {
               return (x >= Lpop && x <= Rpop && y >= Bpop && y <= Tpop);
            };

            // Optimized Loop: Iterate directly over the map to avoid Array.from allocation
            for (const [key, st] of fractalState) {
                if (!newKeys.has(key)) {
                    const curS = st.currentScale ? st.currentScale.x : (st.mesh ? st.mesh.scale.x : 0);
                    const half = st.originalSize ? st.originalSize * 0.5 : Math.max(0, curS) * 0.5;

                    const cx = st.currentPosition ? st.currentPosition.x : (st.mesh ? st.mesh.position.x : 0);
                    const cy = st.currentPosition ? st.currentPosition.y : (st.mesh ? st.mesh.position.y : 0);

                    const l = cx - half, r = cx + half, b = cy - half, t = cy + half;
                    const tooFar = (r <= Lhard || l >= Rhard || t <= Bhard || b >= Thard);
                    if (tooFar || instantKill.has(key)) {
                        if (st.mesh) { contentGroup.remove(st.mesh); meshPool.push(st.mesh); }
                        if (st.dotMesh) { contentGroup.remove(st.dotMesh); dotMeshPool.push(st.dotMesh); }
                        if (st.labelSprite) { scene.remove(st.labelSprite); }
                        if (st.domLabelEl) { st.domLabelEl.remove(); st.domLabelEl = null; }
                        if (st.baffles) { st.baffles.forEach(b => b.stop()); st.baffles = null; }
                        if (st.occluderMesh) { contentGroup.remove(st.occluderMesh); st.occluderMesh = null; }
                        fractalState.delete(key);
                    } else {
                        st.targetScale.set(0, 0, 0);
                        // Dots handled by instancing now, but if we kept dotMesh for images...
                        if (st.dotMesh) st.dotMesh.scale.set(0, 0, 0);
                        if (st.labelSprite) { scene.remove(st.labelSprite); st.labelSprite = null; }
                        if (st.occluderMesh) { contentGroup.remove(st.occluderMesh); st.occluderMesh = null; }
                        if (st.domLabelEl) { st.domLabelEl.remove(); st.domLabelEl = null; }
                        if (st.baffles) { st.baffles.forEach(b => b.stop()); st.baffles = null; }
                    }
                }
            }

            for (const key of newKeys) {
                const t = targetState.get(key);
                const ex = fractalState.get(key);
                const isImg = imageCells.has(key);
                const isBtn = buttonCells.has(key);

                // Images still use individual meshes because of unique textures
                if (isImg) {
                    const url = imageAssignment.get(key);
                    const material = getImageMaterial(url);

                    if (ex) {
                        // Update existing image mesh
                        ex.logicalCenter ||= new THREE.Vector3();
                        ex.logicalCenter.set(t.x, t.y, 0);
                        ex.anchorPosition ||= new THREE.Vector3();
                        ex.anchorPosition.set(t.x, t.y, 0);
                        ex.mesh.position.set(t.x, t.y, 0);
                        ex.targetScale.set(t.size, t.size, 1);
                        ex.originalSize = t.originalSize;
                        if (ex.mesh.material !== material) ex.mesh.material = material;
                        ex.isButton = isBtn;
                        ex.isImage = isImg;
                        ex.mesh.renderOrder = IMAGE_ORDER;

                        // Images don't have dots usually, but if they did, keep dotMesh logic or remove it?
                        // Code says: if (!isImg && config.showDots) ...
                        // So images don't have dots.
                    } else {
                        // New image mesh
                        const mesh = meshPool.pop() || new THREE.Mesh(geometry);
                        mesh.material = material;
                        mesh.position.set(t.x, t.y, 0);

                        // Fix Pop-in: if created far from view, start at target scale
                        const visible = isVisibleForAnim(t.x, t.y);
                        const startScale = visible ? 0 : t.size;

                        mesh.scale.set(startScale, startScale, 1);
                        mesh.renderOrder = IMAGE_ORDER;
                        contentGroup.add(mesh);

                        const st = {
                            mesh,
                            dotMesh: null, // Images don't have dots
                            labelSprite: null,
                            domLabelEl: null,
                            baffles: null,
                            occluderMesh: null,
                            hovering: false,
                            logicalCenter: new THREE.Vector3(t.x, t.y, 0),
                            anchorPosition: new THREE.Vector3(t.x, t.y, 0),
                            targetPosition: new THREE.Vector3(t.x, t.y, 0),
                            targetScale: new THREE.Vector3(t.size, t.size, 1),

                            currentPosition: new THREE.Vector3(t.x, t.y, 0),
                            currentScale: new THREE.Vector3(startScale, startScale, 1),

                            originalSize: t.originalSize,
                            isButton: isBtn,
                            isImage: isImg
                        };
                        fractalState.set(key, st);
                    }
                } else {
                    // Dark Squares (Instanced)
                    if (ex) {
                        // Update existing state
                        ex.logicalCenter ||= new THREE.Vector3();
                        ex.logicalCenter.set(t.x, t.y, 0);
                        ex.anchorPosition ||= new THREE.Vector3();
                        ex.anchorPosition.set(t.x, t.y, 0);
                        // No mesh to update position on
                        ex.targetPosition.set(t.x, t.y, 0); // Ensure targetPosition is up to date
                        ex.targetScale.set(t.size, t.size, 1);
                        ex.originalSize = t.originalSize;
                        ex.isButton = isBtn;
                        ex.isImage = isImg;

                        if (isBtn) {
                            const label = buttonCells.get(key)?.label || '';
                            if (!ex.domLabelEl || ex.labelText !== label || forceRecreateLabelsOnce) { rebuildDomLabel(ex, label); }
                        } else { destroyDomLabel(ex); }

                        if (isBtn && isMobile) {
                            const insetPx = Math.max(MOBILE_BTN_OCCLUDER_PAD_PX || 1, 1);
                            const inset = lm.onePxWorld * insetPx;
                            if (!ex.occluderMesh) {
                                ex.occluderMesh = new THREE.Mesh(geometry, getOccluderMaterial());
                                contentGroup.add(ex.occluderMesh);
                            }
                            ex.occluderMesh.renderOrder = IMAGE_ORDER - 0.01;
                            ex.occluderMesh.position.set(t.x, t.y, 0.05);
                            const sz = Math.max(0, t.size - inset * 2);
                            ex.occluderMesh.scale.set(sz, sz, 1);
                        } else if (ex.occluderMesh) {
                            contentGroup.remove(ex.occluderMesh);
                            ex.occluderMesh = null;
                        }
                    } else {
                        // New state (no mesh)
                        // Fix Pop-in: if created far from view, start at target scale
                        const visible = isVisibleForAnim(t.x, t.y);
                        const startScale = visible ? 0 : t.size;

                        const st = {
                            mesh: null, // No individual mesh
                            dotMesh: null, // No individual dot mesh
                            labelSprite: null,
                            domLabelEl: null,
                            baffles: null,
                            occluderMesh: null,
                            hovering: false,
                            logicalCenter: new THREE.Vector3(t.x, t.y, 0),
                            anchorPosition: new THREE.Vector3(t.x, t.y, 0),
                            targetPosition: new THREE.Vector3(t.x, t.y, 0),
                            targetScale: new THREE.Vector3(t.size, t.size, 1),

                            // Initialize current values for lerping
                            currentPosition: new THREE.Vector3(t.x, t.y, 0),
                            currentScale: new THREE.Vector3(startScale, startScale, 1),

                            originalSize: t.originalSize,
                            isButton: isBtn,
                            isImage: isImg
                        };
                        fractalState.set(key, st);

                        if (isBtn && isMobile) {
                            const insetPx = Math.max(MOBILE_BTN_OCCLUDER_PAD_PX || 1, 1);
                            const inset = lm.onePxWorld * insetPx;
                            st.occluderMesh = new THREE.Mesh(geometry, getOccluderMaterial());
                            st.occluderMesh.renderOrder = IMAGE_ORDER - 0.01;
                            st.occluderMesh.position.set(t.x, t.y, 0.05);
                            const sz = Math.max(0, t.size - inset * 2);
                            st.occluderMesh.scale.set(sz, sz, 1);
                            contentGroup.add(st.occluderMesh);
                        }
                    }
                }
            }

            // Clean up dotMeshes if they exist on instanced items (legacy cleanup)
            for (const st of fractalState.values()) {
                if (!st.isImage && st.dotMesh) {
                    contentGroup.remove(st.dotMesh);
                    dotMeshPool.push(st.dotMesh);
                    st.dotMesh = null;
                }
            }
        }

        function addDotToState(st) {
            // No-op for instanced items
        }




        function getDotScale(state) {
            if (isMobileBucket()) {
                const { onePxWorld } = getLayoutMetrics();
                return 1.5 * onePxWorld;
            }
            const cappedDotSize = Math.min(0.5, config.dotSize);
            if (config.dotSizeIsRelative) {
                const s = state.currentScale ? state.currentScale.x : (state.mesh ? state.mesh.scale.x : 0);
                return s * cappedDotSize;
            }
            const viewHeight = camera.top - camera.bottom;
            const viewWidth = camera.right - camera.left;
            const gridSize = Math.max(viewWidth, viewHeight);
            return (gridSize / 256) * cappedDotSize;
        }



        function animate() {
            requestAnimationFrame(animate);
            if (window.__mobileFooterTick) window.__mobileFooterTick();

            if (needsBaseUpdate) {
                const ok = updateFractalBase(false);
                if (ok) {
                    buildFreeOverlays();
                    cutOutUnderButtons();
                    dedupeTargetState();
                    syncStateToMeshes();
                }
                needsBaseUpdate = false;
            }

            const wp = new THREE.Vector3(lastMouseScreenPos.x, lastMouseScreenPos.y, 0).unproject(camera);

            if (!isMobileBucket() && needsRefineCheck) {
                const did = refineTargetStateAt(wp);
                if (did) {
                    cutOutUnderButtons();
                    dedupeTargetState();
                    syncStateToMeshes();
                }
                needsRefineCheck = false;
            }

            const hv = scene.userData._hoverVanish;
            if (hv && hv.size) {
                hv.forEach(key => {
                    const st = fractalState.get(key);
                    if (st && st.mesh) {
                        st.skipLerpFrames = 0;
                    }
                });
                hv.clear();
            }
            const hs = scene.userData._hoverSpawn;
            if (hs && hs.size) {
                hs.forEach(key => {
                    const st = fractalState.get(key);
                    if (st) {
                        if (st.mesh) st.mesh.scale.set(0, 0, 1);
                        if (st.currentScale) st.currentScale.set(0, 0, 1);
                        st.skipLerpFrames = 0;
                    }
                });
                hs.clear();
            }

            setContentTransformFromScroll();
            const prevX = scene.userData._prevContentX || 0;
            const prevY = scene.userData._prevContentY || 0;
            const curX = (contentGroup && contentGroup.position && contentGroup.position.x) || 0;
            const curY = (contentGroup && contentGroup.position && contentGroup.position.y) || 0;
            const moved = Math.abs(curX - prevX) + Math.abs(curY - prevY);
            scene.userData._prevContentX = curX;
            scene.userData._prevContentY = curY;
            if (moved > 0) {
                scene.userData._cursorSnapFrames = Math.max(1, (scene.userData._cursorSnapFrames | 0));
                scene.userData._cursorSnapFrames += 1;
                if (scene.userData._cursorSnapFrames > 4) scene.userData._cursorSnapFrames = 4;
            }

            updateMouseSquareTarget(wp);

            const isMobile = isMobileBucket();
            mouseSquare.visible = !isMobile;
            cursorBorder.visible = !isMobile;

            const clock = scene.userData.__clock || (scene.userData.__clock = new THREE.Clock());
            let dt = clock.getDelta();
            dt = Math.min(0.05, Math.max(0.001, dt));
            const toLambda = (perFrame) => { const p = Math.min(0.999, Math.max(0, perFrame)); return -Math.log(1 - p) * 60; };
            const lerpFactor = (perFrame) => { const λ = toLambda(perFrame); return 1 - Math.exp(-λ * dt); };

            const fGrid = lerpFactor(config.gridAnimationSpeed);
            const fCursor = lerpFactor(config.mouseSquareAnimationSpeed);

            if (isMobile) {
                mouseSquare.scale.set(0, 0, 1);
                cursorBorder.scale.set(0, 0, 1);
            } else {
                const snap = (scene.userData._cursorSnapFrames | 0) > 0;
                if (snap) {
                    mouseSquare.position.copy(mouseSquare.userData.targetPosition);
                    mouseSquare.scale.copy(mouseSquare.userData.targetScale);
                    cursorBorder.position.copy(cursorBorder.userData.targetPosition);
                    cursorBorder.scale.copy(cursorBorder.userData.targetScale);
                    scene.userData._cursorSnapFrames = (scene.userData._cursorSnapFrames | 0) - 1;
                } else {
                    mouseSquare.position.lerp(mouseSquare.userData.targetPosition, fCursor);
                    mouseSquare.scale.lerp(mouseSquare.userData.targetScale, fCursor);
                    cursorBorder.position.lerp(cursorBorder.userData.targetPosition, fCursor);
                    cursorBorder.scale.lerp(cursorBorder.userData.targetScale, fCursor);
                }
            }

            const lm = getLayoutMetrics();
            const eps = config.borderWidth * 2;
            const gx = contentGroup?.position?.x || 0;
            const gy = contentGroup?.position?.y || 0;
            const viewH = camera.top - camera.bottom;
            const m = viewH * 4;
            const L = camera.left - gx - m;
            const R = camera.right - gx + m;
            const B = camera.bottom - gy - m;
            const T = lm.contentTop - gy + m;

            const buttonBoxes = [];
            for (const st of fractalState.values()) {
                if (!st.isButton) continue;
                const curS = st.currentScale ? st.currentScale.x : (st.mesh ? st.mesh.scale.x : 0);
                const half = Math.max(0, curS) / 2;
                const cx = st.currentPosition ? st.currentPosition.x : (st.mesh ? st.mesh.position.x : 0);
                const cy = st.currentPosition ? st.currentPosition.y : (st.mesh ? st.mesh.position.y : 0);
                buttonBoxes.push({ x: cx, y: cy, half });
            }
            const isInsideAnyButton = (x, y) => {
                for (const b of buttonBoxes) {
                    if (x >= b.x - b.half && x <= b.x + b.half && y >= b.y - b.half && y <= b.y + b.half) return true;
                }
                return false;
            };

            // Reset instance counts
            let bgIdx = 0, btnIdx = 0, bgDotIdx = 0, btnDotIdx = 0;

            // ✅ OPTIMISATION MAJEURE : Itération directe sur la Map (pas de Array.from)
            for (const [key, st] of fractalState) {
                if (st.skipLerpFrames > 0) st.skipLerpFrames--;
                else {
                    if (st.mesh) st.mesh.scale.lerp(st.targetScale, fGrid);
                    if (st.currentScale) st.currentScale.lerp(st.targetScale, fGrid);
                }

                const curS = st.currentScale ? st.currentScale.x : (st.mesh ? st.mesh.scale.x : 0);
                const curX = st.currentPosition ? st.currentPosition.x : (st.mesh ? st.mesh.position.x : 0);
                const curY = st.currentPosition ? st.currentPosition.y : (st.mesh ? st.mesh.position.y : 0);

                if (st.occluderMesh) {
                    const insetPx = Math.max(MOBILE_BTN_OCCLUDER_PAD_PX || 1, 1);
                    const inset = lm.onePxWorld * insetPx;
                    const szX = Math.max(0, curS - inset * 2);
                    const szY = Math.max(0, curS - inset * 2);
                    st.occluderMesh.scale.set(szX, szY, 1);
                }

                if (st.labelSprite) {
                    const m2 = curS * 0.03;
                    st.labelSprite.position.set(curX + (curS / 2 - m2), curY + (curS / 2 - m2), 0.2);
                    st.labelSprite.scale.set(curS, curS * 0.75, 1);
                }

                if (st.isButton && st.domLabelEl) { updateDomLabelLayout(st, lm); }

                // Instancing Logic
                if (!st.isImage) {
                    dummyObj.position.set(curX, curY, 0);
                    dummyObj.scale.set(curS, curS, 1);
                    dummyObj.updateMatrix();

                    if (st.isButton) {
                        if (btnIdx < MAX_INSTANCES) {
                            btnSquaresInstanced.setMatrixAt(btnIdx++, dummyObj.matrix);
                        }
                    } else {
                        if (bgIdx < MAX_INSTANCES) {
                            bgSquaresInstanced.setMatrixAt(bgIdx++, dummyObj.matrix);
                        }
                    }

                    // Dots
                    if (config.showDots) {
                        const centerVisible = curX >= L + eps && curX <= R - eps && curY >= B + eps && curY <= T - eps && curS > 0.0001;
                        const showDot = st.isButton ? centerVisible : (centerVisible && !isInsideAnyButton(curX, curY));

                        if (showDot) {
                            const sc = getDotScale(st);
                            dummyObj.scale.set(sc, sc, 1);
                            // Position Z for dots is 0.02
                            dummyObj.position.set(curX, curY, 0.02);
                            dummyObj.updateMatrix();

                            if (st.isButton) {
                                if (btnDotIdx < MAX_INSTANCES) btnDotsInstanced.setMatrixAt(btnDotIdx++, dummyObj.matrix);
                            } else {
                                if (bgDotIdx < MAX_INSTANCES) bgDotsInstanced.setMatrixAt(bgDotIdx++, dummyObj.matrix);
                            }
                        }
                    }
                }

                // Legacy dotMesh update for images (if any)
                if (st.dotMesh) {
                    const DOT_ORDER_NONBTN = 2.50;
                    const DOT_ORDER_BUTTON = 3.40;
                    st.dotMesh.renderOrder = st.isButton ? DOT_ORDER_BUTTON : DOT_ORDER_NONBTN;
                    const centerVisible = curX >= L + eps && curX <= R - eps && curY >= B + eps && curY <= T - eps && curS > 0.0001;
                    const sc = getDotScale(st);
                    const showDot = st.isButton ? centerVisible : (centerVisible && !isInsideAnyButton(curX, curY));
                    if (showDot) st.dotMesh.scale.set(sc, sc, 1);
                    else st.dotMesh.scale.set(0, 0, 0);
                }

                // Cleanup check
                if (curS < 0.001 && st.targetScale.x === 0) {
                    if (st.mesh) { contentGroup.remove(st.mesh); meshPool.push(st.mesh); }
                    if (st.dotMesh) { contentGroup.remove(st.dotMesh); dotMeshPool.push(st.dotMesh); }
                    if (st.labelSprite) { scene.remove(st.labelSprite); }
                    if (st.domLabelEl) { st.domLabelEl.remove(); st.domLabelEl = null; }
                    if (st.baffles) { st.baffles.forEach(b => b.stop()); st.baffles = null; }
                    if (st.occluderMesh) { contentGroup.remove(st.occluderMesh); st.occluderMesh = null; }
                    fractalState.delete(key);
                }
            }

            if (bgSquaresInstanced.count !== bgIdx) {
                bgSquaresInstanced.count = bgIdx;
                bgSquaresInstanced.instanceMatrix.needsUpdate = true;
            } else if (fGrid > 0.001) { // Only update matrix if animation is active
                bgSquaresInstanced.instanceMatrix.needsUpdate = true;
            }

            if (btnSquaresInstanced.count !== btnIdx) {
                btnSquaresInstanced.count = btnIdx;
                btnSquaresInstanced.instanceMatrix.needsUpdate = true;
            } else if (fGrid > 0.001) {
                btnSquaresInstanced.instanceMatrix.needsUpdate = true;
            }

            if (bgDotsInstanced.count !== bgDotIdx) {
                bgDotsInstanced.count = bgDotIdx;
                bgDotsInstanced.instanceMatrix.needsUpdate = true;
            } else if (fGrid > 0.001) {
                 bgDotsInstanced.instanceMatrix.needsUpdate = true;
            }

            if (btnDotsInstanced.count !== btnDotIdx) {
                btnDotsInstanced.count = btnDotIdx;
                btnDotsInstanced.instanceMatrix.needsUpdate = true;
            } else if (fGrid > 0.001) {
                btnDotsInstanced.instanceMatrix.needsUpdate = true;
            }

            renderer.render(scene, camera);
            const canvas = document.getElementById('webgl-canvas');
            if (canvas && canvas.style.opacity !== '1') canvas.style.opacity = '1';
        }


        function isMobileBucket() {
            // "mobile-like" portrait = mobile-v + tablet-3:4 + tablet-9:16
            return currentBucket === 'mobile-v' || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16';
        }


        function isMobileLandscapeHard() {
            return window.innerWidth <= 640 && window.innerWidth > window.innerHeight;
        }

        // subDesktopLandscape function remains but not used to disable scroll
        // isSubDesktopLandscape() defined above


        // Portrait "court" : on voulait justement ça (< ~1000px de haut)
        // Utilise les dimensions "stables" pour ne pas réagir à la barre d’URL iOS.
        function isShortPortrait() {
            const H = STABLE_VP_H || window.innerHeight;
            const W = STABLE_VP_W || window.innerWidth;
            return (H > W) && (H < 1000);
        }

        // Tablette paysage stricte : largeur entre 641 et 1024px, en mode landscape
        function isTabletLandscapeStrict() {
            const W = STABLE_VP_W || window.innerWidth;
            const H = STABLE_VP_H || window.innerHeight;
            return (W > H) && (W >= 641) && (W < 1025);
        }


        function computeSquareInnerWidthPx(sideWorld) {
            const marginPctRight = 1 / Math.pow(2, (LABEL_MARGIN_DEPTH_RIGHT - 2));
            const marginWorld = Math.max(0, sideWorld * marginPctRight);
            const innerWorld = Math.max(0, sideWorld - marginWorld * 2);
            const pxPerWorldX = (STABLE_VP_W || window.innerWidth) / (camera.right - camera.left);
            return innerWorld * pxPerWorldX;
        }


        // ——— FIX: même position pour l'image de la 2e ligne sur tous les formats paysages ———
        function extraImageOffsetForPath(path) {
            // on neutralise tout décalage en formats paysages
            const isLandscape =
                !(currentBucket === 'mobile-v' || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16');

            if (isLandscape) return 0;

            // en formats verticaux, pas de décalage non plus (cohérence générale)
            return 0;
        }



        // Spatial Hash for fast lookup
        const SpatialHash = {
            cellSize: 0,
            grid: new Map(),

            init: function (w) {
                // Cell size roughly equal to a base column width is a good balance
                this.cellSize = w || 100;
                this.grid.clear();
            },

            key: function (x, y) {
                const kx = Math.floor(x / this.cellSize);
                const ky = Math.floor(y / this.cellSize);
                return `${kx}|${ky}`;
            },

            add: function (item) {
                // An item might span multiple grid cells
                const h = item.originalSize / 2;
                const startX = Math.floor((item.x - h) / this.cellSize);
                const endX = Math.floor((item.x + h) / this.cellSize);
                const startY = Math.floor((item.y - h) / this.cellSize);
                const endY = Math.floor((item.y + h) / this.cellSize);

                for (let x = startX; x <= endX; x++) {
                    for (let y = startY; y <= endY; y++) {
                        const k = `${x}|${y}`;
                        if (!this.grid.has(k)) this.grid.set(k, []);
                        this.grid.get(k).push(item);
                    }
                }
            },

            query: function (x, y) {
                const k = this.key(x, y);
                return this.grid.get(k);
            },

            clear: function () {
                this.grid.clear();
            }
        };

        // Hook into updateFractalBase/refine to keep hash updated
        // For now, since targetState changes often, we can just optimize the loop
        // by checking bounding box of the Viewport first, or just simple distance checks?
        // Actually, the simplest "Levier 2" without complex refactor is:
        // Reverse iteration (often items under cursor are added last or first?)
        // OR just simple AABB check optimization.

        // Let's stick to the requested "Levier 2": Optimizing the search.
        // Since implementing a full SpatialHash requires hooking into every add/delete of targetState,
        // and targetState is a Map (unordered), a full SpatialHash is risky to implement without breaking things.
        //
        // BETTER APPROACH FOR "LEVIER 2" (Low Risk):
        // The current findLeafAt iterates EVERYTHING.
        // We can optimize by filtering based on coarse grid coordinates derived from the path!
        // Paths are like "content/0/1/..." -> Row 0, Col 1.
        // We can parse the path to quickly discard items? No, regex is slow.
        //
        // BEST LOW RISK APPROACH:
        // Just optimize the math inside the loop.

        // Spatial hash cache for faster findLeafAt
        let spatialHashCache = null;
        let spatialHashCacheVersion = 0;
        const SPATIAL_CELL_SIZE = 2.0; // Grid cell size in world units

        function buildSpatialHash() {
            const hash = new Map();

            for (const sq of targetState.values()) {
                // Use local coordinates from targetState directly
                // findLeafAt converts world mouse pos to local space, so hash must be in local space too
                const worldX = sq.x;
                const worldY = sq.y;

                // Determine which cells this square overlaps
                const half = sq.originalSize * 0.5;
                const minCellX = Math.floor((worldX - half) / SPATIAL_CELL_SIZE);
                const maxCellX = Math.floor((worldX + half) / SPATIAL_CELL_SIZE);
                const minCellY = Math.floor((worldY - half) / SPATIAL_CELL_SIZE);
                const maxCellY = Math.floor((worldY + half) / SPATIAL_CELL_SIZE);

                for (let cx = minCellX; cx <= maxCellX; cx++) {
                    for (let cy = minCellY; cy <= maxCellY; cy++) {
                        const key = `${cx},${cy}`;
                        if (!hash.has(key)) hash.set(key, []);
                        hash.get(key).push(sq);
                    }
                }
            }

            return hash;
        }

        function findLeafAt(worldPos, stateMap) {
            let best = null, smallest = Infinity;
            const gx = (contentGroup && contentGroup.position && contentGroup.position.x) || 0;
            const gy = (contentGroup && contentGroup.position && contentGroup.position.y) || 0;
            const px = worldPos.x - gx;
            const py = worldPos.y - gy;

            // Try to use spatial hash for faster lookup
            if (spatialHashCache) {
                const cellX = Math.floor(px / SPATIAL_CELL_SIZE);
                const cellY = Math.floor(py / SPATIAL_CELL_SIZE);
                const key = `${cellX},${cellY}`;
                const candidates = spatialHashCache.get(key);

                if (candidates) {
                    for (const sq of candidates) {
                        const half = sq.originalSize * 0.5;
                        const dx = Math.abs(px - sq.x);
                        if (dx > half) continue;

                        const dy = Math.abs(py - sq.y);
                        if (dy > half) continue;

                        if (sq.originalSize < smallest) {
                            best = sq;
                            smallest = sq.originalSize;
                        }
                    }
                    return best;
                }
            }

            // Fallback to full iteration if spatial hash not available
            for (const sq of stateMap.values()) {
                const half = sq.originalSize * 0.5;
                const dx = Math.abs(px - sq.x);
                if (dx > half) continue;

                const dy = Math.abs(py - sq.y);
                if (dy > half) continue;

                if (sq.originalSize < smallest) {
                    best = sq;
                    smallest = sq.originalSize;
                }
            }
            return best;
        }


        function refineTargetStateAt(worldPos) {
    const { contentTop } = getLayoutMetrics();

    // 🚫 Tant qu’on est en train de scroller (drag / wheel / flèches),
    // on ne subdivise pas la grille.
    if (isScrolling) return false;

    if (isMobileBucket()) return false;
    if (worldPos.y >= contentTop) return false;

    let refined = false, it = 0;
    const maxIt = Math.max(1, refineBudgetPerFrame | 0);

    const sp = (scene.userData._hoverSpawn ||= new Set());
    const vn = (scene.userData._hoverVanish ||= new Set());

    const isLand = isLandscapeLike();
    const limit = isLand ? (TARGET_DEPTH + 1) : TARGET_DEPTH;

    while (it < maxIt) {
        it++;
        const leaf = findLeafAt(worldPos, targetState);
        if (!leaf) break;
        if (imageCells.has(leaf.path) || buttonCells.has(leaf.path)) break;

        if (leaf.depth < limit) {
            refined = true;
            targetStateDirty = true;
            targetState.delete(leaf.path);
            vn.add(leaf.path);

            const x = leaf.x;
            const y = leaf.y;
            const os = leaf.originalSize;
            const d = leaf.depth;
            const p = leaf.path;

            const ns = os / 2;
            const nd = d + 1;
            const o = os / 4;

            createQuadTree(x - o, y + o, ns, nd, p + '/0', nd);
            createQuadTree(x + o, y + o, ns, nd, p + '/1', nd);
            createQuadTree(x - o, y - o, ns, nd, p + '/2', nd);
            createQuadTree(x + o, y - o, ns, nd, p + '/3', nd);

            const c0 = p + '/0';
            const c1 = p + '/1';
            const c2 = p + '/2';
            const c3 = p + '/3';

            if (targetState.has(c0)) sp.add(c0);
            if (targetState.has(c1)) sp.add(c1);
            if (targetState.has(c2)) sp.add(c2);
            if (targetState.has(c3)) sp.add(c3);
        } else {
            break;
        }
    }
    return refined;
}



        function computeDefaultGridCursorSize() {
            const { w, contentTop } = getLayoutMetrics();
            const offsetCols = contentOffsetColsForBucket();
            const sampleX = camera.left + (offsetCols + 0.5) * w;
            const sampleY = contentTop - (w * 0.5);
            const wp = new THREE.Vector3(sampleX, sampleY, 0);
            const leaf = findLeafAt(wp, targetState);
            if (!leaf) return Math.max(0, (w / 2) - config.borderWidth);
            const isLand = isLandscapeLike();
            const limit = isLand ? (TARGET_DEPTH + 1) : TARGET_DEPTH;
            const dd = Math.max(0, limit - leaf.depth);
            const cell = leaf.originalSize / Math.pow(2, dd);
            return Math.max(0, cell - config.borderWidth);
        }



        function updateMouseSquareTarget(worldPos) {
    if (isMobileBucket()) {
        mouseSquare.userData.anchor = null;
        mouseSquare.userData.targetPosition.set(0, 0, 4);
        mouseSquare.userData.targetScale.set(0, 0, 1);
        cursorBorder.userData.targetPosition.set(0, 0, 3);
        cursorBorder.userData.targetScale.set(0, 0, 1);
        return;
    }

    const { contentTop, w } = getLayoutMetrics();

    // Si la souris est dans le header : on garde la dernière taille connue,
    // mais on ne recalcule plus la grille (sinon “saut” de position)
    if (worldPos.y >= contentTop) {
        let fs = lastGridCursorSizeWorld;
        if (!(fs > 0)) fs = computeDefaultGridCursorSize();
        if (!(fs > 0)) fs = Math.max(0, (w / 2) - config.borderWidth);

        mouseSquare.userData.anchor = null;
        mouseSquare.userData.targetPosition.set(worldPos.x, worldPos.y, 200);
        mouseSquare.userData.targetScale.set(fs, fs, 1);
        cursorBorder.userData.targetPosition.set(worldPos.x, worldPos.y, 199);
        cursorBorder.userData.targetScale.set(fs + config.borderWidth, fs + config.borderWidth, 1);
        return;
    }

    const gx = (contentGroup && contentGroup.position && contentGroup.position.x) || 0;
    const gy = (contentGroup && contentGroup.position && contentGroup.position.y) || 0;

    const leaf = findLeafAt(worldPos, targetState);
    if (!leaf) {
        let fs = lastGridCursorSizeWorld;
        if (!(fs > 0)) fs = computeDefaultGridCursorSize();
        if (!(fs > 0)) fs = Math.max(0, (w / 2) - config.borderWidth);

        mouseSquare.userData.anchor = null;
        mouseSquare.userData.targetPosition.set(worldPos.x, worldPos.y, 200);
        mouseSquare.userData.targetScale.set(fs, fs, 1);
        cursorBorder.userData.targetPosition.set(worldPos.x, worldPos.y, 199);
        cursorBorder.userData.targetScale.set(fs + config.borderWidth, fs + config.borderWidth, 1);
        lastGridCursorSizeWorld = fs;
        return;
    }

    const isLand = isLandscapeLike();
    const limit = isLand ? (TARGET_DEPTH + 1) : TARGET_DEPTH;
    const dd = Math.max(0, limit - leaf.depth);
    const cell = leaf.originalSize / Math.pow(2, dd);

    const pxLocalX = worldPos.x - gx;
    const pxLocalY = worldPos.y - gy;

    const lx = pxLocalX - (leaf.x - leaf.originalSize / 2);
    const ly = pxLocalY - (leaf.y - leaf.originalSize / 2);
    const n = Math.pow(2, dd);
    const ix = Math.max(0, Math.min(Math.floor(lx / cell), n - 1));
    const iy = Math.max(0, Math.min(Math.floor(ly / cell), n - 1));

    const nx = (leaf.x - leaf.originalSize / 2) + ix * cell + cell / 2;
    const ny = (leaf.y - leaf.originalSize / 2) + iy * cell + cell / 2;

    const fs = Math.max(0, cell - config.borderWidth);

    mouseSquare.userData.anchor = { x: nx, y: ny, size: fs };

    const dx = nx + gx;
    const dy = ny + gy;

    mouseSquare.userData.targetPosition.set(dx, dy, 200);
    mouseSquare.userData.targetScale.set(fs, fs, 1);
    cursorBorder.userData.targetPosition.set(dx, dy, 199);
    cursorBorder.userData.targetScale.set(fs + config.borderWidth, fs + config.borderWidth, 1);

    lastGridCursorSizeWorld = fs;
}







        function onMouseMove(e) {
    const vpW = STABLE_VP_W || window.innerWidth;
    const vpH = STABLE_VP_H || window.innerHeight;

    // coords normalisées NDC
    const nx = (e.clientX / vpW) * 2 - 1;
    const ny = -(e.clientY / vpH) * 2 + 1;

    lastMouseScreenPos.set(nx, ny);
    needsRefineCheck = true;

    // Coordonnées monde de la souris
    const wp = new THREE.Vector3(
        (e.clientX / vpW) * 2 - 1,
        -(e.clientY / vpH) * 2 + 1,
        0
    ).unproject(camera);

    updateMouseSquareTarget(wp);

    // seulement si on est dans le contenu (sous le header)
    const { contentTop } = getLayoutMetrics();
    if (wp.y < contentTop) {
        const did = refineTargetStateAt(wp);
        if (did) {
            cutOutUnderButtons();
            dedupeTargetState();
            syncStateToMeshes();
        }
    }
}





        function onClick(e) {
            if (e.altKey) {
                const wp = new THREE.Vector3(lastMouseScreenPos.x, lastMouseScreenPos.y, 0).unproject(camera);
                logD2At(wp);
                return;
            }

            const wp = new THREE.Vector3(lastMouseScreenPos.x, lastMouseScreenPos.y, 0).unproject(camera);
            const { contentTop } = getLayoutMetrics();

            // ignore les clics dans le header
            if (wp.y >= contentTop) return;

            // Navigation si on clique dans un bouton (📌 tenir compte du décalage du groupe)
            const gx = contentGroup?.position?.x || 0;
            const gy = contentGroup?.position?.y || 0;
            const lx = wp.x - gx;   // coords LOGIQUES
            const ly = wp.y - gy;

            for (const [key, st] of Array.from(fractalState.entries())) {
                if (!st.isButton) continue;
                const half = st.targetScale.x / 2;
                const inside =
                    (lx >= st.targetPosition.x - half && lx <= st.targetPosition.x + half &&
                        ly >= st.targetPosition.y - half && ly <= st.targetPosition.y + half);
                if (inside && buttonCells.has(key)) {
                    const { url, category } = buttonCells.get(key);
                    // Check if this is a black square - regenerate grid like images
                    const isBlackSquare = key.startsWith('black/');
                    if (isBlackSquare) {
                        // Regenerate grid with new pattern (like clicking on images)
                        scene.userData._regenNonce = ((scene.userData._regenNonce | 0) + 1) | 0;
                        reseed();

                        // Clean both targetState AND fractalState
                        for (const k of Array.from(targetState.keys())) {
                            if (k.startsWith('content/') || k.startsWith('filler/') || k.startsWith('fillR/')) {
                                targetState.delete(k);
                            }
                        }
                        for (const k of Array.from(fractalState.keys())) {
                            if (k.startsWith('content/') || k.startsWith('filler/') || k.startsWith('fillR/')) {
                                const st = fractalState.get(k);
                                if (st?.mesh) { contentGroup.remove(st.mesh); meshPool.push(st.mesh); }
                                if (st?.dotMesh) { contentGroup.remove(st.dotMesh); dotMeshPool.push(st.dotMesh); }
                                if (st?.domLabelEl) { st.domLabelEl.remove(); }
                                if (st?.occluderMesh) { contentGroup.remove(st.occluderMesh); }
                                fractalState.delete(k);
                            }
                        }

                        const ok = updateFractalBase(false);
                        if (ok) {
                            buildFreeOverlays();
                            cutOutUnderButtons();
                            dedupeTargetState();
                            syncStateToMeshes();
                        }
                        needsRefineCheck = true;
                        return;
                    }
                    // Regular navigation button
                    window.location.href = url;
                    return;
                }
            }

            // Sinon : reform de la grille en conservant les images (via buildFreeOverlays())
            // Increment nonce and reseed to get a new random pattern
            scene.userData._regenNonce = ((scene.userData._regenNonce | 0) + 1) | 0;
            reseed();

            // Clean both targetState AND fractalState (content/ and filler/), keep images and black squares
            for (const key of Array.from(targetState.keys())) {
                if (key.startsWith('content/') || key.startsWith('filler/') || key.startsWith('fillR/')) {
                    targetState.delete(key);
                }
            }
            for (const key of Array.from(fractalState.keys())) {
                if (key.startsWith('content/') || key.startsWith('filler/') || key.startsWith('fillR/')) {
                    const st = fractalState.get(key);
                    if (st?.mesh) { contentGroup.remove(st.mesh); meshPool.push(st.mesh); }
                    if (st?.dotMesh) { contentGroup.remove(st.dotMesh); dotMeshPool.push(st.dotMesh); }
                    if (st?.domLabelEl) { st.domLabelEl.remove(); }
                    if (st?.occluderMesh) { contentGroup.remove(st.occluderMesh); }
                    fractalState.delete(key);
                }
            }

            // Rebuild the fractal grid while keeping images and black squares
            const ok = updateFractalBase(false);
            if (ok) {
                buildFreeOverlays();
                cutOutUnderButtons();
                dedupeTargetState();
                syncStateToMeshes();
            }

            // sécurité : on s'assure d'un refresh input/cursor au prochain frame
            needsRefineCheck = true;
        }



        // Outil de repérage
        function logD2At(wp) {
            const { w, contentTop } = getLayoutMetrics();
            const col = Math.floor((wp.x - camera.left) / w);
            const row = Math.floor((contentTop - wp.y) / w);
            const cx = camera.left + col * w + w / 2;
            const cy = contentTop - row * w - w / 2;
            const quad = (wp.y > cy ? (wp.x < cx ? 2 : 3) : (wp.x < cx ? 0 : 1));
            console.log(`{ size:'D2', row:${row}, col:${col}, quad:${quad} }`);
        }        function ensureCoverage() {
             const { w, contentTop } = getLayoutMetrics();
             const bounds = getGenerationBounds();
             const offsetCols = contentOffsetColsForBucket();
             const contentCols = contentColsForBucket();

             // Quick check: iterate all cells in view
             // We only check "content" cells for now as they are most important
             for (let row = bounds.minRow; row < bounds.maxRow; row++) {
                if (row >= baseRowsPrimary) continue; // Only check primary content rows for gaps

                for (let col = 0; col < contentCols; col++) {
                    const cx = camera.left + (col + 0.5 + offsetCols) * w;
                    const cy = contentTop - row * w - w/2;

                    // Is this point covered?
                    const wp = {x: cx, y: cy};
                    // Important: findLeafAt checks if a square COVERS the point.
                    // If spatialHash is not up to date (we are in update), it does full scan.
                    // We invalidated spatialHashCache or assume dirty.
                    if (!findLeafAt(wp, targetState)) {
                         // Hole detected! Fill it.
                         const path = `content/${row}/${col}`;
                         // Only fill if not button/image?
                         if (buttonCells.has(path) || imageCells.has(path)) continue;

                         // Create a basic cell
                         createQuadTree(cx, cy, w, 1, path, 1);
                    }
                }
             }
        }
