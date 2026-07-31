/* MB015 - Conference Room Board : the store
 *
 * THE RULE: views never touch localStorage. They only call store.*
 * That single rule is what keeps the backend swappable.
 *
 * Every method returns a Promise even though this adapter is synchronous.
 * That is deliberate: a network adapter has to be async, and if the views were
 * written against synchronous calls today, every one of them would need
 * rewriting the day a real backend arrives.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS NOT
 *
 * localStorage is PER BROWSER and PER DEVICE. Two phones scanning the same QR
 * see two completely separate schedules. Nothing here syncs, and nothing here
 * can. This is a working prototype of the interface, not a working booking
 * system, and it must not be handed to the crew as one.
 *
 * Export/Import exists as the honest stopgap: it moves a schedule between
 * devices by hand, and it makes the limitation visible instead of hiding it.
 * ---------------------------------------------------------------------------
 * ADAPTER CONTRACT - implement these and a real backend drops in:
 *
 *   load()              -> Promise<void>     prepare/connect
 *   listRaw()           -> Promise<Row[]>    every booking
 *   write(rows)         -> Promise<void>     persist the full set
 *   nextId()            -> string            unique row id
 *   reset()             -> Promise<void>     back to seed
 *
 * A REST adapter caches in listRaw and turns write() into POST/PATCH. A
 * row-level adapter can override insert/update/remove on the returned store.
 * ---------------------------------------------------------------------------
 */
window.DFW = window.DFW || {};

