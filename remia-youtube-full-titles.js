/// remia-youtube-full-titles.js
/// world ISOLATED
/*
 * Remia YouTube Full Titles v1.0.0 (2026-11-11)
 * Smaller, fully wrapped titles on desktop YouTube video cards.
 * Supports legacy renderers and newer yt-lockup-view-model cards.
 *
 * INSTALL:
 * 1. Host this exact file as raw text over HTTPS.
 * 2. Add its URL to uBO Advanced settings > userResourcesLocation.
 * 3. Add to My filters: www.youtube.com##+js(remia-youtube-full-titles)
 * 4. Apply changes and reload YouTube.
 *
 * Keep the resource free of empty lines. Use comment-only separators.
 * CSS only: no polling, DOM observers, or page API replacements.
 * Full titles require taller cards when the available width is small.
 */
(function () {
    'use strict';
    const CONFIG = {
        fontSizePx: 12,
        lineHeight: 1.35,
        expandCards: true
    };
    //
    if (window.top !== window.self) return;
    if (location.hostname !== 'www.youtube.com' &&
        location.hostname !== 'youtube.com') return;
    //
    const STYLE_ID = 'remia-youtube-full-titles-style';
    const fontSize = Math.min(24, Math.max(8, Number(CONFIG.fontSizePx) || 12));
    const lineHeight = Math.min(2, Math.max(1.1, Number(CONFIG.lineHeight) || 1.35));
    const cards = ':is(ytd-rich-item-renderer, ytd-rich-grid-media, ' +
        'ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
        'ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ' +
        'yt-lockup-view-model)';
    const modernTitle = ':is(.ytLockupMetadataViewModelTitle, ' +
        '.ytLockupMetadataViewModelHeadingReset, ' +
        '.yt-lockup-metadata-view-model__title, ' +
        '.yt-lockup-metadata-view-model-wiz__title)';
    const titles = [
        cards + ' :is(#video-title, #video-title-link)',
        cards + ' ' + modernTitle,
        'yt-lockup-metadata-view-model ' + modernTitle,
        ':is(ytd-rich-grid-media, ytd-grid-video-renderer, ' +
            'ytd-video-renderer, ytd-compact-video-renderer) h3'
    ];
    const textNodes = titles.map(selector => selector +
        ' :is(.ytAttributedStringHost, .yt-core-attributed-string, yt-formatted-string)');
    const wrappers = [
        cards + ' :is(.ytLockupMetadataViewModelTextContainer, ' +
            '.yt-lockup-metadata-view-model__text-container, ' +
            '.yt-lockup-metadata-view-model-wiz__text-container)',
        'yt-lockup-metadata-view-model .ytLockupMetadataViewModelTextContainer',
        'yt-lockup-metadata-view-model .yt-lockup-metadata-view-model__text-container',
        'yt-lockup-metadata-view-model .yt-lockup-metadata-view-model-wiz__text-container',
        'ytd-rich-grid-media #meta',
        'ytd-grid-video-renderer #meta',
        'ytd-video-renderer #meta',
        'ytd-compact-video-renderer #metadata'
    ];
    function scoped(selectors) {
        return selectors.map(selector => 'html:root ytd-app ' + selector).join(',\n');
    }
    // Remove clamping on headings, links, and attributed text independently.
    const rules = [
        scoped(titles.concat(textNodes)) + ' {\n' +
        '  font-size: ' + fontSize + 'px !important;\n' +
        '  line-height: ' + lineHeight + ' !important;\n' +
        '  display: block !important;\n' +
        '  -webkit-line-clamp: unset !important;\n' +
        '  line-clamp: unset !important;\n' +
        '  -webkit-box-orient: initial !important;\n' +
        '  white-space: normal !important;\n' +
        '  overflow-wrap: anywhere !important;\n' +
        '  word-break: normal !important;\n' +
        '  text-overflow: clip !important;\n' +
        '  overflow: visible !important;\n' +
        '  height: auto !important;\n' +
        '  block-size: auto !important;\n' +
        '  max-height: none !important;\n' +
        '  max-block-size: none !important;\n' +
        '  min-width: 0 !important;\n' +
        '  max-width: 100% !important;\n' +
        '}',
        scoped(wrappers) + ' {\n' +
        '  min-width: 0 !important;\n' +
        '  height: auto !important;\n' +
        '  max-height: none !important;\n' +
        '  max-block-size: none !important;\n' +
        '}'
    ];
    // Preserve thumbnail dimensions, grid column widths, and menu controls.
    if (CONFIG.expandCards) {
        rules.push('html:root ytd-app ' + cards + ' {\n' +
            '  height: auto !important;\n' +
            '  max-height: none !important;\n' +
            '  max-block-size: none !important;\n' +
            '}'
        );
    }
    const cssText = '@media screen {\n' + rules.join('\n') + '\n}\n';
    //
    function install() {
        const parent = document.head || document.documentElement;
        if (!parent) return false;
        let style = document.getElementById(STYLE_ID);
        if (style && style.localName !== 'style') return true;
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = cssText;
            parent.appendChild(style);
        } else if (style.textContent !== cssText) {
            style.textContent = cssText;
        }
        return true;
    }
    // Selectors automatically apply to new cards during YouTube SPA navigation.
    if (install()) return;
    function onReady() {
        if (!install()) return;
        document.removeEventListener('readystatechange', onReady);
        document.removeEventListener('DOMContentLoaded', onReady);
    }
    document.addEventListener('readystatechange', onReady);
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
})();
