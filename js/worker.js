import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js';

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
    mouseSquareAnimationSpeed: 0.4,
    gridAnimationSpeed: 0.08,
    grainOpacity: 0.12,
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
        imagesD1: [{ row: 0, col: 0 }],
        imagesD2: [{ size: 'D2', row: 0, col: 2, quad: 1 }],
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
const LABEL_MARGIN_DEPTH_RIGHT = 6;
const CONTENT_COLS = 4;
const NO_D1_CONTENT_COLS = new Set([1, 2]);
const MOBILE_BTN_OCCLUDER_PAD_PX = 1;

let rngFn;
let noise2D;
let sessionSalt = (Math.random() * 0x7fffffff) | 0;
let globalClickNonce = 0;
let sceneUserData = {};

let targetState = new Map();
let imageCells = new Set();
let buttonCells = new Map();
let persistentButtonPaths = [];
let imageAssignment = new Map();
let imageSlots = new Set();
let buttonSlots = new Set();
let imageTextures = [];

let currentBucket = null;
let baseCols = 4;
let baseRowsPrimary = 2;
let WANT_D1 = 1;
let WANT_D2 = 4;
let BUTTONS_ON_D2 = true;
let TARGET_DEPTH = 6;

let layoutMetrics = {
    viewHeight: 0,
    viewWidth: 0,
    w: 0,
    menuHeight: 0,
    contentTop: 0,
    onePxWorld: 0,
    camera: { left: 0, right: 0, top: 0, bottom: 0 },
    stableVpW: 0,
    stableVpH: 0
};

let scrollState = {
    xWorld: 0,
    yWorld: 0,
    maxWorldX: 0,
    maxWorldY: 0,
    isScrolling: false
};

function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return h; }
function saltedKey(path, salt) { return (hashCode(path) ^ salt) | 0; }
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
    const nonce = (sceneUserData._regenNonce | 0) >>> 0;
    const base = (sessionSalt ^ (Date.now() >>> 0) ^ nonce ^ (extraSeed >>> 0)) >>> 0;
    rngFn = mulberry32(base);
    noise2D = createNoise2D(rngFn);
    sceneUserData._randSalt = base >>> 0;
}

reseed();

self.onmessage = function (e) {
    const data = e.data;
    switch (data.type) {
        case 'init':
        case 'resize':
            updateLayout(data);
            break;
        case 'scroll':
            updateScroll(data);
            break;
        case 'images':
            imageTextures = data.images;
            buildFreeOverlays();
            sendUpdate();
            break;
        case 'refine':
            handleRefine(data.x, data.y);
            break;
        case 'reform':
            reformGridKeepImages();
            sendUpdate();
            break;
    }
};

function updateLayout(data) {
    layoutMetrics = data.layout;
    currentBucket = data.bucket;
    config.baseColsOverride = data.config.baseColsOverride;

    if (data.prefersReducedMotion !== undefined) {
        config.mouseSquareAnimationSpeed = data.prefersReducedMotion ? 0.15 : 0.4;
        config.gridAnimationSpeed = data.prefersReducedMotion ? 0.05 : 0.08;
        config.grainOpacity = data.prefersReducedMotion ? 0.0 : 0.12;
    }

    applyBucket();

    if (data.type === 'init') {
        updateFractalBase(true);
    } else {
        updateFractalBase(false);
    }

    sendUpdate();
}

function updateScroll(data) {
    scrollState.xWorld = data.xWorld;
    scrollState.yWorld = data.yWorld;
    scrollState.isScrolling = data.isScrolling;

    updateFractalBase(false);
    sendUpdate();
}

function sendUpdate() {
    const cells = [];
    for (const [key, val] of targetState) {
        const isImg = imageCells.has(key);
        const isBtn = buttonCells.has(key);
        let btnData = null;
        let imgUrl = null;

        if (isBtn) {
            btnData = buttonCells.get(key);
        }
        if (isImg) {
            imgUrl = imageAssignment.get(key);
        }

        cells.push({
            key,
            x: val.x,
            y: val.y,
            size: val.size,
            depth: val.depth,
            originalSize: val.originalSize,
            isImage: isImg,
            isButton: isBtn,
            imgUrl,
            btnData
        });
    }

    let hMax = 0;
    let vMax = 0;

    if (sceneUserData._hscroll) hMax = sceneUserData._hscroll.maxWorld;
    if (sceneUserData._vscroll) vMax = sceneUserData._vscroll.maxWorld;

    self.postMessage({
        type: 'update',
        cells: cells,
        scrollMax: { x: hMax, y: vMax },
        mobileWorldContentHeight: sceneUserData.mobileWorldContentHeight || 0
    });
}

