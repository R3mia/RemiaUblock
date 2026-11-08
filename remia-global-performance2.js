/// remia-global-performance.js
/// world ISOLATED
/*
 * Remia Global Performance v2.1.0 (2026-11-09)
 * uBlock Origin custom scriptlet for Firefox / Zen Browser.
 * Filter: /^.+$/##+js(remia-global-performance)
 * Host the raw file over HTTPS and add its URL to userResourcesLocation.
 * IMPORTANT: no empty or whitespace-only lines inside this resource.
 * Use comment-only lines as separators; uBO ends resources at blank lines.
 *
 * Bounded rendering optimization for simple, repeated article cards.
 * Media attributes are hints; late changes cannot undo started requests.
 * No guaranteed reduction in JS downloads, RAM, or page loading time.
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
        // Counts inspected nodes, including nodes that are ignored.
        maxDynamicItemsToCheck: 80,
        observerLifetimeMs: 90000,
        offscreenViewportMultiplier: 1.5,
        idleTimeoutMs: 1400,
        debug: false,
        excludedDomains: [
            // Use the separate YouTube scriptlet on this domain.
            'youtube.com',
            'accounts.google.com', 'mail.google.com',
            'docs.google.com', 'drive.google.com',
            'paypal.com', 'stripe.com',
            'outlook.live.com', 'outlook.office.com',
            'figma.com'
        ]
    };
    //
    try {
        if (window !== window.top) return;
    } catch (_) { return; }
    const VERSION = '2.1.0';
    const OWNER = 'data-remia-global-performance';
    const ITEM = 'data-remia-global-performance-item';
    const SIZE = '--remia-global-block-size';
    const STYLE_ID = 'remia-global-performance-style';
    const ARTICLE = 'article, [role="article"]';
    const COMPLEX = 'video, audio, canvas, iframe, form, input, textarea, ' +
        'select, details, [contenteditable]:not([contenteditable="false"]), ' +
        '[role="textbox"], [role="dialog"], [role="menu"], [popover]';
    const canContain = typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('content-visibility', 'auto') &&
        CSS.supports('contain-intrinsic-block-size', 'auto 300px');
    const stats = { images: 0, decoding: 0, iframes: 0, articles: 0, feeds: 0 };
    const optimized = new WeakSet();
    const feedObservers = new Map();
    const dynamicQueue = new Map();
    let sheetElement = null;
    let disposed = false;
    let mediaPending = true;
    let discoveryPending = true;
    let watchingClosed = false;
    let dynamicChecked = 0;
    let idleHandle = null;
    let idleUsesRIC = false;
    let lateTimer = null;
    let observerStopTimer = null;
    let waitingForVisibility = false;
    //
    function allowed() {
        if (!/^https?:$/.test(location.protocol)) return false;
        const host = location.hostname.toLowerCase();
        if (CONFIG.excludedDomains.some(domain =>
            host === domain || host.endsWith('.' + domain)
        )) return false;
        if (/(?:^|\/)(?:login|log-in|signin|sign-in|checkout|payment|billing|auth)(?:\/|$)/i
            .test(location.pathname)) return false;
        return !document.querySelector('input[type="password"]');
    }
    function log(message, error) {
        if (CONFIG.debug) console.info('[Remia Global ' + VERSION + ']',
            message, error || { ...stats });
    }
    function farOutside(rect, cutoff) {
        return rect.top > cutoff || rect.bottom < -cutoff;
    }
    //
    function ensureStyle() {
        if (sheetElement && sheetElement.isConnected) return true;
        if (document.getElementById(STYLE_ID)) return false;
        const selector = ':is(article, [role="article"])[' + ITEM + ']';
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = '@media screen {\n' + selector + ' {\n' +
            'content-visibility: auto;\n' +
            'contain-intrinsic-block-size: auto var(' + SIZE + ', 300px);\n}\n' +
            (CONFIG.releaseContainmentOnInteraction
                ? selector + ':is(:hover, :focus-within) {\n' +
                  'content-visibility: visible;\n}\n' : '') + '}';
        (document.head || document.documentElement).appendChild(style);
        // A site may reject injected styles. Leave its article layout alone.
        if (!style.sheet || !style.sheet.cssRules.length) {
            style.remove();
            return false;
        }
        sheetElement = style;
        return true;
    }
    //
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
                element.closest('header, nav, [role="banner"]')) continue;
            if (image) {
                if (element.complete ||
                    !(element.getAttribute('src') || element.getAttribute('srcset'))) continue;
            } else if (!element.getAttribute('src') || element.hasAttribute('srcdoc') ||
                /\bautoplay\b/i.test(element.getAttribute('allow') || '')) continue;
            const lazy = (image ? CONFIG.lazyImages : CONFIG.lazyIframes) &&
                !element.hasAttribute('loading');
            const decode = image && CONFIG.asyncImageDecoding &&
                !element.hasAttribute('decoding');
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
    //
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
            if (articles.length < CONFIG.minimumArticlesPerFeed) groups.delete(parent);
        }
        return groups;
    }
    function collectArticles(groups, cutoff) {
        const pending = [];
        let checked = 0;
        for (const [parent, articles] of groups) {
            for (const article of articles) {
                if (optimized.has(article) || article.hasAttribute(ITEM)) continue;
                if (checked++ >= CONFIG.maxArticlesPerPass ||
                    stats.articles + pending.length >= CONFIG.maxOptimizedArticlesTotal) {
                    return pending;
                }
                if (!article.isConnected || article.parentElement !== parent ||
                    article.isContentEditable || article.matches(':hover, :focus-within') ||
                    article.querySelector(COMPLEX)) continue;
                if (article.style.getPropertyValue(SIZE) ||
                    article.style.getPropertyValue('content-visibility') ||
                    article.style.getPropertyValue('contain-intrinsic-block-size')) continue;
                const rect = article.getBoundingClientRect();
                if (!farOutside(rect, cutoff) || rect.width < 240 ||
                    rect.height < 110 || rect.height > 1500) continue;
                const css = window.getComputedStyle(article);
                if (css.contentVisibility !== 'visible' || css.contain !== 'none' ||
                    css.containIntrinsicBlockSize !== 'none' ||
                    !['static', 'relative'].includes(css.position) ||
                    ['none', 'contents', 'inline'].includes(css.display) ||
                    css.writingMode !== 'horizontal-tb' || css.transform !== 'none') continue;
                const edges = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
                    .reduce((sum, key) => sum + (parseFloat(css[key]) || 0), 0);
                const usedHeight = parseFloat(css.height);
                const innerHeight = Number.isFinite(usedHeight)
                    ? usedHeight - (css.boxSizing === 'border-box' ? edges : 0)
                    : rect.height - edges;
                if (innerHeight > 0) pending.push({ article, parent,
                    height: Math.max(1, Math.round(innerHeight)) });
            }
        }
        return pending;
    }
    function applyArticles(pending) {
        for (const { article, parent, height } of pending) {
            if (!article.isConnected || article.parentElement !== parent ||
                optimized.has(article)) continue;
            article.style.setProperty(SIZE, height + 'px');
            article.setAttribute(ITEM, '');
            optimized.add(article);
            stats.articles++;
        }
    }
    //
    function closeFeeds(discardQueue = true) {
        watchingClosed = true;
        for (const observer of feedObservers.values()) observer.disconnect();
        feedObservers.clear();
        if (!discardQueue) return;
        dynamicQueue.clear();
        if (observerStopTimer !== null) window.clearTimeout(observerStopTimer);
        observerStopTimer = null;
    }
    function watchFeed(parent) {
        if (disposed || watchingClosed || !CONFIG.watchDynamicFeeds ||
            CONFIG.maxDynamicItemsToCheck <= 0 || feedObservers.has(parent) ||
            feedObservers.size >= CONFIG.maxObservedFeeds ||
            typeof MutationObserver === 'undefined') return;
        const observer = new MutationObserver(records => {
            if (disposed || !parent.isConnected) {
                observer.disconnect();
                feedObservers.delete(parent);
                return;
            }
            recordsLoop: for (const record of records) {
                // Removal-only records also consume the inspection budget.
                if (!record.addedNodes.length) dynamicChecked++;
                for (const node of record.addedNodes) {
                    if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck) break recordsLoop;
                    dynamicChecked++;
                    if (node.nodeType === 1 && node.matches(ARTICLE) &&
                        dynamicQueue.size < CONFIG.maxArticlesPerPass) {
                        dynamicQueue.set(node, parent);
                    }
                }
                if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck) break;
            }
            if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck) closeFeeds(false);
            if (dynamicQueue.size) schedule();
            else if (watchingClosed) closeFeeds();
        });
        observer.observe(parent, { childList: true });
        feedObservers.set(parent, observer);
        stats.feeds++;
        if (observerStopTimer === null) {
            observerStopTimer = window.setTimeout(() => closeFeeds(), CONFIG.observerLifetimeMs);
        }
    }
    //
    function onVisible() {
        if (document.hidden) return;
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
        if (!allowed()) { shutdown(true); return; }
        if (document.hidden) { schedule(); return; }
        try {
            const feedEnabled = CONFIG.optimizeLongArticleFeeds && canContain &&
                stats.articles < CONFIG.maxOptimizedArticlesTotal;
            const groups = feedEnabled && discoveryPending ? discoverFeeds() : new Map();
            const discoveredParents = [...groups.keys()];
            discoveryPending = false;
            for (const [article, parent] of dynamicQueue) {
                if (!feedEnabled || article.parentElement !== parent) continue;
                if (!groups.has(parent)) groups.set(parent, []);
                if (!groups.get(parent).includes(article)) groups.get(parent).push(article);
            }
            dynamicQueue.clear();
            const styleReady = groups.size > 0 && ensureStyle();
            const cutoff = Math.max(900,
                (window.innerHeight || 800) * CONFIG.offscreenViewportMultiplier);
            // Complete ALL geometry reads before applying media/article changes.
            const media = mediaPending ? collectMedia(cutoff) : [];
            mediaPending = false;
            const articles = styleReady ? collectArticles(groups, cutoff) : [];
            applyMedia(media);
            applyArticles(articles);
            if (styleReady) for (const parent of discoveredParents) watchFeed(parent);
            if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck ||
                stats.articles >= CONFIG.maxOptimizedArticlesTotal) closeFeeds();
            log('Pass finished');
        } catch (error) {
            closeFeeds();
            log('Pass stopped', error);
        }
    }
    //
    function shutdown(restoreStyles = false) {
        disposed = true;
        closeFeeds();
        if (idleHandle !== null) {
            if (idleUsesRIC) window.cancelIdleCallback(idleHandle);
            else window.clearTimeout(idleHandle);
        }
        idleHandle = null;
        if (lateTimer !== null) window.clearTimeout(lateTimer);
        lateTimer = null;
        document.removeEventListener('visibilitychange', onVisible);
        waitingForVisibility = false;
        if (!restoreStyles) return;
        for (const article of document.querySelectorAll('[' + ITEM + ']')) {
            article.removeAttribute(ITEM);
            article.style.removeProperty(SIZE);
        }
        if (sheetElement) sheetElement.remove();
        document.documentElement.removeAttribute(OWNER);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
    }
    function onPageHide() { shutdown(); }
    function onPageShow(event) {
        if (!event.persisted) return;
        disposed = false;
        watchingClosed = false;
        dynamicChecked = 0;
        discoveryPending = true;
        schedule();
    }
    function start() {
        if (!allowed()) return;
        const root = document.documentElement;
        if (!root || root.hasAttribute(OWNER)) return;
        root.setAttribute(OWNER, VERSION);
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('pageshow', onPageShow);
        schedule();
        // One additional feed discovery for late hydration; no URL polling.
        lateTimer = window.setTimeout(() => {
            lateTimer = null;
            discoveryPending = true;
            schedule();
        }, 1800);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else start();
})();
