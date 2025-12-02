import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.167.0/build/three.module.js';

const LABEL_DESKTOP_PX = 14;
const LABEL_MOBILE_PX = 12;

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

let scene, camera, renderer, mouseSquare, cursorBorder, grainPlane, menuPlane, menuBorderBottom;
let lastMouseScreenPos = new THREE.Vector2(0, 0);
const fractalState = new Map();
const meshPool = [];
const dotMeshPool = [];
let darkMaterial, cursorMaterial, geometry, dotMaterial, menuBorderMaterial;
const materialCache = new Map();
const textureLoader = new THREE.TextureLoader();

let domCursorEl = null;
let bgSquaresInstanced, btnSquaresInstanced;
let bgDotsInstanced, btnDotsInstanced;
const MAX_INSTANCES = 20000;
const dummyObj = new THREE.Object3D();

let contentGroup;
let STABLE_VP_W = window.innerWidth;
let STABLE_VP_H = window.innerHeight;

let worker;
let imageTextures = [];
const LOCAL_IMG_DIR = 'img/fractal-art_img/';
const IMG_EXT = '.png';
const IMG_PAD = 2;
const MAX_INDEX = 200;
const STOP_AFTER_MISSES = 10;
let loaderOverlay;

let currentScrollX = 0;
let currentScrollY = 0;
let maxScrollX = 0;
let maxScrollY = 0;
let baseCols = 4;

function initWorker() {
    worker = new Worker('js/worker.js', { type: 'module' });

    worker.onmessage = function (e) {
        const data = e.data;
        if (data.type === 'update') {
            maxScrollX = data.scrollMax.x;
            maxScrollY = data.scrollMax.y;
            syncStateToMeshes(data.cells);
            updateScrollDocHeight(data.mobileWorldContentHeight);
        }
    };
}

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

    worker.postMessage({ type: 'images', images: imageTextures });
}

function imageExists(url) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

