import '../types';
import { captureModel } from '../core/capture';
import { detectEnv } from '../core/env';
import { App } from '../app/App';

const KEY = '__siteForge';

if (window[KEY]) {
  window[KEY]!.toggle();
} else {
  let app: App | null = null;
  let fadingApp: App | null = null;

  function start() {
    if (app) return;
    if (fadingApp) {
      const previous = fadingApp;
      fadingApp = null;
      previous.destroy(false);
    }
    app = new App();
    app.run().catch((err: unknown) => console.error('[SiteForge]', err));
  }

  function stop(reveal = false) {
    const a = app || (!reveal ? fadingApp : null);
    if (!a) return;
    if (app === a) app = null;
    if (reveal) fadingApp = a;
    else fadingApp = null;
    a.destroy(reveal);
  }

  window[KEY] = {
    toggle() {
      if (app) stop(false);
      else start();
    },
    start,
    stop,
    get app() {
      return app;
    },
    exportCaptureDebug() {
      app?.exportCaptureDebug();
    },
    debug: { captureModel, detectEnv },
  };

  start();
}
