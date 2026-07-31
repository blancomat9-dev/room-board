/* MB015 - Conference Room Board : router and boot */
window.DFW = window.DFW || {};

(function () {

  var ui = DFW.ui, el = ui.el;

  /* Today / Week / Month are NOT in here. They are calendar modes, switched by
     the segmented control on the board itself, and listing them twice would
     give two competing controls for one choice.

     Data is not in here either (decided 2026-07-30): it holds a wipe-everything
     button and only makes sense to whoever maintains this. The #/data route
     still works when typed - it is hidden, not removed. */
  var NAV = [
    { route: '', label: 'Board' },
    { route: 'book', label: 'Book' },
    { route: 'placard', label: 'Placard' }
  ];

  /* Which top-nav entry lights up for a route that is not itself in the nav. */
  var NAV_OF = { week: '', month: '', day: '' };

  var TITLES = {
    '': 'Today', day: 'Day', week: 'The week', month: 'The month',
    book: 'Book the room', placard: 'Door placard', data: 'Data'
  };

  /* WHICH STORE, decided once here and nowhere else (2026-07-31).
   *
   * Filled-in CONFIG.SUPABASE means one shared Postgres table and every device
   * seeing the same schedule. Empty means localStorage, per browser and per
   * device, which is what this was until today.
   *
   * The localStorage path is deliberately KEPT rather than replaced. It is the
   * offline fallback, and it is what selftest.html and flowtest.html drive -
   * they construct LocalStorageAdapter directly and never load this file, so
   * nothing here can reach them. That is why the 350 assertions must still pass
   * completely unchanged after this edit; if they do not, something below has
   * leaked into the offline path.
   *
   * Note what this does NOT do: it does not fall back to localStorage when the
   * network is down. Silently switching a shared board to a private one would
   * let somebody book a room into a schedule nobody else can see, and they
   * would have no way of knowing. Being told the board is unreachable is worse
   * to look at and far better to trust. */
  var SB = DFW.CONFIG.SUPABASE;
  var SHARED = !!(SB && SB.url && SB.anonKey);
  var store = SHARED
    ? DFW.createSupabaseStore(SB)
    : DFW.createStore(new DFW.LocalStorageAdapter());

  DFW.SHARED = SHARED;      /* views-data.js hides its destructive controls on this */

  var current = '';
  var tickTimer = null;

  /* Only the two board views recompute on a timer. Ticking a form would wipe
     whatever someone had half-typed into it, which is a far worse bug than a
     slightly stale clock on a page nobody is reading. */
  var LIVE_ROUTES = { '': true, day: true, week: true, month: true };

  function parseHash() {
    var raw = String(location.hash || '').replace(/^#\/?/, '');
    var qi = raw.indexOf('?');
    var route = qi === -1 ? raw : raw.slice(0, qi);
    var query = {};
    if (qi !== -1) {
      raw.slice(qi + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var bits = pair.split('=');
        query[decodeURIComponent(bits[0])] = decodeURIComponent(bits.slice(1).join('=') || '');
      });
    }
    /* 'today' and '' are the same place. The QR encodes the bare URL, so the
       empty route has to be the real one. */
    if (route === 'today') route = '';
    return { route: route, query: query };
  }

  function renderNav(active) {
    var lit = NAV_OF.hasOwnProperty(active) ? NAV_OF[active] : active;
    var nav = document.getElementById('nav');
    ui.clear(nav);
    NAV.forEach(function (n) {
      nav.appendChild(el('a', {
        href: '#/' + n.route,
        text: n.label,
        'aria-current': n.route === lit ? 'page' : null
      }));
    });
  }

  function render() {
    var parsed = parseHash();
    current = parsed.route;

    var view = DFW.views[current === '' ? 'today' : current];
    var mount = document.getElementById('view');
    renderNav(current);
    document.title = (TITLES[current] || 'Not found') + ' - ' + DFW.CONFIG.ROOM_NAME;

    if (!view) {
      ui.clear(mount);
      mount.appendChild(el('div', { class: 'viewhead' }, [el('h1', { text: 'That page does not exist' })]));
      mount.appendChild(ui.note('No view is registered for "' + current + '".', 'warn'));
      mount.appendChild(el('div', { class: 'toolbar' }, [
        el('a', { class: 'btn btn-primary', href: '#/', text: 'Back to today' })
      ]));
      return;
    }

    store.list().then(function (rows) {
      ui.clear(mount);
      var ctx = {
        store: store,
        query: parsed.query,
        route: current,
        /* One clock reading for the whole render. Calling Date.now() inside
           each card would let a booking be evaluated a few milliseconds after
           the one above it, which is invisible almost always and produces an
           unreproducible off-by-one exactly on a boundary. */
        now: Date.now(),
        refresh: function () { render(); }
      };
      try {
        view(mount, rows, ctx);
      } catch (e) {
        console.error('View "' + current + '" failed:', e);
        ui.clear(mount);
        mount.appendChild(el('div', { class: 'viewhead' }, [el('h1', { text: 'This page could not be drawn' })]));
        mount.appendChild(ui.note(
          'Something went wrong rendering "' + current + '": ' + e.message +
          '. Your bookings are untouched. Details are in the browser console.', 'bad'));
      }
    }, function (e) {
      /* READING THE BOARD CAN NOW FAIL. Against localStorage list() could not
         reject, so this handler did not exist and did not need to. Against a
         network it rejects on a dropped connection, a paused free-tier project
         or a revoked key - and without this the page renders as blank white,
         which tells the person standing at the door nothing at all.
         Deliberately does NOT fall back to cached or local data: an empty board
         that says it is empty is honest, a stale board that looks live is not. */
      console.error('Could not load bookings:', e);
      ui.clear(mount);
      mount.appendChild(el('div', { class: 'viewhead' }, [
        el('h1', { text: 'The board could not be loaded' })
      ]));
      mount.appendChild(ui.note(
        e.message + ' Nothing has been lost - this is a problem reading the ' +
        'schedule, not the schedule itself.', 'bad'));
      mount.appendChild(el('div', { class: 'toolbar' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button', text: 'Try again',
          onclick: function () { render(); }
        })
      ]));
    });
  }

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (LIVE_ROUTES[current]) render();
    }, DFW.CONFIG.TICK_MS);
  }

  /* ---- Theme -------------------------------------------------------------
   *
   * The MB008 pattern, same class name and same shape, so the two files stay
   * comparable: light is the default and html.dark is the override.
   *
   * The class is applied by an inline script in index.html BEFORE the
   * stylesheet has anything to paint, not here. Setting it after boot means a
   * dark-mode user gets a white flash on every single load, which on a phone
   * pulled out in a dim trailer is the whole reason they turned it on.
   *
   * Nothing here re-renders the board: every colour comes from a CSS custom
   * property, so flipping one class on <html> repaints the cards, the
   * timeline blocks and the month dots in place. That is the entire payoff for
   * taking the hex codes out of state.js.
   */
  var THEME_KEY = 'mb015-dark';

  function readTheme() {
    try { return window.localStorage.getItem(THEME_KEY) === '1'; }
    catch (e) { return false; }        /* private mode throws on read */
  }

  function applyTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    var btn = document.getElementById('themebtn');
    if (!btn) return;
    btn.textContent = dark ? '☀' : '☾';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('title', dark ? 'Switch to light' : 'Switch to dark');
    btn.setAttribute('aria-label', dark ? 'Switch to light colours' : 'Switch to dark colours');
  }

  function wireTheme() {
    var btn = document.getElementById('themebtn');
    if (!btn) return;
    applyTheme(readTheme());
    btn.addEventListener('click', function () {
      var next = !document.documentElement.classList.contains('dark');
      applyTheme(next);
      /* A refused write is not worth a message. The choice simply does not
         survive a reload, which is a smaller problem than a toast on top of
         the board every time somebody taps the moon. */
      try { window.localStorage.setItem(THEME_KEY, next ? '1' : '0'); } catch (e) {}
    });
  }

  /* The banner says what is ACTUALLY true of the store that loaded, and it is
     set here rather than written into index.html because that is how it went
     wrong before: the markup claimed "stored in this browser" for hours after
     that had stopped being the whole story. A reassurance nobody re-checked is
     worse than no reassurance (vault CLAUDE.md section 12). */
  function writeNote() {
    var n = document.getElementById('protonote');
    if (!n) return;
    ui.clear(n);
    if (SHARED) {
      n.appendChild(el('strong', { text: 'Shared board.' }));
      n.appendChild(document.createTextNode(
        ' Bookings are visible on every device that opens this page. Still ' +
        'sample data - not in service yet.'));
    } else {
      n.appendChild(el('strong', { text: 'Prototype.' }));
      n.appendChild(document.createTextNode(
        ' Bookings are stored in this browser only and do not sync to anyone else.'));
    }
  }

  function boot() {
    wireTheme();
    writeNote();

    window.addEventListener('hashchange', function () {
      render();
      window.scrollTo(0, 0);
    });

    store.init().then(function () {
      DFW.store = store;      /* handy in the console; views get it via ctx */
      render();
      startTick();
    }).catch(function (e) {
      console.error('Store failed to start:', e);
      var mount = document.getElementById('view');
      ui.clear(mount);
      mount.appendChild(el('div', { class: 'viewhead' }, [el('h1', { text: 'The board could not start' })]));
      mount.appendChild(ui.note('The local data store failed to load: ' + e.message, 'bad'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  DFW.NAV = NAV;

})();