function getLayoutMetrics() {
    const headerEl = document.getElementById('ui-header');
    const headerPx = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 0;
    const key = [camera.left, camera.right, camera.top, camera.bottom, baseCols, STABLE_VP_W, STABLE_VP_H, headerPx].join('|');
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

    const val = { viewHeight, viewWidth, w, menuHeight: headerWorld, contentTop, onePxWorld, camera: { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom }, stableVpW: STABLE_VP_W, stableVpH: STABLE_VP_H };
    getLayoutMetrics._memo = { key, val };
    return val;
}

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
    el.innerHTML = parts.map((s, i) => `<span class="line${i === 2 ? ' sub' : ''}">${s}</span>`).join('');
    el.style.textAlign = 'right';
    el.style.direction = 'ltr';
    el.querySelectorAll('.line').forEach(line => {
        line.style.display = 'block';
        line.style.whiteSpace = 'nowrap';
        line.style.textAlign = 'right';
    });
    return el;
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
    initWorker();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(config.backgroundColor);
    const aspect = window.innerWidth / window.innerHeight;
    const height = 10;
    const width = height * aspect;
    camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 1, 1000);
    camera.position.z = 10;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, canvas, powerPreference: 'high-performance', stencil: false, depth: true });
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
    mouseSquare.renderOrder = 4;
    scene.add(mouseSquare);

    cursorBorder = new THREE.Mesh(geometry, darkMaterial);
    cursorBorder.userData.targetPosition = new THREE.Vector3();
    cursorBorder.userData.targetScale = new THREE.Vector3();
    cursorBorder.renderOrder = 3;
    scene.add(cursorBorder);

    bgSquaresInstanced = new THREE.InstancedMesh(geometry, darkMaterial, MAX_INSTANCES);
    bgSquaresInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bgSquaresInstanced.renderOrder = 0;
    contentGroup.add(bgSquaresInstanced);

    btnSquaresInstanced = new THREE.InstancedMesh(geometry, darkMaterial, MAX_INSTANCES);
    btnSquaresInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    btnSquaresInstanced.renderOrder = 3.0;
    contentGroup.add(btnSquaresInstanced);

    bgDotsInstanced = new THREE.InstancedMesh(geometry, dotMaterial, MAX_INSTANCES);
    bgDotsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bgDotsInstanced.renderOrder = 2.5;
    contentGroup.add(bgDotsInstanced);

    btnDotsInstanced = new THREE.InstancedMesh(geometry, dotMaterial, MAX_INSTANCES);
    btnDotsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    btnDotsInstanced.renderOrder = 3.4;
    contentGroup.add(btnDotsInstanced);

    createGrainPlane();
    createMenuPlane();
    menuBorderBottom.visible = false;

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('click', onClick, { passive: true });

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
        button.innerHTML = `<span class="text-container"><span class="button-text initial-text">${label}</span><span class="button-text hover-text">${label}</span></span>`;
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

    (function createDomCursor() {
        const el = document.createElement('div');
        el.id = 'cursor-overlay';
        el.innerHTML = '<div class="inner"></div>';
        document.body.appendChild(el);
        domCursorEl = el;
    })();

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
    const w = window.innerWidth, h = window.innerHeight;
    currentBucket = pickBucket(w, h);
    applyBucket();
    syncCategoryLabelSize(getLayoutMetrics());

    const onProgress = (current, total) => {
        if (loaderOverlay) {
            const percent = Math.min(100, Math.floor((current / total) * 100));
            loaderOverlay.textContent = `[ ${percent}% ]`;
        }
    };

    worker.postMessage({
        type: 'init',
        bucket: currentBucket,
        config: { baseColsOverride: config.baseColsOverride },
        layout: getLayoutMetrics(),
        prefersReducedMotion: prefersReducedMotion
    });

    await scanLocalImages(onProgress);
    FontMetrics.init();
    if (loaderOverlay) loaderOverlay.textContent = `[ 100% ]`;

    installDragSwipeScroll();
    forceBrowserToLayoutForHScroll();
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

    if (forceSubDesktopLandscape) {
        baseCols = 4;
    } else if (isTabletPortrait) {
        if (isShortPortrait()) {
            baseCols = 2;
        } else {
            baseCols = 3;
        }
    } else if (!isPhonePortrait) {
        if (isTabletLand) {
            baseCols = b?.grid?.cols ?? 4;
        } else if (config.baseColsOverride != null) {
            baseCols = Math.max(1, config.baseColsOverride);
        } else {
            baseCols = b?.grid?.cols || 4;
        }
    } else {
        baseCols = 2;
    }
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
    const menuOccluderMaterial = new THREE.MeshBasicMaterial({ color: config.darkColor, depthTest: false, depthWrite: false, transparent: false });
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
    function layoutHeight() { return (typeof STABLE_VP_H === 'number' && STABLE_VP_H > 0) ? STABLE_VP_H : innerHeight; }
    function measureH() {
        const vv = visualViewport;
        let extra = 0;
        if (vv) {
            const vvBottom = vv.height + (vv.offsetTop || 0);
            extra = Math.max(0, vvBottom - layoutHeight());
        }
        return Math.max(0, Math.ceil(extra) + PAD);
    }
    function setTransformInstant(h) { el.style.transition = 'transform 0s'; const ty = Math.max(0, MAX - h); if (ty !== lastPX) { el.style.transform = `translateY(${ty}px)`; lastPX = ty; lastH = h; } }
    function setTransformAnimated(h) { el.style.transition = 'transform .12s ease-out'; const ty = Math.max(0, MAX - h); if (ty !== lastPX) { el.style.transform = `translateY(${ty}px)`; lastPX = ty; lastH = h; } }
    function tick() {
        if (!UNDER_DESKTOP()) {
            if (lastPX !== MAX) { el.style.transition = 'transform .12s ease-out'; el.style.transform = `translateY(${MAX}px)`; lastPX = MAX; lastH = 0; }
            return;
        }
        el.style.display = 'block';
        const h = measureH();
        if (h > lastH) setTransformInstant(h); else if (h < lastH) setTransformAnimated(h);
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

function isSubDesktopLandscape() {
    const W = STABLE_VP_W || window.innerWidth;
    const H = STABLE_VP_H || window.innerHeight;
    return (W > H) && (W < 1025);
}

function setContentTransformFromScroll() {
    if (!contentGroup) return;
    const { w } = getLayoutMetrics();
    if (isLandscapeLike()) {
        contentGroup.position.set(-currentScrollX, 0, 0);
    } else {
        contentGroup.position.set(0, currentScrollY, 0);
    }
    const wp = new THREE.Vector3(lastMouseScreenPos.x, lastMouseScreenPos.y, 0).unproject(camera);
    updateMouseSquareTarget(wp);
}

function updateScrollDocHeight(mobileWorldContentHeight) {
    const spacer = document.getElementById('scroll-spacer');
    if (!spacer) return;
    const stableH = STABLE_VP_H || window.innerHeight;

    if (!isLandscapeLike()) {
        spacer.style.height = stableH + 'px';
        spacer.style.width = '1px';
        spacer.style.display = 'block';
        const root = rootScroller();
        root.style.overflowX = 'hidden';
        root.style.overflowY = 'hidden';
        root.style.webkitOverflowScrolling = 'auto';
        currentScrollY = Math.min(Math.max(0, currentScrollY || 0), maxScrollY || 0);
        return;
    }

    spacer.style.height = stableH + 'px';
    spacer.style.width = '1px';
    spacer.style.display = 'block';
    const root = rootScroller();
    root.style.overflowX = 'hidden';
    root.style.overflowY = 'hidden';
    root.style.webkitOverflowScrolling = 'auto';
    currentScrollX = Math.min(Math.max(0, currentScrollX || 0), maxScrollX || 0);
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
    function snapshotVV() { return { w: Math.round(window.visualViewport?.width || window.innerWidth), h: Math.round(window.visualViewport?.height || window.innerHeight), ot: Math.round(window.visualViewport?.offsetTop || 0) }; }
    function orientationFlip(pw, ph, w, h) { const prevPortrait = ph >= pw; const nowPortrait = h >= w; return prevPortrait !== nowPortrait; }
    function applyFooterTick() { if (typeof window.__mobileFooterTick === 'function') window.__mobileFooterTick(); }
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
            applyFooterTick();
            lastW = w; lastH = h; lastOT = ot;
            return;
        }

        const aspect = (w || 1) / (h || 1);
        const height = 10;
        const width = height * aspect;
        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(1);
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
            installDragSwipeScroll();
        }
        syncCategoryLabelSize(getLayoutMetrics());
        lastW = w; lastH = h; lastOT = ot;

        worker.postMessage({
            type: 'resize',
            bucket: currentBucket,
            config: { baseColsOverride: config.baseColsOverride },
            layout: getLayoutMetrics(),
            prefersReducedMotion: prefersReducedMotion
        });
    }
    function onResize() { if (raf) return; raf = requestAnimationFrame(handleResizeNow); }
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

