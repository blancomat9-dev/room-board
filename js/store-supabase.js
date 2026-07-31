/* MB015 - Conference Room Board : Supabase store
 *
 * LIVE since 2026-07-31. Drafted 2026-07-30 and parked outside app\ until it
 * was proven; moved in here when it was. This is now the store the app uses
 * whenever CONFIG.SUPABASE is filled in - app.js chooses at boot.
 *
 * store.js is NOT replaced. It stays as the offline path and is what all three
 * harnesses drive directly, which is why they still pass 215/135/no-overflow
 * unchanged after this was wired in.
 *
 * Verified against the real project 2026-07-31, not assumed:
 *   - two concurrent POSTs for one slot -> exactly one 201, one 23P01
 *   - DELETE with the anon key           -> 42501, refused
 *   - PATCH of somebody else's title     -> 42501, refused
 *   - cancel_bookings()                  -> 200, row reads Cancelled
 *
 * CLAUDE.md section 6a still gates REAL meeting titles and names. Everything
 * above was done with fabricated rows, all since deleted.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A STORE AND NOT AN ADAPTER
 *
 * store.js says "implement these five methods and a real backend drops in".
 * That is optimistic, and the reason is worth spelling out rather than
 * discovering.
 *
 * The adapter contract is write(rows) -> persist THE FULL SET. Every mutation
 * in store.js is therefore read-everything, change one thing in an array,
 * write-everything-back. On one device that is fine. Against a shared backend
 * it is a lost-update machine: two phones read 20 rows, each appends one, each
 * writes 21, and whichever writes second silently erases the other's booking.
 * No error, no conflict, just a meeting that is not there any more.
 *
 * So this implements the STORE surface the views actually call, with row-level
 * writes underneath. The views need no changes at all - they never touch
 * storage and every method already returns a Promise, which is the part
 * store.js genuinely did get right.
 * ---------------------------------------------------------------------------
 */
window.DFW = window.DFW || {};

