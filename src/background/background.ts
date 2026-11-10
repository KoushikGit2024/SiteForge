/// <reference types="chrome" />

export {};

/**
 * Service Worker:
 * Clicking the toolbar icon (or Alt+Shift+B) injects SiteForge into the active tab.
 * Injecting again while it is running toggles it off.
 */
import '../types';

// For one screenshot frame, show only the pixels the DOM can't give back
// (WebGL canvases, playing video, cross-origin iframes) so SiteForge can crop them cleanly.
const MEDIA_ONLY_CSS = `
html body *:not(canvas):not(video):not(iframe):not(embed):not(object) { visibility: hidden !important; }
html body canvas, html body video, html body iframe, html body embed, html body object { visibility: visible !important; }
`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface ProbeResult {
  running?: boolean;
  media?: boolean;
}

async function injectSiteForge(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab || tab.id == null || tab.windowId == null) return;
  const target = { tabId: tab.id };
  let hidden = false;

  try {
    const [probe] = await chrome.scripting.executeScript({
      target,
      func: (): ProbeResult => {
        const running = !!(window.__siteForge && window.__siteForge.app);
        let media = false;
        if (!running) {
          for (const el of document.querySelectorAll('canvas, video, iframe, embed, object')) {
            const r = el.getBoundingClientRect();
            if (
              r.width > 8 &&
              r.height > 8 &&
              r.bottom > 0 &&
              r.right > 0 &&
              r.top < window.innerHeight &&
              r.left < window.innerWidth
            ) {
              media = true;
              break;
            }
          }
        }
        return { running, media };
      },
    });

    const { running, media } = probe.result || {};

    if (!running && media) {
      try {
        await chrome.scripting.insertCSS({ target, css: MEDIA_ONLY_CSS });
        hidden = true;
        await sleep(90);
        const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        await chrome.scripting.executeScript({
          target,
          func: (s: string) => {
            window.__siteForgeShot = s;
            window.__siteForgeHidden = true;
          },
          args: [shot],
        });
      } catch {
        // no screenshot: those regions fall back to placeholders
        if (hidden) {
          await chrome.scripting.removeCSS({ target, css: MEDIA_ONLY_CSS }).catch(() => {});
          hidden = false;
        }
      }
    }

    await chrome.scripting.executeScript({ target, files: ['siteforge.js'] });
  } catch (err) {
    console.warn('[SiteForge] Unable to inject into the active tab.', err);
    if (hidden) {
      await chrome.scripting.removeCSS({ target, css: MEDIA_ONLY_CSS }).catch(() => {});
    }
    // chrome://, Web Store, PDFs and other protected pages can't be scripted.
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#F24822' });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '×' });
    await chrome.action.setTitle({ tabId: tab.id, title: "SiteForge can't run on this page" });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      chrome.action.setTitle({ tabId: tab.id, title: 'SiteForge Blueprint (Alt+Shift+B)' });
    }, 2500);
  }
}

chrome.action.onClicked.addListener(injectSiteForge);

// SiteForge asks us to restore the page once its canvas fully covers it.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'siteforge:unhide' && sender.tab?.id != null) {
    chrome.scripting
      .removeCSS({ target: { tabId: sender.tab.id }, css: MEDIA_ONLY_CSS })
      .catch(() => {})
      .then(() => reply(true));
    return true;
  }
});
