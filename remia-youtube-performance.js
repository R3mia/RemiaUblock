/// remia-youtube-performance.js
/// world ISOLATED
/*
 * Remia's YouTube Performance — uBlock Origin custom scriptlet
 * Target: desktop YouTube on Firefox / Zen Browser
 * Version: 1.1.0 (2026-11-09)
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
    const VERSION = '1.1.0';
    const STYLE_ID = 'remia-youtube-performance-style';
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
    // Screen-only rules leave the page's print layout alone.
    const cssText = rules.length
        ? '@media screen {\n' + rules.join('\n') + '\n}\n'
        : '';
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
    // CSS automatically matches new SPA content. No polling, persistent
    // DOM observers, layout measurements, or browser API replacements.
    if (installStyle()) return;
    //
    function onReady() {
        if (!installStyle()) return;
        document.removeEventListener('readystatechange', onReady);
        document.removeEventListener('DOMContentLoaded', onReady);
    }
    document.addEventListener('readystatechange', onReady);
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
})();