(function () {

  var STORAGE_KEY = 'mb015-room-bookings-v1';

  /* Bumped to 2 on 2026-07-30. load() reseeds anything that does not match,
     which is the point: a board saved by the previous build can contain
     'Recurring - fixed' types, 'Emergency takeover' rows and 'Done' rows that
     no longer have any UI behind them. Reseeding is safe here and nowhere else
     - this is sample data on one phone, not a record of anything. */
  var SCHEMA_VERSION = 2;

  /* ---- LocalStorageAdapter ---------------------------------------------- */

  function LocalStorageAdapter() {
    this.db = null;
  }

  function emptyDb() {
    return { schemaVersion: SCHEMA_VERSION, counter: 0, rows: [] };
  }

  function seededDb() {
    var db = emptyDb();
    var rows = (DFW.SEED && typeof DFW.SEED.build === 'function') ? DFW.SEED.build() : [];
    db.rows = rows.map(function (r) {
      db.counter += 1;
      var copy = {};
      Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
      /* A seed row may carry its own id. It is what lets the seeded weekly
         series pin stable ids to its occurrences, so "cancel this and every
         one after" has something consistent to act on across a reload. */
      copy._id = r._id || ('bk-' + db.counter);
      copy._createdAt = copy._createdAt || new Date().toISOString();
      return copy;
    });
    return db;
  }

  LocalStorageAdapter.prototype.load = function () {
    var raw = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); }
    catch (e) { raw = null; }        /* private mode throws on read too */

    if (!raw) {
      this.db = seededDb();
      this.persist();
      return Promise.resolve();
    }

    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }

    /* A corrupt or older payload reseeds rather than throwing. A board that
       refuses to draw is worse than a board showing sample data, because the
       first tells you nothing about what went wrong. */
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.rows)) {
      this.db = seededDb();
      this.persist();
      return Promise.resolve();
    }

    this.db = parsed;
    return Promise.resolve();
  };

  LocalStorageAdapter.prototype.persist = function () {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
      return true;
    } catch (e) {
      /* Quota exceeded, or Safari private mode. Say so out loud. A booking
         that silently fails to save is the exact failure this board exists to
         remove, not reproduce. */
      if (DFW.toast) DFW.toast('Could not save on this device. Changes last until you reload.');
      return false;
    }
  };

  LocalStorageAdapter.prototype.listRaw = function () {
    return Promise.resolve(this.db.rows.slice());
  };

  LocalStorageAdapter.prototype.write = function (rows) {
    this.db.rows = rows;
    this.persist();
    return Promise.resolve();
  };

  LocalStorageAdapter.prototype.nextId = function () {
    this.db.counter = (this.db.counter || 0) + 1;
    return 'bk-' + this.db.counter;
  };

  LocalStorageAdapter.prototype.reset = function () {
    this.db = seededDb();
    this.persist();
    return Promise.resolve();
  };

  LocalStorageAdapter.prototype.replaceAll = function (payload) {
    this.db = payload;
    this.persist();
    return Promise.resolve();
  };

  /* ---- Store ------------------------------------------------------------- */

  function createStore(adapter) {
    var subs = [];

    function notify() {
      subs.forEach(function (cb) {
        try { cb(); } catch (e) { console.error('subscriber failed', e); }
      });
    }

    function byStart(a, b) {
      var at = DFW.util.parseTime(a.start), bt = DFW.util.parseTime(b.start);
      if (at === null && bt === null) return 0;
      if (at === null) return 1;
      if (bt === null) return -1;
      return at - bt;
    }

    var store = {

      init: function () { return adapter.load(); },

      /* Always start-ordered. Every view wants it that way, and sorting once
         here means no view can forget to. */
      list: function () {
        return adapter.listRaw().then(function (rows) {
          return rows.slice().sort(byStart);
        });
      },

      get: function (id) {
        return adapter.listRaw().then(function (rows) {
          for (var i = 0; i < rows.length; i++) if (rows[i]._id === id) return rows[i];
          return null;
        });
      },

      insert: function (row) {
        return adapter.listRaw().then(function (rows) {
          var copy = {};
          Object.keys(row).forEach(function (k) { copy[k] = row[k]; });
          copy._id = adapter.nextId();
          copy._createdAt = new Date().toISOString();
          return adapter.write(rows.concat([copy])).then(function () {
            notify();
            return copy;
          });
        });
      },

      /* Several rows at once, in ONE write.
       *
       * A weekly meeting is up to 12 rows and they are created and cancelled
       * as a unit. Doing that as N sequential insert()/update() calls means N
       * read-modify-write cycles, and a failure at row 7 leaves half a series
       * on the board with nothing to say so. Either the whole series lands or
       * none of it does. */
      insertMany: function (list) {
        if (!list || !list.length) return Promise.resolve([]);
        return adapter.listRaw().then(function (rows) {
          var made = list.map(function (row) {
            var copy = {};
            Object.keys(row).forEach(function (k) { copy[k] = row[k]; });
            copy._id = adapter.nextId();
            copy._createdAt = new Date().toISOString();
            return copy;
          });
          return adapter.write(rows.concat(made)).then(function () {
            notify();
            return made;
          });
        });
      },

      update: function (id, patch) {
        return store.updateMany([id], patch).then(function (found) {
          return found[0];
        });
      },

      updateMany: function (ids, patch) {
        var want = {};
        (ids || []).forEach(function (i) { want[i] = true; });

        return adapter.listRaw().then(function (rows) {
          var found = [];
          var next = rows.map(function (r) {
            if (!want[r._id]) return r;
            var copy = {};
            Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
            Object.keys(patch).forEach(function (k) { copy[k] = patch[k]; });
            found.push(copy);
            return copy;
          });
          /* Refuses the whole write if ANY id is missing. A partial update
             that silently skips a row it could not find is the shape of bug
             that leaves one occurrence of a cancelled weekly meeting sitting
             on the board looking live. */
          if (found.length !== Object.keys(want).length) {
            return Promise.reject(new Error('Some of those bookings no longer exist. Nothing was changed.'));
          }
          return adapter.write(next).then(function () {
            notify();
            return found;
          });
        });
      },

      remove: function (id) {
        return adapter.listRaw().then(function (rows) {
          var next = rows.filter(function (r) { return r._id !== id; });
          return adapter.write(next).then(notify);
        });
      },

      subscribe: function (cb) {
        subs.push(cb);
        return function () {
          var i = subs.indexOf(cb);
          if (i >= 0) subs.splice(i, 1);
        };
      },

      resetToSeed: function () {
        return adapter.reset().then(notify);
      },

      /* The manual sync path, until there is a real one. */
      exportJSON: function () {
        return store.list().then(function (rows) {
          return JSON.stringify({
            app: 'MB015 Conference Room Board',
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            rows: rows
          }, null, 2);
        });
      },

      importJSON: function (text) {
        var parsed;
        try { parsed = JSON.parse(text); }
        catch (e) { return Promise.reject(new Error('That is not valid JSON.')); }

        if (!parsed || !Array.isArray(parsed.rows)) {
          return Promise.reject(new Error('No bookings found in that file.'));
        }
        if (!adapter.replaceAll) {
          return Promise.reject(new Error('This backend cannot be bulk-replaced.'));
        }

        var counter = 0;
        var rows = parsed.rows.map(function (r) {
          var copy = {};
          Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
          counter += 1;
          if (!copy._id) copy._id = 'bk-' + counter;
          return copy;
        });

        return adapter.replaceAll({
          schemaVersion: SCHEMA_VERSION, counter: counter, rows: rows
        }).then(notify);
      }
    };

    return store;
  }

  DFW.createStore = createStore;
  DFW.LocalStorageAdapter = LocalStorageAdapter;
  DFW.STORAGE_KEY = STORAGE_KEY;

})();