function applyBucket() {
    const b = BUCKETS.find(x => x.id === currentBucket);
    const isTabletPortrait = (currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16');
    const isPhonePortrait = (currentBucket === 'mobile-v');
    const isTabletLand = isTabletLandscapeStrict();
    const forceSubDesktopLandscape = isSubDesktopLandscape() && !isTabletLand;

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
        } else {
            baseCols = b?.grid?.cols || 4;
            baseRowsPrimary = b?.grid?.rows || 2;
        }
    } else {
        baseCols = 2;
        baseRowsPrimary = 2;
    }

    const wishKey = forceSubDesktopLandscape ? 'desktop-16:9' : (currentBucket === 'mobile-h' ? 'desktop-16:9' : currentBucket);
    const wish = LAYOUT_WISH[wishKey] || { wantD1: 1, wantD2: 4, buttonsOnD2: true };
    WANT_D1 = wish.wantD1;
    WANT_D2 = wish.wantD2;
    BUTTONS_ON_D2 = wish.buttonsOnD2;

    const portraitMobileLike = isPhonePortrait || isTabletPortrait;
    TARGET_DEPTH = portraitMobileLike ? 6 : 6;
    if (portraitMobileLike) {
        TARGET_DEPTH = Math.max(config.minDepth, (TARGET_DEPTH | 0) - 1);
    }
    config.refineChanceD2 = portraitMobileLike ? 0.3 : 0.55;

    updateScrollDocHeight();
}

function isTabletLandscapeStrict() {
    const W = layoutMetrics.stableVpW;
    const H = layoutMetrics.stableVpH;
    return (W > H) && (W >= 641) && (W < 1025);
}

function isSubDesktopLandscape() {
    const W = layoutMetrics.stableVpW;
    const H = layoutMetrics.stableVpH;
    return (W > H) && (W < 1025);
}

function isShortPortrait() {
    const H = layoutMetrics.stableVpH;
    const W = layoutMetrics.stableVpW;
    return (H > W) && (H < 1000);
}

function isLandscapeLike() {
    const W = layoutMetrics.stableVpW;
    const H = layoutMetrics.stableVpH;
    return W > H;
}

function isMobileBucket() {
    return currentBucket === 'mobile-v' || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16';
}

function updateScrollDocHeight() {
    const imgCount = (imageTextures && imageTextures.length) ? imageTextures.length : 0;
    const w = layoutMetrics.w;

    if (!isLandscapeLike()) {
        const viewHeight = layoutMetrics.viewHeight;
        const menuHeight = layoutMetrics.menuHeight;
        const V = (sceneUserData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 0, gapRows: 0 });
        V.patternRows = imgCount > 0 ? imgCount : 1;
        V.gapRows = config.overlayGapCols;
        const gapYWorld = Math.max(0, V.gapRows) * w;
        const totalWorld = (V.patternRows * w) + Math.max(0, V.patternRows - 1) * gapYWorld;
        const visibleWorld = Math.max(0, (viewHeight - menuHeight));
        V.maxWorld = Math.max(0, totalWorld - visibleWorld);
        sceneUserData.mobileWorldContentHeight = totalWorld;
    } else {
        const H = (sceneUserData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 0, gapCols: 0 });
        const contentCols = contentColsForBucket();
        H.gapCols = config.overlayGapCols;
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
        const totalWorld = (patternCols * w) + Math.max(0, patternCols - 1) * gapXWorld;
        const visibleWorld = (contentCols * w) + Math.max(0, contentCols - 1) * gapXWorld;
        H.maxWorld = Math.max(0, totalWorld - visibleWorld);
    }
}

