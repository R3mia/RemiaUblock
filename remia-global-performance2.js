/// remia-global-performance.js
/// world ISOLATED
/*
 * Remia Global Performance v2.2.0 (2026-11-14)
 * uBlock Origin custom resource for Firefox / Zen Browser.
 * My filters: /^.+$/##+js(remia-global-performance)
 * Put the HTTPS raw-file URL in userResourcesLocation.
 * Keep these two resource headers and do not insert blank lines.
 * This is a resource file, not a userscript or a filter list.
 * Media hints cannot undo requests which have already started.
 * Rendering savings depend on the page; no RAM or speed guarantee.
 */
(() => {
    'use strict';
    const CONFIG = {
        lazyImages: true,
        lazyIframes: true,
        asyncImageDecoding: true,
        optimizeLongArticleFeeds: true,
        watchDynamicFeeds: true,
        releaseContainmentOnInteraction: true,
        minimumArticlesPerFeed: 8,
        maxMediaToCheck: 180,
        maxArticlesToCheck: 180,
        maxArticlesPerPass: 64,
        maxOptimizedArticlesTotal: 120,
        maxObservedFeeds: 2,
        maxDynamicItemsToCheck: 80,
        observerLifetimeMs: 90000,
        offscreenViewportMultiplier: 1.5,
        idleTimeoutMs: 1400,
        latePassDelayMs: 1800,
        debug: false,
        excludedDomains: [
            'youtube.com', 'youtu.be',
            'accounts.google.com', 'mail.google.com',
            'docs.google.com', 'drive.google.com',
            'paypal.com', 'stripe.com',
            'outlook.live.com', 'outlook.office.com',
            'figma.com'
        ]
    };
    // Only the top-level HTML document is eligible.
    try {
        if (window !== window.top) return;
    } catch (_) { return; }
    const VERSION = '2.2.0';
    const OWNER = 'data-remia-global-performance';
    const STATUS = 'data-remia-global-performance-status';
    const ITEM = 'data-remia-global-performance-item';
    const SIZE = '--remia-global-block-size';
    const STYLE_ID = 'remia-global-performance-style';
    const ARTICLE = 'article, [role="article"]';
    const COMPLEX = 'article, [role="article"], video, audio, canvas, iframe, ' +
        'object, embed, form, input, textarea, select, button, details, dialog, ' +
        '[contenteditable]:not([contenteditable="false"]), [role="textbox"], ' +
        '[role="dialog"], [role="menu"], [role="button"], [aria-live], [popover]';
    const canContain = typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('content-visibility', 'auto') &&
        CSS.supports('contain-intrinsic-block-size', 'auto 300px');
    const stats = { passes: 0, images: 0, decoding: 0, iframes: 0, articles: 0, feeds: 0 };
    const managed = new Map();
    const articleQueue = new Map();
    const feedObservers = new Map();
    let root = null;
    let sheetElement = null;
    let styleState = 'not-needed';
    let lastError = '';
    let disposed = false;
    let finalized = false;
    let watchingClosed = false;
    let dynamicChecked = 0;
    let mediaPending = true;
    let discoveryPending = true;
    let idleHandle = null;
    let idleUsesRIC = false;
    let lateTimer = null;
    let observerStopTimer = null;
    let waitingForVisibility = false;
    // Diagnostics live in DOM attributes, accessible across isolated worlds.
    function publish(state, reason = '') {
        if (!root) return;
        const report = {
            version: VERSION, state, reason, ...stats,
            canContain, style: styleState,
            observers: feedObservers.size, queued: articleQueue.size,
            dynamicChecked, error: lastError
        };
        root.setAttribute(STATUS, JSON.stringify(report));
        if (CONFIG.debug) console.info('[Remia Global]', report);
    }
    function exclusionReason() {
        if (!/^https?:$/.test(location.protocol)) return 'protocol';
        if (document.contentType !== 'text/html') return 'non-html';
        const host = location.hostname.toLowerCase();
        if (CONFIG.excludedDomains.some(domain =>
            host === domain || host.endsWith('.' + domain)
        )) return 'excluded-domain';
        if (/(?:^|\/)(?:login|log-in|signin|sign-in|checkout|payment|billing|auth)(?:[/.;]|$)/i
            .test(location.pathname)) return 'sensitive-path';
        return document.querySelector('input[type="password"]') ? 'password-field' : '';
    }
    function farOutside(rect, cutoff) {
        return rect.top > cutoff || rect.bottom < -cutoff;
    }
    function ensureStyle() {
        if (sheetElement && sheetElement.isConnected && sheetElement.sheet) return true;
        if (document.getElementById(STYLE_ID)) {
            styleState = 'id-conflict';
            return false;
        }
        const selector = ':is(article, [role="article"])[' + ITEM + '="' + VERSION + '"]';
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = '@media screen {\n' + selector + ' {\n' +
            'content-visibility: auto;\n' +
            'contain-intrinsic-block-size: auto var(' + SIZE + ', 300px);\n}\n' +
            (CONFIG.releaseContainmentOnInteraction
                ? selector + ':is(:hover, :focus-within) {\n' +
                  'content-visibility: visible;\n}\n' : '') + '}';
        try {
            (document.head || root).appendChild(style);
            if (style.sheet && style.sheet.cssRules.length) {
                sheetElement = style;
                styleState = 'ready';
                return true;
            }
        } catch (_) { /* A blocked stylesheet must not stop media hints. */ }
        style.remove();
        styleState = 'unavailable';
        return false;
    }
    // Only missing attributes on distant, not-yet-complete media are changed.
    function collectMedia(cutoff) {
        const selectors = [];
        if (CONFIG.lazyImages) selectors.push('img:not([loading])');
        if (CONFIG.asyncImageDecoding) selectors.push('img:not([decoding])');
        if (CONFIG.lazyIframes) selectors.push('iframe:not([loading])');
        if (!selectors.length) return [];
        const nodes = document.querySelectorAll(selectors.join(','));
        const pending = [];
        for (let i = 0; i < Math.min(nodes.length, CONFIG.maxMediaToCheck); i++) {
            const element = nodes[i];
            const image = element.localName === 'img';
            if ((element.getAttribute('fetchpriority') || '').trim().toLowerCase() === 'high' ||
                element.closest('header, nav, form, [role="banner"], [role="dialog"]')) continue;
            if (image) {
                const hasSource = element.currentSrc || element.getAttribute('src') ||
                    element.getAttribute('srcset') ||
                    (element.parentElement && element.parentElement.localName === 'picture' &&
                        element.parentElement.querySelector('source[srcset]'));
                if (element.complete || !hasSource) continue;
            } else if (!element.getAttribute('src') || element.hasAttribute('srcdoc') ||
                /\b(?:autoplay|camera|microphone|payment|display-capture)\b/i
                    .test(element.getAttribute('allow') || '')) continue;
            const lazy = (image ? CONFIG.lazyImages : CONFIG.lazyIframes) &&
                !element.hasAttribute('loading');
            const decode = image && CONFIG.asyncImageDecoding && !element.hasAttribute('decoding');
            if (!lazy && !decode) continue;
            const rect = element.getBoundingClientRect();
            if (rect.width >= 4 && rect.height >= 4 && farOutside(rect, cutoff)) {
                pending.push({ element, image, lazy, decode });
            }
        }
        return pending;
    }
    function applyMedia(pending) {
        for (const { element, image, lazy, decode } of pending) {
            if (!element.isConnected) continue;
            if (lazy && !element.hasAttribute('loading')) {
                element.setAttribute('loading', 'lazy');
                stats[image ? 'images' : 'iframes']++;
            }
            if (decode && !element.hasAttribute('decoding')) {
                element.setAttribute('decoding', 'async');
                stats.decoding++;
            }
        }
    }
    // Discovery is deliberately limited to repeated direct article siblings.
    function discoverFeeds() {
        const nodes = document.querySelectorAll(
            'main article, [role="main"] article, ' +
            'main [role="article"], [role="main"] [role="article"]'
        );
        const groups = new Map();
        for (let i = 0; i < Math.min(nodes.length, CONFIG.maxArticlesToCheck); i++) {
            const article = nodes[i];
            const parent = article.parentElement;
            if (!parent || parent.closest(ARTICLE)) continue;
            if (!groups.has(parent)) groups.set(parent, []);
            groups.get(parent).push(article);
        }
        for (const [parent, articles] of groups) {
            if (articles.length < CONFIG.minimumArticlesPerFeed) {
                groups.delete(parent);
                continue;
            }
            for (const article of articles) enqueue(article, parent);
        }
        return groups;
    }
    function enqueue(article, parent) {
        if (!managed.has(article) && !article.hasAttribute(ITEM) &&
            articleQueue.size < CONFIG.maxArticlesToCheck) articleQueue.set(article, parent);
    }
    function collectArticles(cutoff) {
        const pending = [];
        let checked = 0;
        for (const [article, parent] of articleQueue) {
            if (checked >= CONFIG.maxArticlesPerPass ||
                stats.articles + pending.length >= CONFIG.maxOptimizedArticlesTotal) break;
            checked++;
            articleQueue.delete(article);
            if (!article.isConnected || article.parentElement !== parent ||
                managed.has(article) || article.hasAttribute(ITEM) || article.isContentEditable ||
                article.matches(':hover, :focus-within') || article.querySelector(COMPLEX)) continue;
            if (article.style.getPropertyValue(SIZE) ||
                article.style.getPropertyValue('content-visibility') ||
                article.style.getPropertyValue('contain-intrinsic-block-size')) continue;
            const rect = article.getBoundingClientRect();
            if (!farOutside(rect, cutoff) || rect.width < 240 ||
                rect.height < 110 || rect.height > 1500) continue;
            const css = window.getComputedStyle(article);
            if (css.contentVisibility !== 'visible' || css.contain !== 'none' ||
                css.containIntrinsicBlockSize !== 'none' ||
                (css.containerType && css.containerType !== 'normal') ||
                !['static', 'relative'].includes(css.position) ||
                !['block', 'flow-root', 'flex', 'grid'].includes(css.display) ||
                css.writingMode !== 'horizontal-tb' || css.transform !== 'none') continue;
            const edges = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
                .reduce((sum, key) => sum + (parseFloat(css[key]) || 0), 0);
            const usedHeight = parseFloat(css.height);
            const height = Number.isFinite(usedHeight)
                ? usedHeight - (css.boxSizing === 'border-box' ? edges : 0)
                : rect.height - edges;
            if (height > 0) pending.push({ article, parent, size: Math.max(1, Math.round(height)) + 'px' });
        }
        return pending;
    }
    function applyArticles(pending) {
        for (const { article, parent, size } of pending) {
            if (!article.isConnected || article.parentElement !== parent ||
                managed.has(article) || article.hasAttribute(ITEM)) continue;
            article.style.setProperty(SIZE, size);
            article.setAttribute(ITEM, VERSION);
            managed.set(article, size);
            stats.articles++;
        }
    }
    function stopWatching() {
        watchingClosed = true;
        for (const observer of feedObservers.values()) observer.disconnect();
        feedObservers.clear();
        if (observerStopTimer !== null) window.clearTimeout(observerStopTimer);
        observerStopTimer = null;
    }
    function watchFeed(parent) {
        if (disposed || watchingClosed || !CONFIG.watchDynamicFeeds ||
            CONFIG.maxDynamicItemsToCheck <= 0 || feedObservers.has(parent) ||
            feedObservers.size >= CONFIG.maxObservedFeeds ||
            typeof MutationObserver === 'undefined') return;
        const observer = new MutationObserver(records => {
            if (disposed) return;
            if (!parent.isConnected) {
                observer.disconnect();
                feedObservers.delete(parent);
                publish('idle');
                return;
            }
            recordsLoop: for (const record of records) {
                if (!record.addedNodes.length && dynamicChecked < CONFIG.maxDynamicItemsToCheck) {
                    dynamicChecked++;
                }
                for (const node of record.addedNodes) {
                    if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck) break recordsLoop;
                    dynamicChecked++;
                    if (node.nodeType === 1 && node.matches(ARTICLE)) enqueue(node, parent);
                }
                if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck) break;
            }
            if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck) stopWatching();
            if (articleQueue.size) schedule();
            else publish(feedObservers.size ? 'watching' : 'idle');
        });
        observer.observe(parent, { childList: true });
        feedObservers.set(parent, observer);
        stats.feeds++;
        if (observerStopTimer === null) {
            observerStopTimer = window.setTimeout(() => {
                stopWatching();
                publish('idle', 'watch-window-ended');
            }, CONFIG.observerLifetimeMs);
        }
    }
    function onVisible() {
        if (document.hidden || disposed) return;
        document.removeEventListener('visibilitychange', onVisible);
        waitingForVisibility = false;
        schedule();
    }
    function schedule() {
        if (disposed || idleHandle !== null) return;
        if (document.hidden) {
            if (!waitingForVisibility) {
                document.addEventListener('visibilitychange', onVisible);
                waitingForVisibility = true;
            }
            publish('waiting', 'hidden-document');
            return;
        }
        idleUsesRIC = typeof window.requestIdleCallback === 'function' &&
            typeof window.cancelIdleCallback === 'function';
        idleHandle = idleUsesRIC
            ? window.requestIdleCallback(runWork, { timeout: CONFIG.idleTimeoutMs })
            : window.setTimeout(runWork, 40);
    }
    function runWork() {
        idleHandle = null;
        if (disposed) return;
        if (document.hidden) { schedule(); return; }
        try {
            const reason = exclusionReason();
            if (reason) { finish('skipped', reason); return; }
            const feedEnabled = CONFIG.optimizeLongArticleFeeds && canContain &&
                stats.articles < CONFIG.maxOptimizedArticlesTotal;
            const groups = discoveryPending && feedEnabled ? discoverFeeds() : new Map();
            discoveryPending = false;
            if (!feedEnabled) articleQueue.clear();
            const styleNeeded = feedEnabled && (articleQueue.size > 0 || groups.size > 0);
            const styleReady = styleNeeded && ensureStyle();
            const cutoff = Math.max(900,
                (window.innerHeight || 800) * CONFIG.offscreenViewportMultiplier);
            // Batch geometry reads before media and article writes.
            const media = mediaPending ? collectMedia(cutoff) : [];
            mediaPending = false;
            const articles = styleReady ? collectArticles(cutoff) : [];
            if (!styleReady) articleQueue.clear();
            if (styleNeeded && !styleReady) stopWatching();
            applyMedia(media);
            applyArticles(articles);
            if (styleReady) for (const parent of groups.keys()) watchFeed(parent);
            if (stats.articles >= CONFIG.maxOptimizedArticlesTotal) {
                articleQueue.clear();
                stopWatching();
            }
            stats.passes++;
            publish(feedObservers.size ? 'watching' : 'idle');
            if (articleQueue.size) schedule();
        } catch (error) {
            lastError = String(error && error.message || error).slice(0, 180);
            finish('error', 'runtime-error');
            console.warn('[Remia Global ' + VERSION + ']', error);
        }
    }
    function armLatePass() {
        lateTimer = window.setTimeout(() => {
            lateTimer = null;
            mediaPending = true;
            discoveryPending = true;
            schedule();
        }, CONFIG.latePassDelayMs);
    }
    function cancelWork() {
        disposed = true;
        stopWatching();
        articleQueue.clear();
        if (idleHandle !== null) {
            if (idleUsesRIC) window.cancelIdleCallback(idleHandle);
            else window.clearTimeout(idleHandle);
        }
        idleHandle = null;
        if (lateTimer !== null) window.clearTimeout(lateTimer);
        lateTimer = null;
        document.removeEventListener('visibilitychange', onVisible);
        waitingForVisibility = false;
    }
    function finish(state, reason) {
        finalized = true;
        cancelWork();
        for (const [article, size] of managed) {
            if (article.getAttribute(ITEM) === VERSION) article.removeAttribute(ITEM);
            if (article.style.getPropertyValue(SIZE) === size) article.style.removeProperty(SIZE);
        }
        managed.clear();
        if (sheetElement) sheetElement.remove();
        sheetElement = null;
        if (styleState === 'ready') styleState = 'removed';
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        publish(state, reason);
    }
    function onPageHide() {
        if (finalized) return;
        cancelWork();
        publish('suspended');
    }
    function onPageShow(event) {
        if (!event.persisted || finalized) return;
        disposed = false;
        watchingClosed = false;
        dynamicChecked = 0;
        mediaPending = true;
        discoveryPending = true;
        schedule();
        armLatePass();
    }
    function start() {
        root = document.documentElement;
        if (!root || root.hasAttribute(OWNER)) return;
        root.setAttribute(OWNER, VERSION);
        try {
            const reason = exclusionReason();
            if (reason) { finish('skipped', reason); return; }
            window.addEventListener('pagehide', onPageHide);
            window.addEventListener('pageshow', onPageShow);
            publish('ready');
            schedule();
            armLatePass();
        } catch (error) {
            lastError = String(error && error.message || error).slice(0, 180);
            finish('error', 'startup-error');
            console.warn('[Remia Global ' + VERSION + ']', error);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else start();
})();
