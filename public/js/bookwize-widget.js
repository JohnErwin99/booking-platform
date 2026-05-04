/**
 * Bookwize Embeddable Widget SDK
 *
 * Usage (inline):
 *   <div id="bookwize-widget"></div>
 *   <script src="https://bookwizeapp.com/js/bookwize-widget.js"
 *           data-slug="your-business"
 *           data-mode="inline"></script>
 *
 * Usage (button / popup):
 *   <script src="https://bookwizeapp.com/js/bookwize-widget.js"
 *           data-slug="your-business"
 *           data-mode="popup"
 *           data-button-text="Book Now"
 *           data-button-color="#F28C38"></script>
 */
(function () {
  'use strict';

  // Find the script tag to read data attributes
  const scriptTag = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const slug = scriptTag.getAttribute('data-slug');
  const mode = scriptTag.getAttribute('data-mode') || 'popup';
  const buttonText = scriptTag.getAttribute('data-button-text') || 'Book Now';
  const buttonColor = scriptTag.getAttribute('data-button-color') || '#F28C38';
  const containerId = scriptTag.getAttribute('data-container') || 'bookwize-widget';
  const baseUrl = scriptTag.src.replace(/\/js\/bookwize-widget\.js.*$/, '');

  if (!slug) {
    console.error('Bookwize Widget: data-slug is required.');
    return;
  }

  const embedUrl = baseUrl + '/book/' + slug + '/embed';

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    .bw-popup-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 99999; display: none; align-items: center; justify-content: center;
      opacity: 0; transition: opacity .3s ease;
    }
    .bw-popup-overlay.open { display: flex; opacity: 1; }
    .bw-popup-frame {
      background: #fff; border-radius: 20px; overflow: hidden;
      width: 95%; max-width: 520px; max-height: 90vh;
      box-shadow: 0 24px 80px rgba(0,0,0,.2);
      position: relative;
      animation: bwSlideUp .35s cubic-bezier(.4,0,.2,1);
    }
    @keyframes bwSlideUp {
      from { transform: translateY(40px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .bw-popup-close {
      position: absolute; top: 12px; right: 12px; z-index: 10;
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(0,0,0,.06); border: none; cursor: pointer;
      font-size: 18px; color: #666; display: flex; align-items: center;
      justify-content: center; transition: background .2s;
    }
    .bw-popup-close:hover { background: rgba(0,0,0,.12); }
    .bw-popup-frame iframe, .bw-inline-frame iframe {
      width: 100%; border: none; display: block;
    }
    .bw-popup-frame iframe { height: 80vh; max-height: 700px; }
    .bw-inline-frame {
      border-radius: 16px; overflow: hidden;
      border: 1px solid #e5e5e5;
      box-shadow: 0 4px 24px rgba(0,0,0,.06);
    }
    .bw-inline-frame iframe { height: 680px; }
    .bw-trigger-btn {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 8px; padding: 14px 32px; border-radius: 12px; border: none;
      font-size: 16px; font-weight: 600; color: #fff; cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: all .2s ease; box-shadow: 0 4px 16px rgba(0,0,0,.15);
    }
    .bw-trigger-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,.2);
    }
    .bw-trigger-btn svg { flex-shrink: 0; }
    .bw-powered {
      text-align: center; padding: 8px; font-size: 11px;
      color: #aaa; font-family: -apple-system, sans-serif;
      background: #fafafa; border-top: 1px solid #eee;
    }
    .bw-powered a { color: #888; text-decoration: none; font-weight: 600; }
    .bw-powered a:hover { color: #F28C38; }
  `;
  document.head.appendChild(style);

  // Calendar icon SVG
  const calIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

  if (mode === 'inline') {
    // Inline mode — render iframe directly in container
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('Bookwize Widget: container #' + containerId + ' not found.');
      return;
    }
    container.innerHTML = `
      <div class="bw-inline-frame">
        <iframe src="${embedUrl}" title="Book an appointment" loading="lazy"></iframe>
        <div class="bw-powered">Powered by <a href="https://bookwizeapp.com" target="_blank">Bookwize</a></div>
      </div>
    `;
  } else {
    // Popup mode — create floating button + modal overlay
    const btn = document.createElement('button');
    btn.className = 'bw-trigger-btn';
    btn.style.background = buttonColor;
    btn.innerHTML = calIcon + ' ' + buttonText;

    const overlay = document.createElement('div');
    overlay.className = 'bw-popup-overlay';
    overlay.innerHTML = `
      <div class="bw-popup-frame">
        <button class="bw-popup-close" aria-label="Close">&times;</button>
        <iframe src="" title="Book an appointment" loading="lazy"></iframe>
        <div class="bw-powered">Powered by <a href="https://bookwizeapp.com" target="_blank">Bookwize</a></div>
      </div>
    `;

    const iframe = overlay.querySelector('iframe');
    const closeBtn = overlay.querySelector('.bw-popup-close');

    function openWidget() {
      iframe.src = embedUrl;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeWidget() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(() => { iframe.src = ''; }, 300);
    }

    btn.addEventListener('click', openWidget);
    closeBtn.addEventListener('click', closeWidget);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeWidget();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeWidget();
    });

    // Insert button where the script tag is
    scriptTag.parentNode.insertBefore(btn, scriptTag);
    document.body.appendChild(overlay);
  }
})();