function contentColsForBucket() {
    if (currentBucket === 'mobile-v' || currentBucket === 'tablet-3:4' || currentBucket === 'tablet-9:16') {
        return 2;
    }
    return CONTENT_COLS;
}

function contentOffsetColsForBucket() {
    if (isShortPortrait()) return 0;
    if (isTabletLandscapeStrict()) return 0;
    const contentCols = contentColsForBucket();
    return Math.max(0, (baseCols - contentCols) / 2);
}

function isInCullWindow(x, y, size) {
    const contentTop = layoutMetrics.contentTop;
    const viewW = layoutMetrics.viewWidth;
    const viewH = layoutMetrics.viewHeight;
    const cam = layoutMetrics.camera;

    const extendX = isLandscapeLike() ? viewW * 1.5 : 0;
    const extendY = isLandscapeLike() ? 0 : viewH * 1.5;

    const L = cam.left - extendX;
    const R = cam.right + extendX;
    const B = cam.bottom - extendY;
    const T = contentTop + extendY;
    const h = size * 0.5;
    const l = x - h, r = x + h, b = y - h, t = y + h;
    return !(r <= L || l >= R || t <= B || b >= T);
}

function isVisibleEnough(x, y, size, contentTop, minRatio = 0.5) {
    const cam = layoutMetrics.camera;
    const L = cam.left;
    const R = cam.right;
    const B = cam.bottom;
    const T = contentTop;
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

function isFullyVisible(x, y, size, contentTop) {
    const cam = layoutMetrics.camera;
    const onePxWorld = layoutMetrics.onePxWorld;
    const eps = Math.max(config.borderWidth * 2, onePxWorld * 0.5);
    const L = cam.left + eps;
    const R = cam.right - eps;
    const B = cam.bottom + eps;
    const T = contentTop - eps;
    const h = size * 0.5;
    return (x - h >= L && x + h <= R && y - h >= B && y + h <= T);
}

function createQuadTree(x, y, size, depth, path, maxDepthOverride = -1) {
    if (!isInCullWindow(x, y, size)) return;
    const salt = ((sceneUserData._randSalt | 0) >>> 0);
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

function updateFractalBase(forceFull = false) {
    if (forceFull) targetState.clear();

    const w = layoutMetrics.w;
    const viewWidth = layoutMetrics.viewWidth;
    const viewHeight = layoutMetrics.viewHeight;
    const contentTop = layoutMetrics.contentTop;
    const cam = layoutMetrics.camera;
    const preset = PRESETS[currentBucket] || PRESETS['desktop-16:9'];

    if (!preset) {
        ensureFallbackButtons();
        return true;
    }

    const isFastMode = scrollState.isScrolling && !forceFull;
    const scrollX = scrollState.xWorld;
    const scrollY = scrollState.yWorld;

    const genBuffX = isLandscapeLike() ? viewWidth * 2.0 : viewWidth * 0.5;
    const genBuffY = isLandscapeLike() ? viewHeight * 0.5 : viewHeight * 1.5;

    let minCol = Math.floor((scrollX - genBuffX) / w);
    let maxCol = Math.ceil((scrollX + viewWidth + genBuffX) / w);
    let minRow = Math.floor((scrollY - genBuffY) / w);
    let maxRow = Math.ceil((scrollY + viewHeight + genBuffY) / w);

    minCol = Math.max(0, minCol);
    minRow = Math.max(0, minRow);

    const pruneBuffer = w * 3;
    const keepMinX = cam.left + scrollX - genBuffX - pruneBuffer;
    const keepMaxX = cam.left + scrollX + viewWidth + genBuffX + pruneBuffer;
    const keepMinY = contentTop - scrollY - viewHeight - genBuffY - pruneBuffer;
    const keepMaxY = contentTop - scrollY + genBuffY + pruneBuffer;

    for (const [key, s] of Array.from(targetState.entries())) {
        if (imageCells.has(key) || buttonCells.has(key)) continue;
        if (s.x < keepMinX || s.x > keepMaxX || s.y < keepMinY || s.y > keepMaxY) {
            targetState.delete(key);
        }
    }

    if (isMobileBucket()) {
        const mobRows = mobileRowsNeeded();
        maxRow = Math.max(maxRow, mobRows);
    }

    const offsetCols = contentOffsetColsForBucket();
    const contentCols = contentColsForBucket();
    const FORCE_D1 = new Set();
    (preset?.buttons || []).forEach(b => { FORCE_D1.add(`content/${b.row}/${b.col}`); });
    (preset?.imagesD2 || []).forEach(im => { FORCE_D1.add(`content/${im.row}/${im.col}`); });

    for (let row = minRow; row < maxRow; row++) {
        const isPrimary = row < baseRowsPrimary;
        let startC = minCol;
        let endC = maxCol;

        for (let col = startC; col < endC; col++) {
            const x = cam.left + (col + 0.5 + (isPrimary ? offsetCols : 0)) * w;
            const y = contentTop - row * w - w / 2;

            if (!forceFull) {
                const existing = findLeafAt({x, y}, targetState);
                if (existing) continue;
            }

            let pref = 'filler';
            if (isPrimary) {
                if (col < Math.min(contentCols, baseCols)) pref = 'content';
                else pref = 'filler';
            } else {
                pref = 'content';
            }

            const path = `${pref}/${row}/${col}`;
            const forceThisCell = (pref === 'content') && FORCE_D1.has(path);
            createQuadTree(x, y, w, 1, path, forceThisCell ? 1 : -1);
        }

        if (isPrimary && minCol === 0) addPrimaryRowSideFillers(row, offsetCols);
    }

    if (minRow < mobileRowsNeeded()) {
        for (let row = minRow; row < maxRow; row++) {
            addRightFillersForOverlayPattern(row, offsetCols);
        }
    }

    if (currentBucket === 'desktop-21:9' || currentBucket === 'desktop-32:9') {
        for (let row = minRow; row < maxRow; row++) {
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

    cutOutUnderButtons();
    dedupeTargetState();
    forceNoD1GlobalExceptFixed();

    if (!isFastMode || forceFull) {
        sprinkleRefinements(isMobileBucket() ? 12 : 12);
        if (!isMobileBucket() && isLandscapeLike()) {
            enforceD2AdjacencyConstraint();
        }
        if (!isMobileBucket()) {
            enforceDepth6AdjacencyConstraint();
            enforceNoD1InColumns(NO_D1_CONTENT_COLS);
        }
    }

    return true;
}

function mobileRowsNeeded() {
    const viewHeight = layoutMetrics.viewHeight;
    const w = layoutMetrics.w;
    const menuHeight = layoutMetrics.menuHeight;
    const rowsVisible = Math.max(1, Math.ceil((viewHeight - menuHeight) / w));
    const V = (sceneUserData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 10, gapRows: 0 });
    const rowsScrolled = Math.max(0, Math.floor(Math.max(0, Math.min(V.yWorld || 0, V.maxWorld || 0)) / w));
    const EXTRA_BOTTOM_ROWS = 3;
    const SAFETY_ROWS = 2;
    let rowsPattern = 0;
    if (!isLandscapeLike()) {
        rowsPattern = Math.max(baseRowsPrimary, (V.patternRows || 10) + SAFETY_ROWS);
    }
    return Math.max(baseRowsPrimary, rowsScrolled + rowsVisible + EXTRA_BOTTOM_ROWS + SAFETY_ROWS, rowsPattern);
}

function addPrimaryRowSideFillers(row, offsetCols) {
    if (isShortPortrait()) return;
    if (isTabletLandscapeStrict()) return;
    const w = layoutMetrics.w;
    const contentTop = layoutMetrics.contentTop;
    const y = contentTop - row * w - w / 2;
    const innerLeftEdge = layoutMetrics.camera.left + offsetCols * w;
    const x = innerLeftEdge - 0.5 * w;
    const p = `filler/L/${row}/0`;
    createQuadTree(x, y, w, 1, p, -1);
}

function addRightFillersForOverlayPattern(row, offsetCols) {
    const w = layoutMetrics.w;
    const contentTop = layoutMetrics.contentTop;
    const y = contentTop - row * w - w / 2;
    const contentCols = contentColsForBucket();
    const H = (sceneUserData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 10, gapCols: 0 });
    const patternCols = H.patternCols || 10;
    H.gapCols = config.overlayGapCols;
    const gapXWorld = Math.max(0, H.gapCols) * w;
    const baseX = layoutMetrics.camera.left + (offsetCols + 0.5) * w;
    const lastCenterX = baseX + (patternCols - 1) * (w + gapXWorld);
    const rightEdge = lastCenterX + w / 2;
    const innerRightEdge = layoutMetrics.camera.left + (offsetCols + contentCols) * w;
    const stepX = w;
    const startX = innerRightEdge + w / 2;
    const EPS = 1e-6;
    let i = 0;
    for (let cx = startX; cx - w / 2 <= rightEdge + EPS; cx += stepX) {
        const p = `fillR/${row}/${i++}`;
        createQuadTree(cx, y, w, 1, p, -1);
    }
}

function addUltrawideRightFiller(row, offsetCols) {}

function findLeafAt(worldPos, stateMap) {
    const w = layoutMetrics.w;
    const contentTop = layoutMetrics.contentTop;
    const offsetCols = contentOffsetColsForBucket();
    const row = Math.floor((contentTop - worldPos.y) / w);
    const isPrimary = row < baseRowsPrimary;
    const effectiveOffset = isPrimary ? offsetCols : 0;
    const col = Math.floor((worldPos.x - layoutMetrics.camera.left) / w - effectiveOffset);

    const potentialRoots = [`content/${row}/${col}`, `filler/${row}/${col}`];
    if (col === -1) potentialRoots.push(`filler/L/${row}/0`);
    const contentCols = contentColsForBucket();
    if (col >= contentCols) {
        const relIndex = col - contentCols;
        potentialRoots.push(`fillR/${row}/${relIndex}`);
    }

    for (const rootPath of potentialRoots) {
        if (stateMap.has(rootPath)) return stateMap.get(rootPath);
        let cx = layoutMetrics.camera.left + (col + 0.5 + effectiveOffset) * w;
        let cy = contentTop - row * w - w / 2;
        let currentSize = w;
        let currentPath = rootPath;

        for (let d = 0; d < 9; d++) {
            const quarter = currentSize / 4;
            const isRight = worldPos.x > cx;
            const isTop = worldPos.y > cy;
            cx += isRight ? quarter : -quarter;
            cy += isTop ? quarter : -quarter;
            currentSize /= 2;
            let suffix = '';
            if (!isRight && isTop) suffix = '/0';
            else if (isRight && isTop) suffix = '/1';
            else if (!isRight && !isTop) suffix = '/2';
            else suffix = '/3';
            currentPath += suffix;
            if (stateMap.has(currentPath)) return stateMap.get(currentPath);
            if (currentSize < config.borderWidth) break;
        }
    }

    for (const key of imageCells) {
        const sq = stateMap.get(key);
        if (!sq) continue;
        const half = sq.originalSize * 0.5;
        if (worldPos.x >= sq.x - half && worldPos.x <= sq.x + half && worldPos.y >= sq.y - half && worldPos.y <= sq.y + half) return sq;
    }
    for (const [key, btn] of buttonCells) {
        if (key.startsWith('content/') || key.startsWith('filler/')) continue;
        const sq = stateMap.get(key);
        if (!sq) continue;
        const half = sq.originalSize * 0.5;
        if (worldPos.x >= sq.x - half && worldPos.x <= sq.x + half && worldPos.y >= sq.y - half && worldPos.y <= sq.y + half) return sq;
    }
    return null;
}

function handleRefine(x, y) {
    if (scrollState.isScrolling) return;
    if (isMobileBucket()) return;
    if (y >= layoutMetrics.contentTop) return;

    let refined = false, it = 0;
    const maxIt = 64;
    const isLand = isLandscapeLike();
    const limit = isLand ? (TARGET_DEPTH + 1) : TARGET_DEPTH;

    while (it < maxIt) {
        it++;
        const leaf = findLeafAt({x, y}, targetState);
        if (!leaf) break;
        if (imageCells.has(leaf.path) || buttonCells.has(leaf.path)) break;

        if (leaf.depth < limit) {
            refined = true;
            targetState.delete(leaf.path);
            const { x, y, originalSize: os, depth: d, path: p } = leaf;
            const ns = os / 2, nd = d + 1, o = os / 4;
            createQuadTree(x - o, y + o, ns, nd, p + '/0', nd);
            createQuadTree(x + o, y + o, ns, nd, p + '/1', nd);
            createQuadTree(x - o, y - o, ns, nd, p + '/2', nd);
            createQuadTree(x + o, y - o, ns, nd, p + '/3', nd);
        } else {
            break;
        }
    }

    if (refined) {
        cutOutUnderButtons();
        dedupeTargetState();
        sendUpdate();
    }
}

function ensureFallbackButtons() {
    const w = layoutMetrics.w;
    const contentTop = layoutMetrics.contentTop;
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
    const w = layoutMetrics.w;
    const contentTop = layoutMetrics.contentTop;
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
        const salt = ((sceneUserData._randSalt | 0) >>> 0);
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

function cutOutUnderButtons() {
    const onePxWorld = layoutMetrics.onePxWorld;
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
                break;
            }
        }
    }
}