(function () {

  var U = function () { return DFW.util; };

  /* ---- Row mapping --------------------------------------------------------
   *
   * The app speaks _id / start / end / bookedBy; Postgres speaks id /
   * starts_at / ends_at / booked_by. Kept in these two functions and nowhere
   * else, so a column rename is one edit and not a hunt through the views.
   *
   * `during` is never written. It is a generated column - see schema.sql - so
   * the range the exclusion constraint checks is derived from the same two
   * timestamps the app sent, and cannot drift from them.
   */

  function toApp(r) {
    var out = {
      _id: r.id,
      _createdAt: r.created_at,
      title: r.title,
      start: r.starts_at,
      end: r.ends_at,
      bookingType: r.booking_type,
      bookedBy: r.booked_by,
      overrunBuffer: r.overrun_buffer,
      status: r.status
    };
    /* Absent, not empty. The app tests these with `has()` and renders an empty
       string as a visible empty box on the card. */
    if (r.details) out.details = r.details;
    if (r.cancelled_at) out.cancelledAt = r.cancelled_at;
    if (r.series_id) {
      out.seriesId = r.series_id;
      out.seriesIndex = r.series_index;
      out.seriesCount = r.series_count;
    }
    return out;
  }

  function toDb(r) {
    var out = {
      title: r.title,
      starts_at: new Date(U().parseTime(r.start)).toISOString(),
      ends_at: new Date(U().parseTime(r.end)).toISOString(),
      booking_type: r.bookingType || 'Standard',
      booked_by: r.bookedBy,
      overrun_buffer: r.overrunBuffer || 0,
      status: r.status || 'Booked'
    };
    if (r.details) out.details = r.details;
    if (r.seriesId) {
      out.series_id = r.seriesId;
      out.series_index = r.seriesIndex;
      out.series_count = r.seriesCount;
    }
    return out;
  }

  /* ---- Errors -------------------------------------------------------------
   *
   * The single most important function in this file.
   *
   * 23P01 is exclusion_violation - the no-overlap constraint firing. It means
   * somebody else booked that slot between this person opening the form and
   * tapping Book. That is not an error condition to log, it is the one thing
   * the whole feature exists to catch, and it has to come back in the app's
   * own words. A raw "409 Conflict" shown to somebody standing at a door is
   * the same as no message at all.
   *
   * P0002 is raised by hand in cancel_bookings() when an id has vanished.
   */
  var PG = {
    '23P01': 'That time was taken while you were filling this in. Nothing was booked.',
    'P0002': 'Some of those bookings no longer exist. Nothing was changed.',
    '23514': 'That booking is not a shape this board accepts.'   /* check_violation */
  };

  function explain(body, res) {
    var code = body && body.code;
    if (code && PG[code]) return new Error(PG[code]);
    if (body && body.message) return new Error(body.message);
    return new Error('The board did not answer (' + (res ? res.status : '?') + ').');
  }

  /* ---- The store ---------------------------------------------------------- */

  function createSupabaseStore(cfg) {
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error('Supabase store needs { url, anonKey }.');
    }

    var base = String(cfg.url).replace(/\/+$/, '') + '/rest/v1';
    var subs = [];

    function notify() {
      subs.forEach(function (cb) {
        try { cb(); } catch (e) { console.error('subscriber failed', e); }
      });
    }

    function headers(extra) {
      var h = {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Content-Type': 'application/json'
      };
      Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
      return h;
    }

    function call(path, opts) {
      return fetch(base + path, opts).then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
          if (!res.ok) throw explain(body, res);
          return body;
        });
      }, function () {
        /* fetch itself rejected: no network, DNS, CORS. Distinguished from a
           refusal by the server, because the answer is different - one is "try
           again", the other is "that slot is gone". */
        throw new Error('Could not reach the board. Check the connection and try again.');
      });
    }

    var store = {

      /* Nothing to prepare. Kept so the boot sequence in app.js is identical
         whichever store is in use. */
      init: function () { return Promise.resolve(); },

      list: function () {
        return call('/bookings?select=*&order=starts_at.asc', {
          method: 'GET', headers: headers()
        }).then(function (rows) { return (rows || []).map(toApp); });
      },

      get: function (id) {
        return call('/bookings?select=*&id=eq.' + encodeURIComponent(id), {
          method: 'GET', headers: headers()
        }).then(function (rows) { return rows && rows[0] ? toApp(rows[0]) : null; });
      },

      insert: function (row) {
        return store.insertMany([row]).then(function (made) { return made[0]; });
      },

      /* ONE request with an array body. PostgREST runs that as a single
         statement, so the exclusion constraint is evaluated across the whole
         batch and either every occurrence of a weekly series lands or none
         does. That preserves the guarantee flowtest section D asserts, and it
         is why this is not a loop over insert(). */
      insertMany: function (list) {
        if (!list || !list.length) return Promise.resolve([]);
        return call('/bookings', {
          method: 'POST',
          headers: headers({ 'Prefer': 'return=representation' }),
          body: JSON.stringify(list.map(toDb))
        }).then(function (rows) {
          notify();
          return (rows || []).map(toApp);
        });
      },

      update: function (id, patch) {
        return store.updateMany([id], patch).then(function (found) { return found[0]; });
      },

      /* Cancelling is the only update the app performs and the only one RLS
         permits, so this routes through the cancel_bookings function, which is
         all-or-nothing in one transaction. Anything else is refused loudly
         rather than half-applied: a partial write here is what leaves one
         occurrence of a cancelled series looking live. */
      updateMany: function (ids, patch) {
        if (!ids || !ids.length) return Promise.resolve([]);
        if (!patch || patch.status !== 'Cancelled') {
          return Promise.reject(new Error(
            'This board can only cancel a booking, not edit one.'));
        }
        return call('/rpc/cancel_bookings', {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ ids: ids })
        }).then(function (rows) {
          notify();
          return (rows || []).map(toApp);
        });
      },

      /* Deliberately refused rather than implemented. There is no DELETE
         policy on the table, so this would fail at the server anyway; failing
         here says why. A cancelled booking stays on the board struck through
         because it is the only audit trail this app has. */
      remove: function () {
        return Promise.reject(new Error(
          'Bookings are cancelled, never deleted. That is the only record of what happened.'));
      },

      subscribe: function (cb) {
        subs.push(cb);
        return function () {
          var i = subs.indexOf(cb);
          if (i >= 0) subs.splice(i, 1);
        };
      },

      /* The three below exist on the localStorage store and are WRONG against
         a shared board, so they refuse instead of quietly doing something
         destructive to everyone at once. The Data page needs to hide its reset
         and import controls when this store is active - see README step 4. */
      resetToSeed: function () {
        return Promise.reject(new Error(
          'This board is shared. Resetting it to sample data would wipe everyone\'s bookings.'));
      },

      importJSON: function () {
        return Promise.reject(new Error(
          'This board is shared, so there is nothing to import into. Bookings sync on their own now.'));
      },

      /* Export still makes sense - it is a read - and is worth keeping as the
         only way to get a copy of the schedule out. */
      exportJSON: function () {
        return store.list().then(function (rows) {
          return JSON.stringify({
            app: 'MB015 Conference Room Board',
            source: 'supabase',
            exportedAt: new Date().toISOString(),
            rows: rows
          }, null, 2);
        });
      }
    };

    return store;
  }

  DFW.createSupabaseStore = createSupabaseStore;

})();
