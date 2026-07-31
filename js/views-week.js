/* MB015 - Conference Room Board : WEEK
 *
 * Seven columns of miniature timeline, side by side. One glance answers "when
 * is this room ever free this week", which a stacked list of cards could not:
 * a list shows what exists, a grid shows the shape of the week.
 *
 * The blocks carry NO TEXT, and that is what makes seven columns work at
 * 390px. Each column is about 45px, which cannot hold a meeting title but can
 * absolutely hold a coloured bar in the right place at the right size.
 * Position and height do the talking. Same trade as the dots in MONTH.
 *
 * Tapping a column opens that day in DAY, where there is room for words.
 *
 * The week starts TODAY, not Monday. Someone scanning a door cares about the
 * next seven days, not about which ones happen to precede them.
 */
window.DFW = window.DFW || {};
DFW.views = DFW.views || {};

(function () {

  var U = DFW.util, ui = DFW.ui, el = ui.el;

  DFW.views.week = function (mount, rows, ctx) {
    var now = ctx.now;

    mount.appendChild(el('div', { class: 'viewhead' }, [
      el('div', { class: 'eyebrow' }, [
        el('span', { class: 'tag', text: DFW.CONFIG.ROOM_NAME }),
        el('span', { text: 'Next 7 days' })
      ]),
      el('h1', { text: 'The week' })
    ]));

    mount.appendChild(ui.calendarChrome('week'));

    /* One hour window for the whole grid, taken as the union across all seven
       days. Computed BEFORE any column is drawn, because a column cannot know
       what the others need. */
    var lo = 24, hi = 0;
    for (var d0 = 0; d0 < 7; d0++) {
      var b0 = U.startOfDay(U.addDays(now, d0));
      var r0 = ui.hourRange(rows.filter(function (r) { return U.startOfDay(r.start) === b0; }), b0);
      lo = Math.min(lo, r0.lo);
      hi = Math.max(hi, r0.hi);
    }

    var grid = el('div', { class: 'weekgrid' });

    for (var i = 0; i < 7; i++) {
      var base = U.startOfDay(U.addDays(now, i));
      var d = new Date(base);
      var dayRows = rows.filter(function (r) { return U.startOfDay(r.start) === base; });
      var isToday = (i === 0);

      var col = el('a', {
        class: 'wg-col' + (isToday ? ' is-today' : ''),
        href: '#/day?d=' + U.fmtDate(base),
        'aria-label': U.fmtDayLong(base) + ', ' + ui.dayCountLabel(dayRows)
      });

      col.appendChild(el('span', { class: 'wg-dow', text: U.DAYS[d.getDay()].slice(0, 3) }));
      col.appendChild(el('span', { class: 'wg-num', text: String(d.getDate()) }));

      /* Every column shares one hour scale, so a block in Tuesday sits at the
         same height as the same hour in Friday. Without that the columns would
         each be individually sensible and collectively meaningless. */
      col.appendChild(ui.timeline({
        rows: dayRows, now: now, day: base, hourH: 26, compact: true, lo: lo, hi: hi
      }));

      col.appendChild(el('span', { class: 'wg-count', text: ui.dayCountLabel(dayRows) }));

      grid.appendChild(col);
    }

    mount.appendChild(grid);
    mount.appendChild(ui.note('Tap any day to see the details and book it.', null));
  };

})();