function dedupeTargetState() {
    const onePxWorld = layoutMetrics.onePxWorld;
    const EPS = Math.max(1e-6, (onePxWorld || 0.001) * 0.25);
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
    for (const [path] of Array.from(targetState.entries())) { if (!kept.has(path)) targetState.delete(path); }
}

function forceNoD1GlobalExceptFixed() {
    const w = layoutMetrics.w;
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
        createQuadTree(x - o, y - o, ns, nd, path + '/2', -1);
        createQuadTree(x + o, y - o, ns, nd, path + '/3', -1);
    }
}

function enforceNoD1InColumns(colsSet) {
    const w = layoutMetrics.w;
    const contentTop = layoutMetrics.contentTop;
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
            targetState.set(p, { x: q.x, y: q.y, size: ns - config.borderWidth, depth: d, path: p, originalSize: ns });
        }
    }
}

function enforceNoD1InSideFillers() {
    const w = layoutMetrics.w;
    const contentTop = layoutMetrics.contentTop;
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
            targetState.set(p, { x: q.x, y: q.y, size: ns - config.borderWidth, depth: d, path: p, originalSize: ns });
        }
    }
}

function forceMobilePattern() {
    if (!isMobileBucket()) return;
    const w = layoutMetrics.w;
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
            targetState.set(p, { x: s.x + dx, y: s.y + dy, size: childSize, depth: d, path: p, originalSize: ns });
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

function sprinkleRefinements(maxOps = 24) {
    if (scrollState.isScrolling) return;
    const w = layoutMetrics.w;
    const isMobileLike = isMobileBucket();
    const nonce = (sceneUserData && (sceneUserData._regenNonce | 0)) || 0;
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

function enforceD2AdjacencyConstraint() {
    const w = layoutMetrics.w;
    const d2Size = w / 2;
    const eps = 1e-6;
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

function createBlackNeighborImages() {
    const w = layoutMetrics.w;
    const isPortrait = !isLandscapeLike();

    for (const imgPath of imageCells) {
        if (!imgPath.startsWith('rib/')) continue;
        const img = targetState.get(imgPath);
        if (!img || Math.abs(img.originalSize - w) > 1e-6) continue;
        const match = imgPath.match(/^rib\/(\d+)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        let blackX, blackY, blackPath;

        if (isPortrait) {
            const col = (index % 2 === 0) ? 0 : 1;
            if (col === 0) {
                blackX = img.x + w;
                blackY = img.y;
                blackPath = `black/${index}_right`;
            } else {
                blackX = img.x - w;
                blackY = img.y;
                blackPath = `black/${index}_left`;
            }
        } else {
            const row = (index % 2 === 0) ? 0 : 1;
            if (row === 0) {
                blackX = img.x;
                blackY = img.y - w;
                blackPath = `black/${index}_below`;
            } else {
                blackX = img.x;
                blackY = img.y + w;
                blackPath = `black/${index}_above`;
            }
        }
        const size = w - config.borderWidth;
        targetState.set(blackPath, { x: blackX, y: blackY, size: size, depth: 1, path: blackPath, originalSize: w });
        const title = `Title ${index + 1}`;
        const paragraph = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`;
        const labelText = `${title}\n${paragraph}`;
        buttonCells.set(blackPath, { category: 'black_text', label: labelText, url: '#' });
    }
}

function buildFreeOverlays() {
    if (!imageTextures || imageTextures.length === 0) {
        updateScrollDocHeight();
        return;
    }
    const w = layoutMetrics.w;
    const contentTop = layoutMetrics.contentTop;
    const stableTop = contentTop;
    const H = (sceneUserData._hscroll ||= { xWorld: 0, maxWorld: 0, patternCols: 10, gapCols: 0 });
    H.gapCols = config.overlayGapCols;
    const gapXWorld = Math.max(0, H.gapCols) * w;
    const bucketOffset = contentOffsetColsForBucket();
    const baseX = layoutMetrics.camera.left + (bucketOffset + 0.5) * w;
    const isPortrait = !isLandscapeLike();
    const expectedCount = imageTextures.length;
    const desired = new Set();
    const slots = [];

    if (isPortrait) {
        const V = (sceneUserData._vscroll ||= { yWorld: 0, maxWorld: 0, patternRows: 0, gapRows: 0 });
        V.patternRows = expectedCount;
        V.gapRows = config.overlayGapCols;
        const gapYWorld = Math.max(0, V.gapRows) * w;
        for (let i = 0; i < expectedCount; i++) {
            const col = (i % 2 === 0) ? 0 : 1;
            const cx = layoutMetrics.camera.left + (bucketOffset + col + 0.5) * w;
            const cy = stableTop - (i * (w + gapYWorld) + w / 2);
            const path = `rib/${i}`;
            desired.add(path);
            slots.push({ index: i, path, x: cx, y: cy, os: w, sz: Math.max(0, w - config.borderWidth) });
        }
        const totalWorld = (expectedCount * w) + Math.max(0, expectedCount - 1) * gapYWorld;
        sceneUserData.mobileWorldContentHeight = totalWorld;
        V.maxWorld = Math.max(0, totalWorld - (layoutMetrics.viewHeight - layoutMetrics.menuHeight));
    } else {
        for (let i = 0; i < expectedCount; i++) {
            const row = (i % 2 === 0) ? 0 : 1;
            const slot = Math.floor(i / 2);
            const col = (row === 0) ? (2 * slot) : (2 * slot + 1);
            const cx = baseX + col * (w + gapXWorld);
            const cy = stableTop - (row + 0.5) * w;
            const path = `rib/${i}`;
            desired.add(path);
            slots.push({ index: i, path, x: cx, y: cy, os: w, sz: Math.max(0, w - config.borderWidth) });
        }
    }

    for (const s of slots) {
        const existing = targetState.get(s.path);
        if (!existing) {
            targetState.set(s.path, { x: s.x, y: s.y, size: s.sz, depth: 1, path: s.path, originalSize: s.os });
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
    updateScrollDocHeight();
}

function reformGridKeepImages() {
    sceneUserData._regenNonce = ((sceneUserData._regenNonce | 0) + 1) | 0;
    globalClickNonce = (globalClickNonce + 1) | 0;
    reseed(globalClickNonce);

    const keysToKeep = new Set();
    for (const k of targetState.keys()) {
        if (k.startsWith('rib/') || k.startsWith('black/')) {
            keysToKeep.add(k);
        }
    }
    for (const k of Array.from(targetState.keys())) {
        if (!keysToKeep.has(k)) {
            targetState.delete(k);
        }
    }

    buttonCells.clear();
    buttonSlots.clear();

    updateFractalBase(true);
    buildFreeOverlays();
    createBlackNeighborImages();
    cutOutUnderButtons();
    dedupeTargetState();

    if (!isMobileBucket()) {
        sprinkleRefinements(12);
        if (isLandscapeLike()) {
            enforceD2AdjacencyConstraint();
            enforceDepth6AdjacencyConstraint();
            enforceNoD1InColumns(NO_D1_CONTENT_COLS);
        }
    }
}