function isLandscapeLike() {
    const W = STABLE_VP_W || window.innerWidth;
    const H = STABLE_VP_H || window.innerHeight;
    return W > H;
}

let isScrolling = false;
let scrollTimeout = null;

function installDragSwipeScroll() {
    const dragTarget = document.getElementById('webgl-canvas') || window;
    const html = document.documentElement;
    const body = document.body;
    if (window.__pointerDrag) { dragTarget.removeEventListener('pointerdown', window.__pointerDrag); window.__pointerDrag = null; }
    if (window.__pointerMove) { window.removeEventListener('pointermove', window.__pointerMove); window.__pointerMove = null; }
    if (window.__pointerUp) { window.removeEventListener('pointerup', window.__pointerUp); window.__pointerUp = null; }
    if (window.__pointerCancel) { window.removeEventListener('pointercancel', window.__pointerCancel); window.__pointerCancel = null; }
    if (window.__wheelScroll) { window.removeEventListener('wheel', window.__wheelScroll); window.__wheelScroll = null; }
    if (window.__arrowScroll) { window.removeEventListener('keydown', window.__arrowScroll); window.__arrowScroll = null; }

    const isLand = isLandscapeLike();
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
    if (dragTarget && dragTarget.style) dragTarget.style.setProperty('touch-action', 'none', 'important');

    const pxPerWorldX = () => { const pxW = STABLE_VP_W || window.innerWidth; const worldW = (camera.right - camera.left) || 1; return pxW / worldW; };
    const pxPerWorldY = () => { const pxH = STABLE_VP_H || window.innerHeight; const worldH = (camera.top - camera.bottom) || 1; return pxH / worldH; };
    const markLogicalScroll = () => { isScrolling = true; if (scrollTimeout) clearTimeout(scrollTimeout); scrollTimeout = setTimeout(() => { isScrolling = false; }, 120); };

    const setXWorld = (v) => {
        const next = Math.max(0, Math.min(v, maxScrollX));
        if (next !== currentScrollX) {
            currentScrollX = next;
            markLogicalScroll();
            worker.postMessage({ type: 'scroll', xWorld: currentScrollX, yWorld: currentScrollY, isScrolling: true });
        }
        setContentTransformFromScroll();
    };

    const setYWorld = (v) => {
        const next = Math.max(0, Math.min(v, maxScrollY));
        if (next !== currentScrollY) {
            currentScrollY = next;
            markLogicalScroll();
            worker.postMessage({ type: 'scroll', xWorld: currentScrollX, yWorld: currentScrollY, isScrolling: true });
        }
        setContentTransformFromScroll();
    };

    const updateMouseFromClient = (ev) => {
        const W = STABLE_VP_W || window.innerWidth;
        const H = STABLE_VP_H || window.innerHeight;
        const nx = (ev.clientX / W) * 2 - 1;
        const ny = -(ev.clientY / H) * 2 + 1;
        lastMouseScreenPos.set(nx, ny);
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
        startWorld = isLand ? currentScrollX : currentScrollY;
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
            worker.postMessage({ type: 'scroll', xWorld: currentScrollX, yWorld: currentScrollY, isScrolling: false });
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
            setXWorld(currentScrollX + delta / pxPerWorldX());
        } else {
            const absY = Math.abs(e.deltaY);
            const absX = Math.abs(e.deltaX);
            const delta = (absY >= absX ? e.deltaY : e.deltaX) * WHEEL_SENS;
            setYWorld(currentScrollY + delta / pxPerWorldY());
        }
        e.preventDefault();
        if(scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
             worker.postMessage({ type: 'scroll', xWorld: currentScrollX, yWorld: currentScrollY, isScrolling: false });
        }, 150);
    };
    window.addEventListener('wheel', window.__wheelScroll, { passive: false });

    window.__arrowScroll = (e) => {
        if (isLand) {
            const stepPx = Math.round((STABLE_VP_W || window.innerWidth) * 0.25);
            const worldW = (camera.right - camera.left) || 1;
            const stepW = stepPx / ((STABLE_VP_W || window.innerWidth) / worldW);
            if (e.key === 'ArrowRight') { setXWorld(currentScrollX + stepW); e.preventDefault(); }
            if (e.key === 'ArrowLeft') { setXWorld(currentScrollX - stepW); e.preventDefault(); }
        } else {
            const stepPx = Math.round((STABLE_VP_H || window.innerHeight) * 0.25);
            const worldH = (camera.top - camera.bottom) || 1;
            const stepH = stepPx / ((STABLE_VP_H || window.innerHeight) / worldH);
            if (e.key === 'ArrowDown') { setYWorld(currentScrollY + stepH); e.preventDefault(); }
            if (e.key === 'ArrowUp') { setYWorld(currentScrollY - stepH); e.preventDefault(); }
        }
        if(scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
             worker.postMessage({ type: 'scroll', xWorld: currentScrollX, yWorld: currentScrollY, isScrolling: false });
        }, 150);
    };
    window.addEventListener('keydown', window.__arrowScroll);
}

