/// remia-youtube-performance.js
/// world ISOLATED
/*
 * Remia's YouTube Performance — uBlock Origin custom scriptlet
 * Target: desktop YouTube on Firefox / Zen Browser
 * Version: 1.5.0 (2026-11-14)
 *
 * INSTALL:
 * 1. Host this file as raw text over HTTPS.
 * 2. Add the raw URL to uBO > Advanced settings > userResourcesLocation.
 * 3. Add to My filters: youtube.com##+js(remia-youtube-performance)
 * 4. Refresh the custom resource in uBO and reload YouTube.
 *
 * RESOURCE FORMAT: do not insert empty or whitespace-only lines inside
 * this resource. uBO treats them as the end of its JavaScript body.
 * Use a comment-only line to separate sections instead.
 *
 * CSS and bounded image hints; this resource does not block network requests.
 * Player-poster priority uses hints; an LCP improvement is not guaranteed.
 * Rendering/loading hints: no promise of lower network traffic,
 * smaller JS bundles, lower memory usage, or higher video frame rates.
 * Hiding ambient visuals does not disable YouTube's background JS work.
 * YouTube markup can change; disable a group if its layout misbehaves.
 */
(function () {
    'use strict';
    // ===================== SETTINGS =====================
    const CONFIG = {
        optimizeGridCards: true,
        optimizeSearchCards: true,
        optimizeWatchRecommendations: true,
        // Opt in: expanded replies have highly variable heights.
        optimizeWatchComments: true,
        // Additional yt-lockup-view-model selectors, without nesting
        // containment inside the legacy cards targeted below.
        includeModernCards: true,
        // Release this script's containment during pointer/keyboard use.
        releaseContainmentOnInteraction: true,
        // Prefer disabling Ambient mode in YouTube's own player settings.
        hideAmbientBackground: true,
        reduceSkeletonAnimations: true,
        // Appearance: remove frosted-glass filters from selected UI surfaces.
        // Set false to restore YouTube's own backdrop effects.
        reduceBackdropBlur: true,
        // Bounded thumbnail-only hints; existing decoding attributes win.
        asyncThumbnailDecoding: true,
        // Prioritize only the current watch page's actual player poster.
        prioritizePlayerPoster: true,
        playerPosterWatchMs: 5000,
        maxPlayerPosterChecks: 48,
        maxThumbnailImagesPerPass: 160,
        maxThumbnailChecksPerRoute: 640,
        maxThumbnailPassesPerRoute: 6,
        thumbnailRescanIntervalMs: 1200,
        // Protect leading thumbnails by DOM order, without layout measurements.
        thumbnailSkipFirst: 8,
        thumbnailHydrationDelayMs: 900,
        // Opt in: only decorative image transitions are suppressed.
        reduceThumbnailTransitionsWhileScrolling: true,
        scrollIdleMs: 160,
        // Initial estimates in CSS pixels, NOT fixed card heights.
        // After rendering, the browser can remember each card's size.
        estimatedBlockSize: {
            grid: 320,
            search: 215,
            recommendations: 110,
            comments: 165
        },
        debug: false
    };
    // ====================================================
    try {
        if (window.top !== window.self) return;
    } catch (_) { return; }
    if (location.hostname !== 'www.youtube.com' &&
        location.hostname !== 'youtube.com') return;
    //
    const VERSION = '1.5.0';
    const STYLE_ID = 'remia-youtube-performance-style';
    const RUNTIME_ATTR = 'data-remia-yt-perf-runtime';
    const STATUS_ATTR = 'data-remia-yt-perf-status';
    const SCROLL_ATTR = 'data-remia-yt-scrolling';
    const THUMBNAILS = [
        ':is(ytd-browse, ytd-search) :is(ytd-thumbnail, yt-thumbnail-view-model, .ytThumbnailViewModelHost) img',
        'ytd-watch-flexy #related :is(ytd-thumbnail, yt-thumbnail-view-model, .ytThumbnailViewModelHost) img'
    ];
    const rules = [];
    const containedSelectors = [];
    let styleState = 'waiting';
    let styleError = '';
    let styleRuleCount = 0;
    const supportsContentVisibility = typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('content-visibility', 'auto') &&
        CSS.supports('contain-intrinsic-block-size', 'auto 320px');
    //
    function addContainment(selectors, estimate, fallback) {
        const size = typeof estimate === 'number' &&
            Number.isFinite(estimate) && estimate > 0
            ? estimate : fallback;
        containedSelectors.push(...selectors);
        rules.push(
            ':is(' + selectors.join(',\n') + ') {\n' +
            '  content-visibility: auto !important;\n' +
            '  contain-intrinsic-block-size: auto ' + size + 'px !important;\n' +
            '}'
        );
    }
    //
    if (supportsContentVisibility) {
        if (CONFIG.optimizeGridCards) {
            const selectors = [
                'ytd-browse ytd-rich-grid-renderer ytd-rich-item-renderer:not([is-slim-media])',
                'ytd-browse ytd-grid-video-renderer'
            ];
            if (CONFIG.includeModernCards) {
                selectors.push(
                    'ytd-browse ytd-rich-grid-renderer yt-lockup-view-model:not(ytd-rich-item-renderer *, ytd-grid-video-renderer *, yt-lockup-view-model *)'
                );
            }
            addContainment(selectors, CONFIG.estimatedBlockSize.grid, 320);
        }
        //
        if (CONFIG.optimizeSearchCards) {
            const selectors = ['ytd-search ytd-video-renderer'];
            if (CONFIG.includeModernCards) {
                selectors.push(
                    'ytd-search yt-lockup-view-model:not(ytd-video-renderer *, ytd-rich-item-renderer *, yt-lockup-view-model *)'
                );
            }
            addContainment(selectors, CONFIG.estimatedBlockSize.search, 215);
        }
        //
        if (CONFIG.optimizeWatchRecommendations) {
            const selectors = [
                'ytd-watch-flexy #related ytd-compact-video-renderer'
            ];
            if (CONFIG.includeModernCards) {
                selectors.push(
                    'ytd-watch-flexy #related yt-lockup-view-model:not(ytd-compact-video-renderer *, yt-lockup-view-model *)'
                );
            }
            addContainment(selectors, CONFIG.estimatedBlockSize.recommendations, 110);
        }
        //
        if (CONFIG.optimizeWatchComments) {
            addContainment([
                'ytd-watch-flexy #comments ytd-comment-thread-renderer'
            ], CONFIG.estimatedBlockSize.comments, 165);
        }
        //
        if (CONFIG.releaseContainmentOnInteraction && containedSelectors.length) {
            rules.push(
                ':is(' + containedSelectors.join(',\n') + ')' +
                ':is(:hover, :focus-within) {\n' +
                '  content-visibility: visible !important;\n' +
                '}'
            );
        }
    }
    //
    if (CONFIG.hideAmbientBackground) {
        rules.push(
            'ytd-watch-flexy #cinematics,\n' +
            'ytd-watch-flexy #cinematics-container {\n' +
            '  display: none !important;\n' +
            '}'
        );
    }
    //
    if (CONFIG.reduceSkeletonAnimations) {
        const skeleton = ':is(ytd-browse, ytd-search) #ghost-cards';
        rules.push([
            skeleton,
            skeleton + ' *',
            skeleton + '::before',
            skeleton + '::after',
            skeleton + ' *::before',
            skeleton + ' *::after'
        ].join(',\n') + ' {\n' +
            '  animation: none !important;\n' +
            '  transition: none !important;\n' +
            '}'
        );
    }
    //
    if (CONFIG.reduceThumbnailTransitionsWhileScrolling) {
        rules.push(THUMBNAILS.map(selector =>
            'html[' + SCROLL_ATTR + '] ' + selector
        ).join(',\n') + ' {\n' +
            '  transition-property: none !important;\n' +
            '}'
        );
    }
    //
    if (CONFIG.reduceBackdropBlur) {
        rules.push([
            'ytd-masthead #background',
            'ytd-app #frosted-glass',
            'ytd-app #guide-content',
            'ytd-mini-guide-renderer',
            'ytd-playlist-panel-renderer#playlist',
            'ytd-watch-metadata #description-inner',
            '#movie_player .ytp-popup'
        ].join(',\n') + ' {\n' +
            '  backdrop-filter: none !important;\n' +
            '  -webkit-backdrop-filter: none !important;\n' +
            '}'
        );
    }
    // Screen-only rules leave the page's print layout alone.
    const cssText = rules.length
        ? '@media screen {\n' + rules.join('\n') + '\n}\n'
        : '';
    //
    function startRuntime() {
        const root = document.documentElement;
        if (root.hasAttribute(RUNTIME_ATTR)) return;
        root.setAttribute(RUNTIME_ATTR, VERSION);
        const listeners = new AbortController();
        const stats = { activations: 0, passes: 0, decoding: 0, thumbnailChecks: 0,
            posterChecks: 0, posterHints: 0, preloads: 0, navigations: 0 };
        let failed = false;
        let lastError = '';
        let cardsMatched = 0;
        let route = location.pathname + location.search;
        let routePasses = 0;
        let routeChecks = 0;
        let protectedLeading = new WeakSet();
        let protectedCount = 0;
        let lastDecodeAt = 0;
        let suspended = false;
        let navigating = false;
        let scrolling = false;
        let scrollTimer = null;
        let decodeJob = null;
        let decodeUsesIdle = false;
        let decodeAgain = false;
        let lateTimer = null;
        let navigationTimer = null;
        let posterObserver = null;
        let posterRoot = null;
        let posterTimer = null;
        let posterJob = null;
        let posterVideo = '';
        let posterFinished = false;
        let posterChecks = 0;
        let posterPreload = null;
        let posterState = CONFIG.prioritizePlayerPoster ? 'idle' : 'disabled';
        //
        function active() {
            return !failed && !suspended && !navigating && !document.hidden;
        }
        function publish() {
            const state = failed ? 'error' : suspended ? 'suspended' :
                navigating ? 'navigating' : document.hidden ? 'waiting' :
                posterObserver ? 'watching' : decodeJob !== null ? 'scheduled' : 'idle';
            const report = { version: VERSION, state, route, ...stats,
                canContain: supportsContentVisibility, style: styleState,
                cssRules: styleRuleCount, styleError, cardsMatched,
                routePasses, routeChecks, posterState,
                posterWatching: !!posterObserver, error: lastError };
            root.setAttribute(STATUS_ATTR, JSON.stringify(report));
            if (CONFIG.debug) console.info('[Remia YT Perf]', report);
        }
        function guarded(task) {
            return (...args) => {
                if (failed) return;
                try { return task(...args); }
                catch (error) {
                    failed = true;
                    lastError = String(error && error.message || error).slice(0, 180);
                    stopJobs();
                    listeners.abort();
                    const style = document.getElementById(STYLE_ID);
                    if (style && style.getAttribute('data-remia-version') === VERSION) {
                        style.remove();
                        styleState = 'removed';
                        styleRuleCount = 0;
                    }
                    publish();
                    console.warn('[Remia YT Perf ' + VERSION + ']', error);
                }
            };
        }
        function listen(target, type, callback, options = {}) {
            target.addEventListener(type, guarded(callback), {
                ...options, signal: listeners.signal
            });
        }
        function updateCardCount() {
            cardsMatched = containedSelectors.length
                ? document.querySelectorAll(containedSelectors.join(',')).length : 0;
        }
        function clearScrolling() {
            if (scrollTimer !== null) window.clearTimeout(scrollTimer);
            scrollTimer = null;
            scrolling = false;
            root.removeAttribute(SCROLL_ATTR);
        }
        function stopPosterWatch() {
            if (posterObserver) posterObserver.disconnect();
            posterObserver = null;
            posterRoot = null;
            if (posterTimer !== null) window.clearTimeout(posterTimer);
            if (posterJob !== null) window.clearTimeout(posterJob);
            posterTimer = null;
            posterJob = null;
        }
        function resetPoster() {
            stopPosterWatch();
            posterVideo = '';
            posterFinished = false;
            if (posterPreload) posterPreload.remove();
            posterPreload = null;
            posterState = CONFIG.prioritizePlayerPoster ? 'idle' : 'disabled';
        }
        function watchVideoId() {
            if (location.pathname !== '/watch') return '';
            const id = new URL(location.href).searchParams.get('v') || '';
            return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
        }
        function posterUrl(value) {
            if (!value) return '';
            try {
                const url = new URL(value, document.baseURI);
                if (url.protocol !== 'https:' ||
                    !/^(?:[a-z0-9-]+\.)*ytimg\.com$/i.test(url.hostname)) return '';
                const match = /^\/vi(?:_webp)?\/([^/]+)\//.exec(url.pathname);
                return match && match[1] === posterVideo ? url.href : '';
            } catch (_) { return ''; }
        }
        function bindPosterObserver(target) {
            if (!posterObserver || target === posterRoot) return;
            posterObserver.disconnect();
            posterRoot = target;
            const options = { childList: true, subtree: true };
            if (target !== document.documentElement) {
                options.attributes = true;
                options.attributeFilter = ['src', 'srcset', 'style', 'class', 'hidden'];
            }
            posterObserver.observe(target, options);
        }
        function prioritizePoster() {
            if (!active() || watchVideoId() !== posterVideo) {
                stopPosterWatch();
                return true;
            }
            if (posterChecks >= CONFIG.maxPlayerPosterChecks) {
                posterState = 'check-limit';
                stopPosterWatch();
                publish();
                return true;
            }
            posterChecks++;
            stats.posterChecks++;
            const player = document.querySelector('ytd-watch-flexy:not([hidden]) ytd-player');
            if (!player) return false;
            bindPosterObserver(player);
            const video = player.querySelector('video');
            if (video && !video.paused && video.readyState >= 2) {
                posterFinished = true;
                posterState = 'already-playing';
                stopPosterWatch();
                publish();
                return true;
            }
            const posters = player.querySelectorAll(
                '.ytp-cued-thumbnail-overlay-image, .ytp-cued-thumbnail-overlay img'
            );
            for (let i = 0; i < Math.min(posters.length, 4); i++) {
                const node = posters[i];
                if (!node.isConnected || node.closest('[hidden]')) continue;
                const overlay = node.closest('.ytp-cued-thumbnail-overlay') || node;
                const visible = window.getComputedStyle(overlay);
                if (visible.display === 'none' || visible.visibility === 'hidden') continue;
                if (node.localName === 'img') {
                    if (!posterUrl(node.currentSrc) && !posterUrl(node.getAttribute('src'))) continue;
                    if (node.getAttribute('fetchpriority') !== 'high') {
                        node.setAttribute('fetchpriority', 'high');
                    }
                    if (node.getAttribute('loading') !== 'eager') node.setAttribute('loading', 'eager');
                } else {
                    const background = node.style.backgroundImage ||
                        window.getComputedStyle(node).backgroundImage;
                    const match = /^url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"'\s]+))\s*\)$/.exec(background);
                    const url = match && posterUrl(match[1] || match[2] || match[3]);
                    if (!url) continue;
                    let existing = null;
                    for (const link of document.querySelectorAll('link[rel~="preload"][as="image"]')) {
                        if (link.href === url) { existing = link; break; }
                    }
                    if (existing) {
                        existing.setAttribute('fetchpriority', 'high');
                    } else {
                        const link = document.createElement('link');
                        link.setAttribute('rel', 'preload');
                        link.setAttribute('as', 'image');
                        link.setAttribute('fetchpriority', 'high');
                        link.setAttribute('href', url);
                        link.setAttribute('data-remia-yt-poster', posterVideo);
                        (document.head || root).appendChild(link);
                        posterPreload = link;
                        stats.preloads++;
                    }
                }
                posterFinished = true;
                posterState = 'hint-applied';
                stats.posterHints++;
                stopPosterWatch();
                publish();
                return true;
            }
            return false;
        }
        function startPosterPriority() {
            if (!CONFIG.prioritizePlayerPoster || !active()) return;
            const id = watchVideoId();
            if (!id) { posterState = 'not-watch-page'; return; }
            if (id === posterVideo) return;
            resetPoster();
            posterVideo = id;
            posterChecks = 0;
            posterState = 'searching';
            if (prioritizePoster() || typeof MutationObserver !== 'function') return;
            posterObserver = new MutationObserver(guarded(() => {
                if (posterJob !== null) return;
                posterJob = window.setTimeout(guarded(() => {
                    posterJob = null;
                    prioritizePoster();
                }), 0);
            }));
            bindPosterObserver(
                document.querySelector('ytd-watch-flexy:not([hidden]) ytd-player') || root
            );
            posterTimer = window.setTimeout(guarded(() => {
                posterState = 'watch-timeout';
                stopPosterWatch();
                publish();
            }), CONFIG.playerPosterWatchMs);
        }
        function stopJobs() {
            clearScrolling();
            if (decodeJob !== null) {
                if (decodeUsesIdle) window.cancelIdleCallback(decodeJob);
                else window.clearTimeout(decodeJob);
            }
            decodeJob = null;
            decodeAgain = false;
            if (lateTimer !== null) window.clearTimeout(lateTimer);
            lateTimer = null;
            if (navigationTimer !== null) window.clearTimeout(navigationTimer);
            navigationTimer = null;
            stopPosterWatch();
            if (!posterFinished) posterVideo = '';
        }
        function decodeThumbnails() {
            installStyle();
            const images = document.querySelectorAll(
                THUMBNAILS.map(selector => selector + ':not([decoding])').join(',')
            );
            const limit = Math.min(images.length, CONFIG.maxThumbnailImagesPerPass,
                CONFIG.maxThumbnailChecksPerRoute - routeChecks);
            routePasses++;
            stats.passes++;
            lastDecodeAt = performance.now();
            for (let i = 0; i < limit; i++) {
                const image = images[i];
                routeChecks++;
                stats.thumbnailChecks++;
                // ARIA-hidden decorative thumbnails can still be visually displayed.
                if (!image.isConnected || image.closest(
                    '[hidden], #movie_player, ytd-player, ytd-miniplayer'
                )) continue;
                if (protectedLeading.has(image)) continue;
                if (protectedCount < CONFIG.thumbnailSkipFirst) {
                    protectedLeading.add(image);
                    protectedCount++;
                    continue;
                }
                if (image.hasAttribute('decoding') ||
                    (image.getAttribute('fetchpriority') || '').trim().toLowerCase() === 'high' ||
                    !(image.currentSrc || image.getAttribute('src') || image.getAttribute('srcset'))) continue;
                image.setAttribute('decoding', 'async');
                stats.decoding++;
            }
            // No geometry reads: inspecting skipped descendants can force layout.
            // This hint does not re-decode an already displayed image.
            updateCardCount();
            publish();
        }
        function queueDecode(force = true) {
            if (!CONFIG.asyncThumbnailDecoding || !active()) return;
            if (routePasses >= CONFIG.maxThumbnailPassesPerRoute ||
                routeChecks >= CONFIG.maxThumbnailChecksPerRoute) return;
            if (decodeJob !== null) {
                if (force) decodeAgain = true;
                return;
            }
            if (!force && routePasses &&
                performance.now() - lastDecodeAt < CONFIG.thumbnailRescanIntervalMs) {
                decodeUsesIdle = false;
                const delay = CONFIG.thumbnailRescanIntervalMs - (performance.now() - lastDecodeAt);
                decodeJob = window.setTimeout(guarded(() => {
                    decodeJob = null;
                    queueDecode();
                    publish();
                }), Math.max(1, Math.ceil(delay)));
                return;
            }
            decodeUsesIdle = typeof window.requestIdleCallback === 'function' &&
                typeof window.cancelIdleCallback === 'function';
            const run = guarded(() => {
                decodeJob = null;
                if (active()) decodeThumbnails();
                else publish();
                if (decodeAgain) {
                    decodeAgain = false;
                    queueDecode(false);
                    publish();
                }
            });
            decodeJob = decodeUsesIdle
                ? window.requestIdleCallback(run, { timeout: 1000 })
                : window.setTimeout(run, 50);
        }
        function activate() {
            if (!active()) return;
            const nextRoute = location.pathname + location.search;
            if (nextRoute !== route) {
                stopJobs();
                resetPoster();
                route = nextRoute;
                routePasses = 0;
                routeChecks = 0;
                protectedLeading = new WeakSet();
                protectedCount = 0;
                lastDecodeAt = 0;
                stats.navigations++;
            }
            stats.activations++;
            installStyle();
            updateCardCount();
            startPosterPriority();
            if (document.readyState === 'loading') { publish(); return; }
            queueDecode();
            publish();
            if (!CONFIG.asyncThumbnailDecoding) return;
            if (lateTimer !== null) window.clearTimeout(lateTimer);
            lateTimer = window.setTimeout(guarded(() => {
                lateTimer = null;
                queueDecode();
            }), CONFIG.thumbnailHydrationDelayMs);
        }
        function onScrollEnd() {
            clearScrolling();
            queueDecode(false);
            publish();
        }
        function finishNavigation() {
            if (navigationTimer !== null) window.clearTimeout(navigationTimer);
            navigationTimer = null;
            navigating = false;
            activate();
        }
        function onScroll() {
            if (!active()) return;
            if (CONFIG.reduceThumbnailTransitionsWhileScrolling && !scrolling) {
                scrolling = true;
                root.setAttribute(SCROLL_ATTR, '');
            }
            if (scrollTimer !== null) window.clearTimeout(scrollTimer);
            scrollTimer = window.setTimeout(guarded(onScrollEnd), CONFIG.scrollIdleMs);
        }
        //
        if (CONFIG.reduceThumbnailTransitionsWhileScrolling || CONFIG.asyncThumbnailDecoding) {
            listen(document, 'scroll', onScroll, { passive: true, capture: true });
            listen(document, 'scrollend', onScrollEnd, { capture: true });
        }
        listen(document, 'yt-navigate-start', () => {
            navigating = true;
            stopJobs();
            resetPoster();
            navigationTimer = window.setTimeout(guarded(finishNavigation), 6000);
            publish();
        }, { capture: true });
        listen(document, 'yt-navigate-finish', finishNavigation, { capture: true });
        listen(window, 'popstate', finishNavigation);
        listen(document, 'yt-page-data-updated', () => {
            queueDecode(false);
        }, { capture: true });
        listen(document, 'visibilitychange', () => {
            if (document.hidden) stopJobs();
            else finishNavigation();
            publish();
        });
        listen(window, 'pagehide', () => {
            suspended = true;
            stopJobs();
            publish();
        });
        listen(window, 'pageshow', event => {
            if (!event.persisted) return;
            suspended = false;
            navigating = false;
            activate();
        });
        if (document.readyState === 'loading') {
            listen(document, 'DOMContentLoaded', activate, { once: true });
        }
        publish();
        guarded(activate)();
    }
    //
    function installStyle() {
        const parent = document.head || document.documentElement;
        if (!parent) return false;
        let style = document.getElementById(STYLE_ID);
        if (style && (style.localName !== 'style' ||
            !style.hasAttribute('data-remia-version'))) {
            styleState = 'id-conflict';
            styleError = 'The stylesheet ID is already used by another element.';
            styleRuleCount = 0;
            return false;
        }
        if (!cssText) {
            if (style) style.remove();
            styleState = 'not-needed';
            styleError = '';
            styleRuleCount = 0;
            return true;
        }
        const isNew = !style;
        if (isNew) {
            style = document.createElement('style');
            style.id = STYLE_ID;
        }
        try {
            if (style.textContent !== cssText) style.textContent = cssText;
            if (style.getAttribute('data-remia-version') !== VERSION) {
                style.setAttribute('data-remia-version', VERSION);
            }
            if (isNew) parent.appendChild(style);
            const sheet = style.sheet;
            if (sheet && !sheet.disabled && sheet.cssRules.length) {
                styleRuleCount = Array.from(sheet.cssRules).reduce((count, rule) =>
                    count + (rule.cssRules ? rule.cssRules.length : 1), 0);
                if (styleRuleCount > 0) {
                    styleState = 'ready';
                    styleError = '';
                    return true;
                }
            }
            styleError = 'The stylesheet is blocked, disabled or has no parsed rules.';
        } catch (error) {
            styleError = String(error && error.message || error).slice(0, 180);
        }
        if (isNew) style.remove();
        styleState = 'unavailable';
        styleRuleCount = 0;
        return false;
    }
    // CSS matches SPA content automatically. Poster discovery uses a temporary
    // observer; other runtime work is bounded and native browser APIs stay intact.
    function boot() {
        const root = document.documentElement;
        if (!root) return false;
        if (root.hasAttribute(RUNTIME_ATTR)) return true;
        installStyle();
        try { startRuntime(); }
        catch (error) {
            root.setAttribute(RUNTIME_ATTR, VERSION);
            root.setAttribute(STATUS_ATTR, JSON.stringify({
                version: VERSION, state: 'error', style: styleState,
                error: String(error && error.message || error).slice(0, 180)
            }));
            console.warn('[Remia YT Perf ' + VERSION + ']', error);
        }
        return true;
    }
    if (boot()) return;
    //
    function onReady() {
        if (!boot()) return;
        document.removeEventListener('readystatechange', onReady);
        document.removeEventListener('DOMContentLoaded', onReady);
    }
    document.addEventListener('readystatechange', onReady);
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
})();
