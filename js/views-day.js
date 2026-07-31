/* MB015 - Conference Room Board : DAY
 *
 * Serves two routes with one view:
 *   #/            today, the default landing after a scan
 *   #/day?d=...   any single day, drilled into from WEEK or MONTH
 *
 * The timeline is the point. A list tells you what is booked; the timeline
 * tells you where the GAPS are, drawn to scale, which is the question someone
 * standing at the door actually has. The cards below it exist because you
 * cannot put a release button inside a 26px block on a phone.
 */
window.DFW = window.DFW || {};
DFW.views = DFW.views || {};

(function () {

  var U = DFW.util, ui = DFW.ui, el = ui.el;

  function render(mount, rows, ctx, dayTime) {
    var now = ctx.now;
    var base = U.startOfDay(dayTime);
    var isToday = U.sameDay(base, now);
    /* Built from the FULL board, not from `mine`. Cancelling "this and every
       one after" has to count occurrences on days that are not on screen. */
    var cards = ui.cardCtx(ctx, rows);

    var mine = rows.filter(function (r) { return U.startOfDay(r.start) === base; })
                   .sort(function (a, b) { return U.parseTime(a.start) - U.parseTime(b.start); });

    mount.appendChild(el('div', { class: 'viewhead' }, [
      el('div', { class: 'eyebrow' }, [
        el('span', { class: 'tag', text: DFW.CONFIG.ROOM_NAME }),
        el('span', { text: U.fmtDayLong(base) })
      ]),
      el('h1', { text: isToday ? 'Today' : U.fmtDayShort(base) })
    ]));

    /* The banner asserts what the room is doing RIGHT NOW, so it only belongs
       on a day where "now" is. On any other day it would be a confident lie. */
    if (isToday) mount.appendChild(ui.banner(mine, now));

    mount.appendChild(ui.calendarChrome(isToday ? '' : 'day', base));

    mount.appendChild(el('div', { class: 'daynav noprint' }, [
      el('a', { class: 'btn btn-sm', href: '#/day?d=' + U.fmtDate(U.addDays(base, -1)), text: '‹ Prev' }),
      isToday ? null : el('a', { class: 'btn btn-sm', href: '#/', text: 'Today' }),
      el('a', { class: 'btn btn-sm', href: '#/day?d=' + U.fmtDate(U.addDays(base, 1)), text: 'Next ›' })
    ]));

    mount.appendChild(ui.timeline({ rows: mine, now: now, day: base, hourH: 54 }));

    if (!mine.length) {
      mount.appendChild(ui.empty(isToday ? 'Nothing booked today. The room is yours.'
                                         : 'Nothing booked on this day.'));
      return;
    }

    mount.appendChild(el('div', { class: 'day-head daysel' }, [
      el('span', { class: 'day-name', text: 'Details' }),
      el('span', { class: 'day-count', text: ui.dayCountLabel(mine) })
    ]));

    var list = el('div', { class: 'cardlist' });
    mine.forEach(function (b) {
      var card = ui.bookingCard(b, now, cards);
      /* Arriving from a tapped timeline block, mark which booking it was so
         the eye lands in the right place instead of re-scanning the list. */
      if (ctx.query.focus && ctx.query.focus === b._id) card.classList.add('is-focus');
      list.appendChild(card);
    });
    mount.appendChild(list);
  }

  DFW.views.today = function (mount, rows, ctx) {
    render(mount, rows, ctx, ctx.now);
  };

  DFW.views.day = function (mount, rows, ctx) {
    var t = U.parseTime(ctx.query.d);
    render(mount, rows, ctx, t === null ? ctx.now : t);
  };

})();
