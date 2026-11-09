/// remia-youtube-performance.js
/// world ISOLATED
/*
 * Remia's YouTube Performance — uBlock Origin custom scriptlet
 * Target: desktop YouTube on Firefox / Zen Browser
 * Version: 1.2.0 (2026-11-09)
 *
 * INSTALL:
 * 1. Host this file as raw text over HTTPS.
 * 2. Add the raw URL to uBO > Advanced settings > userResourcesLocation.
 * 3. Add to My filters: www.youtube.com##+js(remia-youtube-performance)
 * 4. Refresh the custom resource in uBO and reload YouTube.
 *
 * RESOURCE FORMAT: do not insert empty or whitespace-only lines inside
 * this resource. uBO treats them as the end of its JavaScript body.
 * Use a comment-only line to separate sections instead.
 *
 * CSS and bounded image hints; telemetry rules live in the paired filters.
 * Rendering optimization only: no promise of lower network traffic,
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
        optimizeWatchComments: false,
        // Additional yt-lockup-view-model selectors, without nesting
        // containment inside the legacy cards targeted below.
        includeModernCards: true,
        // Release this script's containment during pointer/keyboard use.
        releaseContainmentOnInteraction: true,
        // Prefer disabling Ambient mode in YouTube's own player settings.
        hideAmbientBackground: true,
        reduceSkeletonAnimations: true,
        // Bounded thumbnail-only hints; existing decoding attributes win.
        asyncThumbnailDecoding: true,
        maxThumbnailImagesPerPass: 160,
        // Protect leading thumbnails by DOM order, without layout measurements.
        thumbnailSkipFirst: 8,
        thumbnailHydrationDelayMs: 900,
        // Opt in: only decorative image transitions are suppressed.
        reduceThumbnailTransitionsWhileScrolling: false,
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
    if (window.top !== window.self) return;
    if (location.hostname !== 'www.youtube.com' &&
        location.hostname !== 'youtube.com') return;
    //
    const VERSION = '1.2.0';
    const STYLE_ID = 'remia-youtube-performance-style';
    const RUNTIME_ATTR = 'data-remia-yt-perf-runtime';
    const SCROLL_ATTR = 'data-remia-yt-scrolling';
    const THUMBNAILS = [
        ':is(ytd-browse, ytd-search) :is(ytd-thumbnail, yt-thumbnail-view-model) img',
        'ytd-watch-flexy #related :is(ytd-thumbnail, yt-thumbnail-view-model) img'
    ];
    const rules = [];
    const containedSelectors = [];
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
                    'ytd-browse ytd-rich-grid-renderer > #contents > yt-lockup-view-model'
                );
            }
            addContainment(selectors, CONFIG.estimatedBlockSize.grid, 320);
        }
        //
        if (CONFIG.optimizeSearchCards) {
            const selectors = ['ytd-search ytd-video-renderer'];
            if (CONFIG.includeModernCards) {
                selectors.push(
                    'ytd-search ytd-item-section-renderer > #contents > yt-lockup-view-model:not(ytd-video-renderer *, ytd-rich-item-renderer *, yt-lockup-view-model *)'
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
    // Screen-only rules leave the page's print layout alone.
    const cssText = rules.length
        ? '@media screen {\n' + rules.join('\n') + '\n}\n'
        : '';
    //
    function startRuntime() {
        if (!CONFIG.asyncThumbnailDecoding &&
            !CONFIG.reduceThumbnailTransitionsWhileScrolling) return;
        const root = document.documentElement;
        if (root.hasAttribute(RUNTIME_ATTR)) return;
        root.setAttribute(RUNTIME_ATTR, VERSION);
        let suspended = false;
        let navigating = false;
        let scrolling = false;
        let scrollTimer = null;
        let decodeJob = null;
        let decodeUsesIdle = false;
        let lateTimer = null;
        //
        function active() {
            return !suspended && !navigating && !document.hidden;
        }
        function clearScrolling() {
            if (scrollTimer !== null) window.clearTimeout(scrollTimer);
            scrollTimer = null;
            scrolling = false;
            root.removeAttribute(SCROLL_ATTR);
        }
        function stopJobs() {
            clearScrolling();
            if (decodeJob !== null) {
                if (decodeUsesIdle) window.cancelIdleCallback(decodeJob);
                else window.clearTimeout(decodeJob);
            }
            decodeJob = null;
            if (lateTimer !== null) window.clearTimeout(lateTimer);
            lateTimer = null;
        }
        function decodeThumbnails() {
            const images = document.querySelectorAll(THUMBNAILS.join(','));
            const limit = Math.min(images.length, CONFIG.maxThumbnailImagesPerPass);
            let leading = 0;
            let changed = 0;
            for (let i = 0; i < limit; i++) {
                const image = images[i];
                if (!image.isConnected || image.closest(
                    '[hidden], [aria-hidden="true"], #movie_player, ytd-player, ytd-miniplayer'
                )) continue;
                if (leading++ < CONFIG.thumbnailSkipFirst) continue;
                if (image.hasAttribute('decoding') ||
                    (image.getAttribute('fetchpriority') || '').trim().toLowerCase() === 'high' ||
                    !(image.getAttribute('src') || image.getAttribute('srcset'))) continue;
                image.setAttribute('decoding', 'async');
                changed++;
            }
            // No geometry reads: inspecting skipped descendants can force layout.
            // This hint does not re-decode an already displayed image.
            if (CONFIG.debug) console.info('[Remia YT Perf] Thumbnail hints.', { changed });
        }
        function queueDecode() {
            if (!CONFIG.asyncThumbnailDecoding || !active() || decodeJob !== null) return;
            decodeUsesIdle = typeof window.requestIdleCallback === 'function' &&
                typeof window.cancelIdleCallback === 'function';
            const run = () => {
                decodeJob = null;
                if (active()) decodeThumbnails();
            };
            decodeJob = decodeUsesIdle
                ? window.requestIdleCallback(run, { timeout: 1000 })
                : window.setTimeout(run, 50);
        }
        function activate() {
            if (!active() || document.readyState === 'loading') return;
            queueDecode();
            if (!CONFIG.asyncThumbnailDecoding) return;
            if (lateTimer !== null) window.clearTimeout(lateTimer);
            lateTimer = window.setTimeout(() => {
                lateTimer = null;
                queueDecode();
            }, CONFIG.thumbnailHydrationDelayMs);
        }
        function onScroll() {
            if (!active()) return;
            if (!scrolling) {
                scrolling = true;
                root.setAttribute(SCROLL_ATTR, '');
            }
            if (scrollTimer !== null) window.clearTimeout(scrollTimer);
            scrollTimer = window.setTimeout(clearScrolling, CONFIG.scrollIdleMs);
        }
        //
        if (CONFIG.reduceThumbnailTransitionsWhileScrolling) {
            document.addEventListener('scroll', onScroll, { passive: true, capture: true });
            document.addEventListener('scrollend', clearScrolling, { capture: true });
        }
        document.addEventListener('yt-navigate-start', () => {
            navigating = true;
            stopJobs();
        }, true);
        document.addEventListener('yt-navigate-finish', () => {
            navigating = false;
            activate();
        }, true);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopJobs();
            else activate();
        });
        window.addEventListener('pagehide', () => {
            suspended = true;
            stopJobs();
        });
        window.addEventListener('pageshow', event => {
            if (!event.persisted) return;
            suspended = false;
            navigating = false;
            activate();
        });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', activate, { once: true });
        } else activate();
    }
    //
    function installStyle() {
        const parent = document.head || document.documentElement;
        if (!parent) return false;
        let style = document.getElementById(STYLE_ID);
        if (style && style.localName !== 'style') {
            if (CONFIG.debug) console.warn('[Remia YT Perf] Style ID conflict.');
            return true;
        }
        if (!cssText) {
            if (style) style.remove();
            return true;
        }
        const isNew = !style;
        if (isNew) {
            style = document.createElement('style');
            style.id = STYLE_ID;
        }
        // Refresh an older installation without creating a second stylesheet.
        if (style.textContent !== cssText) style.textContent = cssText;
        style.setAttribute('data-remia-version', VERSION);
        if (isNew) parent.appendChild(style);
        if (CONFIG.debug) {
            console.info('[Remia YT Perf] Styles ready.', {
                version: VERSION,
                supportsContentVisibility,
                containedSelectors: containedSelectors.length,
                cssCharacters: cssText.length
            });
        }
        return true;
    }
    // CSS matches SPA content automatically. Optional runtime work is bounded
    // and event-driven, without DOM observers or browser API replacements.
    if (installStyle()) {
        startRuntime();
        return;
    }
    //
    function onReady() {
        if (!installStyle()) return;
        document.removeEventListener('readystatechange', onReady);
        document.removeEventListener('DOMContentLoaded', onReady);
        startRuntime();
    }
    document.addEventListener('readystatechange', onReady);
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
})();
