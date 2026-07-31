/* MB015 - Conference Room Board : MONTH
 *
 * A seven-column grid, which is exactly the shape WEEK refuses to use.
 *
 * That is not a contradiction. At 390px each cell is about 50px, which cannot
 * hold a meeting title but is more than enough for a date and a row of dots.
 * WEEK answers "what is on Thursday"; MONTH answers "which days are busy at
 * all". Density needs no text, so the grid works here and does not there.
 *
 * Tapping a day opens it underneath rather than navigating away, so the person
 * keeps their place in the month while they read it.
 */
window.DFW = window.DFW || {};
DFW.views = DFW.views || {};

(function () {

  var U = DFW.util, ui = DFW.ui, el = ui.el;

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  /* "YYYY-MM" is not a format new Date() handles the way anyone expects: it is
     parsed as UTC, so it lands on the previous month anywhere behind UTC. Built
     from parts instead, same reasoning as the date-only fix in util.js. */
  function parseMonth(s, fallback) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
    if (!m) return fallback;
    return new Date(+m[1], +m[2] - 1, 1).getTime();
  }

  function monthKey(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function addMonths(t, n) {
    var d = new Date(t);
    /* Anchored on the 1st, so this cannot land on the 31st of a 30-day month
       and silently roll into the next one. */
    return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
  }

  /* holdsRoom lives in ui.js so the dots here and the day counts in WEEK cannot
     disagree - they did, and a cell showed six dots under the words "8
     bookings" on the same screen. */
  var holdsRoom = DFW.ui.holdsRoom;

  DFW.views.month = function (mount, rows, ctx) {
    var now = ctx.now;
    var shown = parseMonth(ctx.query.m, new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime());
    var shownDate = new Date(shown);
    var cards = ui.cardCtx(ctx, rows);

    /* Index bookings by local day so each cell is a lookup, not a scan. */
    var byDay = {};
    rows.forEach(function (r) {
      var k = U.fmtDate(r.start);
      if (!k) return;
      (byDay[k] = byDay[k] || []).push(r);
    });

    mount.appendChild(el('div', { class: 'viewhead' }, [
      el('div', { class: 'eyebrow' }, [
        el('span', { class: 'tag', text: DFW.CONFIG.ROOM_NAME }),
        el('span', { text: 'Month at a glance' })
      ]),
      el('h1', { text: MONTH_NAMES[shownDate.getMonth()] + ' ' + shownDate.getFullYear() })
    ]));

    mount.appendChild(ui.calendarChrome('month'));

    /* ---- Month stepper --------------------------------------------------- */

    mount.appendChild(el('div', { class: 'monthnav noprint' }, [
      el('a', {
        class: 'btn btn-sm', href: '#/month?m=' + monthKey(addMonths(shown, -1)),
        text: '‹ ' + MONTH_NAMES[new Date(addMonths(shown, -1)).getMonth()].slice(0, 3)
      }),
      el('a', { class: 'btn btn-sm', href: '#/month', text: 'This month' }),
      el('a', {
        class: 'btn btn-sm', href: '#/month?m=' + monthKey(addMonths(shown, 1)),
        text: MONTH_NAMES[new Date(addMonths(shown, 1)).getMonth()].slice(0, 3) + ' ›'
      })
    ]));

    /* ---- The grid -------------------------------------------------------- */

    var grid = el('div', { class: 'monthgrid', role: 'grid', 'aria-label': 'Month calendar' });

    DOW.forEach(function (d, i) {
      grid.appendChild(el('div', {
        class: 'mg-dow', 'aria-hidden': 'true', text: d,
        title: U.DAYS[i]
      }));
    });

    /* Start on the Sunday on or before the 1st, and run whole weeks until the
       month is covered. Not a fixed 42 cells: a 28-day February starting on a
       Sunday would otherwise render two blank trailing rows. */
    var first = new Date(shownDate.getFullYear(), shownDate.getMonth(), 1);
    var gridStart = U.addDays(first.getTime(), -first.getDay());
    var lastDay = new Date(shownDate.getFullYear(), shownDate.getMonth() + 1, 0);
    var gridEnd = U.addDays(lastDay.getTime(), 6 - lastDay.getDay());
    var cells = Math.round((U.startOfDay(gridEnd) - U.startOfDay(gridStart)) / 86400000) + 1;

    var todayKey = U.fmtDate(now);
    var selectedKey = ctx.query.d || (monthKey(shown) === monthKey(now) ? todayKey : null);

    for (var i = 0; i < cells; i++) {
      var t = U.addDays(gridStart, i);
      var d = new Date(t);
      var k = U.fmtDate(t);
      var inMonth = d.getMonth() === shownDate.getMonth();
      var dayRows = (byDay[k] || []).filter(holdsRoom);

      var cls = 'mg-day';
      if (!inMonth) cls += ' is-out';
      if (k === todayKey) cls += ' is-today';
      if (k === selectedKey) cls += ' is-sel';

      var cell = el('a', {
        class: cls,
        href: '#/month?m=' + monthKey(shown) + '&d=' + k,
        'aria-label': U.fmtDayLong(t) + ', ' +
          (dayRows.length ? dayRows.length + ' booking' + (dayRows.length === 1 ? '' : 's') : 'nothing booked')
      });

      cell.appendChild(el('span', { class: 'mg-num', text: String(d.getDate()) }));

      var dots = el('span', { class: 'mg-dots', 'aria-hidden': 'true' });
      dayRows.slice(0, 4).forEach(function (r) {
        /* data-state, not an inline colour: the dot has to repaint with the
           rest of the board when the theme flips. */
        dots.appendChild(el('span', { class: 'mg-dot', 'data-state': DFW.state(r, now).key }));
      });
      cell.appendChild(dots);

      if (dayRows.length > 4) {
        cell.appendChild(el('span', { class: 'mg-more', 'aria-hidden': 'true', text: '+' + (dayRows.length - 4) }));
      }

      grid.appendChild(cell);
    }

    mount.appendChild(grid);

    /* ---- The opened day --------------------------------------------------- */

    if (!selectedKey) {
      mount.appendChild(ui.note('Tap any day to see what is booked on it.', null));
      return;
    }

    var selRows = (byDay[selectedKey] || []).slice().sort(function (a, b) {
      return U.parseTime(a.start) - U.parseTime(b.start);
    });
    var selTime = U.parseTime(selectedKey);

    mount.appendChild(el('div', { class: 'day-head daysel' }, [
      el('span', { class: 'day-name', text: selectedKey === todayKey ? 'Today' : U.fmtDayLong(selTime) }),
      el('span', { class: 'day-count', text: ui.dayCountLabel(selRows) })
    ]));

    /* Opened inline rather than navigated to, so the month stays on screen and
       the person keeps their place while comparing days. The link out exists
       for when they have chosen one and want the full day. */
    mount.appendChild(el('div', { class: 'toolbar noprint' }, [
      el('a', {
        class: 'btn btn-sm',
        href: selectedKey === todayKey ? '#/' : '#/day?d=' + selectedKey,
        text: 'Open this day ›'
      })
    ]));

    if (!selRows.length) {
      mount.appendChild(ui.empty('Nothing booked on this day.'));
      return;
    }

    mount.appendChild(ui.timeline({ rows: selRows, now: now, day: selTime, hourH: 44 }));

    var list = el('div', { class: 'cardlist' });
    selRows.forEach(function (b) {
      list.appendChild(ui.bookingCard(b, now, cards));
    });
    mount.appendChild(list);
  };

})();