function rebuildDomLabel(st, label) {
    if (st.baffles) { st.baffles.forEach(b => b.stop()); st.baffles = null; }
    if (st.domLabelEl) { st.domLabelEl.remove(); st.domLabelEl = null; }
    const layer = document.getElementById('labels-layer');
    if (layer) layer.style.zIndex = '3';
    const el = makeDomLabelEl(label);
    const isBlackSquare = String(label).toLowerCase().includes('lorem ipsum');
    st.isBlackSquare = isBlackSquare;
    if (isBlackSquare) el.classList.add('black-text');
    el.style.transformOrigin = '100% 0%';
    el.style.textAlign = 'right';
    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.textRendering = 'optimizeLegibility';
    el.style.webkitFontSmoothing = 'antialiased';
    el.style.direction = 'ltr';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0s linear';
    const lines = Array.from(el.querySelectorAll('.line'));
    st.lines = lines;
    st.labelText = label;
    lines.forEach(line => {
        line.style.display = 'block';
        line.style.whiteSpace = isBlackSquare ? 'normal' : 'nowrap';
        line.style.textAlign = isBlackSquare ? 'left' : 'right';
    });
    layer?.appendChild(el);
    st.domLabelEl = el;
    const prev = el.style.transform;
    el.style.transform = 'translate(-10000px,-10000px)';
    const fm = FontMetrics.measure(label);
    st.baseFontPx = fm.fontSize;
    st.labelBaseWidthPx = fm.width;
    const firstLine = String(label).split('\n')[0];
    st.firstLineBaseWidthPx = FontMetrics.measure(firstLine).width;
    el.style.transform = prev || '';
    const alreadyAnimated = !!st.hasAnimatedBaffle;
    if (!isMobileBucket() && window.baffle && !alreadyAnimated) {
        st.baffles = lines.map(line => window.baffle(line).set({ characters: '!/|~#.^+*$#%sooxy', speed: 100 }));
    } else {
        st.baffles = null;
    }
    st.hovering = false;
    st.appearTriggered = false;
}

function ensureGlobalLabelFontPx(lm) {
    const isMobilePortrait = currentBucket === 'mobile-v';
    const isTabletPortrait = currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16';
    const baseDesktop = 13;
    const baseTablet = 12;
    const baseMobile = 11;
    let base;
    if (isMobilePortrait) base = baseMobile;
    else if (isTabletPortrait) base = baseTablet;
    else base = baseDesktop;
    const scale = viewportLabelScaleFactor();
    return base * scale;
}

function syncCategoryLabelSize(lmOverride) {
    const catEl = document.getElementById('category-label');
    if (!catEl) return;
    const lm = lmOverride || getLayoutMetrics();
    const basePx = ensureGlobalLabelFontPx(lm);
    const titlePx = basePx * 1.6;
    catEl.style.fontSize = `${titlePx}px`;
}

