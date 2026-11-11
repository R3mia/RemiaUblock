/// remia-youtube-full-titles.js
/// world ISOLATED
/*
 * Remia YouTube Full Titles v1.1.0 (2026-11-11)
 * Smaller titles with unrestricted wrapping on desktop YouTube.
 * Filter: www.youtube.com##+js(remia-youtube-full-titles)
 * Refresh the raw resource after replacing this file.
 * No empty lines inside this uBO resource.
 */
(function () {
    'use strict';
    const CONFIG = {
        fontSizePx: 10,
        lineHeight: 1.3,
        expandCards: true,
        debug: false
    };
    if (window.top !== window.self) return;
    if (!/^(?:www\.)?youtube\.com$/.test(location.hostname)) return;
    //
    const VERSION = '1.1.0';
    const STYLE_ID = 'remia-youtube-full-titles-style';
    const MARKER = 'data-remia-full-titles';
    const fontSize = Math.min(24, Math.max(8, Number(CONFIG.fontSizePx) || 10));
    const lineHeight = Math.min(2, Math.max(1.1, Number(CONFIG.lineHeight) || 1.3));
    // Group IDs and modern classes together so compact-layout CSS loses priority.
    const title = ':is(#video-title, #video-title-link, ' +
        '.ytLockupMetadataViewModelTitle, .ytLockupMetadataViewModelHeadingReset, ' +
        '.yt-lockup-metadata-view-model__title, .yt-lockup-metadata-view-model-wiz__title, ' +
        'ytd-rich-grid-media h3, ytd-grid-video-renderer h3, ' +
        'ytd-video-renderer h3, ytd-compact-video-renderer h3)' +
        ':not([hidden]):not([aria-hidden="true"])';
    const scope = 'html:root:root:root ';
    const wrappers = [
        '.ytLockupMetadataViewModelTextContainer',
        '.yt-lockup-metadata-view-model__text-container',
        '.yt-lockup-metadata-view-model-wiz__text-container',
        ':is(ytd-rich-grid-media, ytd-grid-video-renderer, ' +
            'ytd-video-renderer, ytd-compact-video-renderer) h3',
        ':is(ytd-rich-grid-media, ytd-grid-video-renderer, ytd-video-renderer) #meta',
        'ytd-compact-video-renderer #metadata'
    ];
    const cards = ':is(ytd-rich-item-renderer, ytd-rich-grid-media, ' +
        'ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
        'ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, yt-lockup-view-model)';
    const important = list => list.map(value => value + ' !important').join('; ');
    const textStyle = important([
        'font-size: ' + fontSize + 'px',
        'line-height: ' + lineHeight,
        '-webkit-line-clamp: unset',
        'line-clamp: unset',
        'white-space: normal',
        'overflow-wrap: anywhere',
        'word-break: normal',
        'text-overflow: clip',
        'overflow: visible',
        'height: auto',
        'block-size: auto',
        'max-height: none',
        'max-block-size: none',
        'min-width: 0',
        'max-width: 100%'
    ]);
    const sizeStyle = important([
        'height: auto', 'block-size: auto',
        'max-height: none', 'max-block-size: none', 'min-width: 0'
    ]);
    const rules = [
        scope + title + ' { display: block !important; ' + textStyle + '; }',
        scope + title + ' :is(a, span, yt-formatted-string) { ' + textStyle + '; }',
        wrappers.map(selector => scope + selector).join(',\n') +
            ' { ' + sizeStyle + '; overflow: visible !important; }'
    ];
    if (CONFIG.expandCards) {
        rules.push(scope + cards + ' { ' + sizeStyle +
            '; aspect-ratio: auto !important; }');
    }
    const cssText = '@media screen {\n' + rules.join('\n') + '\n}\n';
    const alreadyInstalled = document.documentElement &&
        document.documentElement.getAttribute(MARKER) === VERSION;
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
        document.documentElement.setAttribute(MARKER, VERSION);
        if (CONFIG.debug) console.info('[Remia Full Titles]', VERSION,
            'CSS ready; matched:', document.querySelectorAll(title).length);
        return true;
    }
    function onReady() {
        if (!install()) return;
        document.removeEventListener('readystatechange', onReady);
    }
    if (!install()) document.addEventListener('readystatechange', onReady);
    if (alreadyInstalled) return;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
    }
    document.addEventListener('yt-navigate-finish', install, true);
})();