function updateDomLabelLayout(st, lm) {
    if (!st.domLabelEl) return;
    const el = st.domLabelEl;
    const { w } = lm;
    const targetSize = (st.targetScale && st.targetScale.x) || st.originalSize || w;
    const currentSize = (st.currentScale && st.currentScale.x) || (st.mesh ? st.mesh.scale.x : targetSize);
    const ratio = targetSize > 0 ? (currentSize / targetSize) : 1;
    const dispS = Math.max(0, currentSize);
    const localX = st.currentPosition ? st.currentPosition.x : (st.mesh ? st.mesh.position.x : 0);
    const localY = st.currentPosition ? st.currentPosition.y : (st.mesh ? st.mesh.position.y : 0);
    const gx = contentGroup?.position?.x || 0;
    const gy = contentGroup?.position?.y || 0;
    const worldX = localX + gx;
    const worldY = localY + gy;
    const half = dispS / 2;
    const isBlackSquare = !!st.isBlackSquare || (st.labelText && st.labelText.toLowerCase().includes('lorem ipsum'));
    const isPortraitBucket = currentBucket === 'mobile-v' || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16';

    let isLeftOfImage = false;
    if (isBlackSquare && isPortraitBucket) {
        const cx = localX;
        const cy = localY;
        let bestD2 = Infinity;
        let bestImageX = null;
        for (const other of fractalState.values()) {
            if (!other.isImage) continue;
            const ox = other.currentPosition ? other.currentPosition.x : (other.mesh ? other.mesh.position.x : 0);
            const oy = other.currentPosition ? other.currentPosition.y : (other.mesh ? other.mesh.position.y : 0);
            const dx = ox - cx;
            const dy = oy - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                bestImageX = ox;
            }
        }
        if (bestImageX != null) {
            if (bestImageX > cx + 1e-4) isLeftOfImage = true;
        }
    }

    const alignRightInside = isBlackSquare && isPortraitBucket && isLeftOfImage;
    const marginPctRight = 1 / Math.pow(2, (LABEL_MARGIN_DEPTH_RIGHT - 2));
    const marginPctTop = 1 / Math.pow(2, (LABEL_MARGIN_DEPTH_TOP - 2));
    let mRightWorld = dispS * marginPctRight;
    const mTopWorld = dispS * marginPctTop;
    let mLeftWorld = 0;
    let txWorld, tyWorld;

    if (isBlackSquare) {
        mLeftWorld = dispS * marginPctTop;
        mRightWorld = mLeftWorld;
        if (alignRightInside) txWorld = worldX + half - mRightWorld;
        else txWorld = worldX - half + mLeftWorld;
        tyWorld = worldY + half - mTopWorld;
    } else {
        txWorld = worldX + half - mRightWorld;
        tyWorld = worldY + half - mTopWorld;
    }

    if ((!st.labelBaseWidthPx || st.labelBaseWidthPx <= 0) && st.domLabelEl) {
        const fm = FontMetrics.measure(st.labelText || '');
        st.baseFontPx = fm.fontSize;
        st.labelBaseWidthPx = fm.width;
        const firstLine = String(st.labelText || '').split('\n')[0];
        st.firstLineBaseWidthPx = FontMetrics.measure(firstLine).width;
    }

    const targetS = Math.max(0, st.targetScale?.x || dispS);
    const pxPerWorldX = (STABLE_VP_W || window.innerWidth) / (camera.right - camera.left);
    let availablePxFinal;
    if (isBlackSquare) {
        const innerWorld = Math.max(0, dispS - (mLeftWorld + mRightWorld));
        availablePxFinal = innerWorld * pxPerWorldX;
        el.style.maxWidth = `${availablePxFinal}px`;
    } else {
        availablePxFinal = computeSquareInnerWidthPx(targetS);
        el.style.maxWidth = '';
    }

    const baseFontPx = ensureGlobalLabelFontPx(lm);
    const isMobilePortrait = currentBucket === 'mobile-v';
    const isCompact = isMobilePortrait || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16';
    const perPx = (st.labelBaseWidthPx > 0 && st.baseFontPx > 0) ? (st.labelBaseWidthPx / st.baseFontPx) : 0;
    let maxByWidth = perPx > 0 ? (availablePxFinal / perPx) : (st.baseFontPx || baseFontPx);
    let finalFontPx;

    if (isBlackSquare) {
        if (isCompact) {
            finalFontPx = Math.min(maxByWidth, baseFontPx * 0.9);
            finalFontPx = Math.max(finalFontPx, isMobilePortrait ? 11 : 12);
        } else {
            finalFontPx = Math.min(maxByWidth, baseFontPx);
            finalFontPx = Math.max(finalFontPx, 13);
        }
    } else {
        if (isCompact) {
            finalFontPx = Math.min(maxByWidth, baseFontPx * 0.9);
            finalFontPx = Math.max(finalFontPx, isMobilePortrait ? 10 : 11);
        } else {
            finalFontPx = Math.min(maxByWidth, baseFontPx * 0.9);
            finalFontPx = Math.max(finalFontPx, 12);
        }
    }

    finalFontPx = Math.round(finalFontPx * 2) / 2;
    finalFontPx = Math.max(9, Math.min(64, finalFontPx));
    el.style.fontSize = finalFontPx + 'px';
    el.style.color = '#f3f1ee';

    if (!st.appearTriggered && ratio >= 0.8) {
        st.appearTriggered = true;
        el.style.opacity = '1';
        if (st.baffles && !st.hasAnimatedBaffle) {
            st.hasAnimatedBaffle = true;
            st.baffles.forEach(b => { b.start(); b.reveal(600); });
        }
    }

    const desiredAlign = isBlackSquare ? (alignRightInside ? 'right' : 'left') : 'right';
    el.style.setProperty('text-align', desiredAlign, 'important');
    if (st.lines) st.lines.forEach(line => line.style.setProperty('text-align', desiredAlign, 'important'));
    const originX = (isBlackSquare && !alignRightInside) ? '0%' : '100%';
    el.style.transformOrigin = `${originX} 0%`;
    const p = worldToClientXY(new THREE.Vector3(txWorld, tyWorld, 0));
    const translateX = (isBlackSquare && !alignRightInside) ? 'translateX(0%)' : 'translateX(-100%)';
    el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + LABEL_NUDGE_PX_Y)}px) ${translateX}`;
}

function destroyDomLabel(st) {
    if (st.baffles) { st.baffles.forEach(b => b.stop()); st.baffles = null; }
    if (st.domLabelEl) { st.domLabelEl.remove(); st.domLabelEl = null; }
}

function syncStateToMeshes(cells) {
    const getOccluderMaterial = () => {
        if (!scene.userData.occluderMaterial) scene.userData.occluderMaterial = new THREE.MeshBasicMaterial({ color: config.darkColor, depthTest: false, depthWrite: false });
        return scene.userData.occluderMaterial;
    };
    const isMobile = isMobileBucket();
    const IMAGE_ORDER = 2.96;
    const lm = getLayoutMetrics();
    const screenL = camera.left - (contentGroup?.position?.x || 0);
    const screenR = camera.right - (contentGroup?.position?.x || 0);
    const screenB = camera.bottom - (contentGroup?.position?.y || 0);
    const screenT = lm.contentTop - (contentGroup?.position?.y || 0);

    const currentKeys = new Set(fractalState.keys());
    const newKeys = new Set();

    for (const cell of cells) {
        newKeys.add(cell.key);
        const key = cell.key;
        const ex = fractalState.get(key);
        const half = cell.size / 2;
        const isVisibleStrictly = !((cell.x + half) < screenL || (cell.x - half) > screenR || (cell.y + half) < screenB || (cell.y - half) > screenT);
        const startScale = isVisibleStrictly ? 0 : cell.size;
        const isImg = cell.isImage;
        const isBtn = cell.isButton;

        if (isImg) {
            const url = cell.imgUrl;
            const material = getImageMaterial(url);
            if (ex) {
                ex.logicalCenter ||= new THREE.Vector3(); ex.logicalCenter.set(cell.x, cell.y, 0);
                ex.anchorPosition ||= new THREE.Vector3(); ex.anchorPosition.set(cell.x, cell.y, 0);
                ex.mesh.position.set(cell.x, cell.y, 0);
                ex.targetScale.set(cell.size, cell.size, 1);
                ex.originalSize = cell.originalSize;
                if (ex.mesh.material !== material) ex.mesh.material = material;
                ex.isButton = isBtn;
                ex.isImage = isImg;
                ex.mesh.renderOrder = IMAGE_ORDER;
                ex.btnData = cell.btnData;
            } else {
                const mesh = meshPool.pop() || new THREE.Mesh(geometry);
                mesh.material = material;
                mesh.position.set(cell.x, cell.y, 0);
                mesh.scale.set(startScale, startScale, 1);
                mesh.renderOrder = IMAGE_ORDER;
                contentGroup.add(mesh);
                const st = {
                    mesh, dotMesh: null, labelSprite: null, domLabelEl: null, baffles: null, occluderMesh: null, hovering: false,
                    logicalCenter: new THREE.Vector3(cell.x, cell.y, 0), anchorPosition: new THREE.Vector3(cell.x, cell.y, 0),
                    targetPosition: new THREE.Vector3(cell.x, cell.y, 0), targetScale: new THREE.Vector3(cell.size, cell.size, 1),
                    originalSize: cell.originalSize, isButton: isBtn, isImage: isImg, currentPosition: new THREE.Vector3(cell.x, cell.y, 0), currentScale: new THREE.Vector3(startScale, startScale, 1),
                    btnData: cell.btnData
                };
                fractalState.set(key, st);
            }
        } else {
            if (ex) {
                ex.logicalCenter ||= new THREE.Vector3(); ex.logicalCenter.set(cell.x, cell.y, 0);
                ex.anchorPosition ||= new THREE.Vector3(); ex.anchorPosition.set(cell.x, cell.y, 0);
                ex.targetPosition.set(cell.x, cell.y, 0);
                ex.targetScale.set(cell.size, cell.size, 1);
                ex.originalSize = cell.originalSize;
                ex.isButton = isBtn;
                ex.isImage = isImg;
                ex.btnData = cell.btnData;
                if (isBtn) {
                    const label = cell.btnData?.label || '';
                    if (!ex.domLabelEl || ex.labelText !== label) rebuildDomLabel(ex, label);
                } else { destroyDomLabel(ex); }
                if (isBtn && isMobile) {
                    const insetPx = Math.max(MOBILE_BTN_OCCLUDER_PAD_PX || 1, 1);
                    const inset = lm.onePxWorld * insetPx;
                    if (!ex.occluderMesh) { ex.occluderMesh = new THREE.Mesh(geometry, getOccluderMaterial()); contentGroup.add(ex.occluderMesh); }
                    ex.occluderMesh.renderOrder = IMAGE_ORDER - 0.01;
                    ex.occluderMesh.position.set(cell.x, cell.y, 0.05);
                    const sz = Math.max(0, cell.size - inset * 2);
                    ex.occluderMesh.scale.set(sz, sz, 1);
                } else if (ex.occluderMesh) { contentGroup.remove(ex.occluderMesh); ex.occluderMesh = null; }
            } else {
                const st = {
                    mesh: null, dotMesh: null, labelSprite: null, domLabelEl: null, baffles: null, occluderMesh: null, hovering: false,
                    logicalCenter: new THREE.Vector3(cell.x, cell.y, 0), anchorPosition: new THREE.Vector3(cell.x, cell.y, 0),
                    targetPosition: new THREE.Vector3(cell.x, cell.y, 0), targetScale: new THREE.Vector3(cell.size, cell.size, 1),
                    currentPosition: new THREE.Vector3(cell.x, cell.y, 0), currentScale: new THREE.Vector3(startScale, startScale, 1),
                    originalSize: cell.originalSize, isButton: isBtn, isImage: isImg,
                    btnData: cell.btnData
                };
                fractalState.set(key, st);
                if (isBtn && isMobile) {
                    const insetPx = Math.max(MOBILE_BTN_OCCLUDER_PAD_PX || 1, 1);
                    const inset = lm.onePxWorld * insetPx;
                    st.occluderMesh = new THREE.Mesh(geometry, getOccluderMaterial());
                    st.occluderMesh.renderOrder = IMAGE_ORDER - 0.01;
                    st.occluderMesh.position.set(cell.x, cell.y, 0.05);
                    const sz = Math.max(0, cell.size - inset * 2);
                    st.occluderMesh.scale.set(sz, sz, 1);
                    contentGroup.add(st.occluderMesh);
                }
            }
        }
    }

    for (const key of currentKeys) {
        if (!newKeys.has(key)) {
            const st = fractalState.get(key);
            st.targetScale.set(0, 0, 0);
            if (st.dotMesh) st.dotMesh.scale.set(0, 0, 0);
            if (st.labelSprite) { scene.remove(st.labelSprite); st.labelSprite = null; }
            if (st.occluderMesh) { contentGroup.remove(st.occluderMesh); st.occluderMesh = null; }
            if (st.domLabelEl) { st.domLabelEl.remove(); st.domLabelEl = null; }
            if (st.baffles) { st.baffles.forEach(b => b.stop()); st.baffles = null; }
        }
    }
}

function getImageMaterial(url) {
    const PLACEHOLDER_KEY = '__placeholder__';
    const BLACK_IMAGE_KEY = 'BLACK_IMAGE';
    const getPlaceholder = () => { if (!materialCache.has(PLACEHOLDER_KEY)) materialCache.set(PLACEHOLDER_KEY, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.placeholder) })); return materialCache.get(PLACEHOLDER_KEY); };
    if (url === BLACK_IMAGE_KEY) { if (!materialCache.has(BLACK_IMAGE_KEY)) materialCache.set(BLACK_IMAGE_KEY, new THREE.MeshBasicMaterial({ color: config.darkColor })); return materialCache.get(BLACK_IMAGE_KEY); }
    if (!url) return getPlaceholder();
    if (materialCache.has(url)) return materialCache.get(url);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: null });
    textureLoader.load(url, tex => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        mat.map = tex; mat.needsUpdate = true;
    }, undefined, () => { mat.map = null; mat.color.set(COLORS.placeholder); mat.needsUpdate = true; });
    materialCache.set(url, mat);
    return mat;
}

function getDotScale(state) {
    if (currentBucket === 'mobile-v' || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16') {
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

function computeSquareInnerWidthPx(sideWorld) {
    const marginPctRight = 1 / Math.pow(2, (LABEL_MARGIN_DEPTH_RIGHT - 2));
    const marginWorld = Math.max(0, sideWorld * marginPctRight);
    const innerWorld = Math.max(0, sideWorld - marginWorld * 2);
    const pxPerWorldX = (STABLE_VP_W || window.innerWidth) / (camera.right - camera.left);
    return innerWorld * pxPerWorldX;
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
    if (worldPos.y >= contentTop) {
        let fs = Math.max(0, (w / 2) - config.borderWidth);
        mouseSquare.userData.anchor = null;
        mouseSquare.userData.targetPosition.set(worldPos.x, worldPos.y, 4);
        mouseSquare.userData.targetScale.set(fs, fs, 1);
        cursorBorder.userData.targetPosition.set(worldPos.x, worldPos.y, 3);
        cursorBorder.userData.targetScale.set(fs + config.borderWidth, fs + config.borderWidth, 1);
        mouseSquare.renderOrder = 200;
        cursorBorder.renderOrder = 199;
        return;
    }
    mouseSquare.renderOrder = 4;
    cursorBorder.renderOrder = 3;
}

function isMobileBucket() {
    return currentBucket === 'mobile-v' || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16';
}

function isShortPortrait() {
    const H = STABLE_VP_H || window.innerHeight;
    const W = STABLE_VP_W || window.innerWidth;
    return (H > W) && (H < 1000);
}

function isTabletLandscapeStrict() {
    const W = STABLE_VP_W || window.innerWidth;
    const H = STABLE_VP_H || window.innerHeight;
    return (W > H) && (W >= 641) && (W < 1025);
}

function animate() {
    requestAnimationFrame(animate);
    if (window.__mobileFooterTick) window.__mobileFooterTick();
    const wp = new THREE.Vector3(lastMouseScreenPos.x, lastMouseScreenPos.y, 0).unproject(camera);

    updateMouseSquareTarget(wp);
    const isMobile = isMobileBucket();
    mouseSquare.visible = !isMobile;
    cursorBorder.visible = !isMobile;
    if (domCursorEl && isMobile) domCursorEl.style.opacity = '0';

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
        mouseSquare.position.lerp(mouseSquare.userData.targetPosition, fCursor);
        mouseSquare.scale.lerp(mouseSquare.userData.targetScale, fCursor);
        cursorBorder.position.lerp(cursorBorder.userData.targetPosition, fCursor);
        cursorBorder.scale.lerp(cursorBorder.userData.targetScale, fCursor);
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

    let bgIdx = 0, btnIdx = 0, bgDotIdx = 0, btnDotIdx = 0;
    for (const [key, st] of fractalState) {
        if (st.mesh) st.mesh.scale.lerp(st.targetScale, fGrid);
        if (st.currentScale) st.currentScale.lerp(st.targetScale, fGrid);
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
        if (st.isButton && st.domLabelEl) updateDomLabelLayout(st, lm);

        if (!st.isImage) {
            dummyObj.position.set(curX, curY, 0);
            dummyObj.scale.set(curS, curS, 1);
            dummyObj.updateMatrix();
            if (st.isButton) {
                if (btnIdx < MAX_INSTANCES) btnSquaresInstanced.setMatrixAt(btnIdx++, dummyObj.matrix);
            } else {
                if (bgIdx < MAX_INSTANCES) bgSquaresInstanced.setMatrixAt(bgIdx++, dummyObj.matrix);
            }
            if (config.showDots) {
                const centerVisible = curX >= L + eps && curX <= R - eps && curY >= B + eps && curY <= T - eps && curS > 0.0001;
                const showDot = st.isButton ? centerVisible : (centerVisible && !isInsideAnyButton(curX, curY));
                if (showDot) {
                    const sc = getDotScale(st);
                    dummyObj.scale.set(sc, sc, 1);
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

    bgSquaresInstanced.count = bgIdx;
    bgSquaresInstanced.instanceMatrix.needsUpdate = true;
    btnSquaresInstanced.count = btnIdx;
    btnSquaresInstanced.instanceMatrix.needsUpdate = true;
    bgDotsInstanced.count = bgDotIdx;
    bgDotsInstanced.instanceMatrix.needsUpdate = true;
    btnDotsInstanced.count = btnDotIdx;
    btnDotsInstanced.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
    const canvas = document.getElementById('webgl-canvas');
    if (canvas && canvas.style.opacity !== '1') canvas.style.opacity = '1';
}

function onMouseMove(e) {
    const vpW = STABLE_VP_W || window.innerWidth;
    const vpH = STABLE_VP_H || window.innerHeight;
    const nx = (e.clientX / vpW) * 2 - 1;
    const ny = -(e.clientY / vpH) * 2 + 1;
    lastMouseScreenPos.set(nx, ny);
    if (domCursorEl) domCursorEl.style.opacity = '0';
    const headerEl = document.getElementById('ui-header');
    const headerPx = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 0;
    const inHeader = e.clientY <= headerPx;
    const wp = new THREE.Vector3((e.clientX / vpW) * 2 - 1, -(e.clientY / vpH) * 2 + 1, 0).unproject(camera);
    updateMouseSquareTarget(wp);
    const { contentTop } = getLayoutMetrics();
    if (!inHeader && wp.y < contentTop) {
        worker.postMessage({ type: 'refine', x: wp.x, y: wp.y });
    }
}

function onClick(e) {
    if (e.altKey) return;
    const wp = new THREE.Vector3(lastMouseScreenPos.x, lastMouseScreenPos.y, 0).unproject(camera);
    const { contentTop } = getLayoutMetrics();
    if (wp.y >= contentTop) return;
    const gx = contentGroup?.position?.x || 0;
    const gy = contentGroup?.position?.y || 0;
    const lx = wp.x - gx;
    const ly = wp.y - gy;

    for (const [key, st] of Array.from(fractalState.entries())) {
        if (!st.isButton) continue;
        const half = st.targetScale.x / 2;
        const inside = (lx >= st.targetPosition.x - half && lx <= st.targetPosition.x + half && ly >= st.targetPosition.y - half && ly <= st.targetPosition.y + half);
        if (inside) {
             if (st.btnData) {
                 if (st.btnData.url === '#' || key.startsWith('black/')) {
                     worker.postMessage({ type: 'reform' });
                 } else {
                     window.location.href = st.btnData.url;
                 }
                 return;
             }
        }
    }

    worker.postMessage({ type: 'reform' });
}
