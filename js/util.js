/* MB015 - Conference Room Board : primitives
 *
 * Time handling, lifted from MB016's derive.js. Everything downstream works in
 * epoch milliseconds, because that is what the state machine compares and it
 * is the only representation with no timezone opinion baked in.
 */
window.DFW = window.DFW || {};

(function () {

  function id(v) { return String(v == null ? '' : v).trim(); }

  function has(v) { return id(v) !== ''; }

  /* A bare YYYY-MM-DD is parsed by JS as UTC midnight, which reads back as the
     PREVIOUS day anywhere behind UTC. This room is on Central time, so left
     alone every typed date lands a day early and a booking made this morning
     sorts before yesterday's. Date-only values are therefore built as LOCAL
     midnight; anything carrying a time keeps its own zone.

     This is the bug MB016 shipped, fixed, and then re-broke by making the fix
     reject numeric timestamps. Both paths are covered here and both are
     tested. */
  var DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

  function parseTime(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) {
      var dt = v.getTime();
      return isNaN(dt) ? null : dt;
    }
    var s = id(v);
    if (!s) return null;
    var m = DATE_ONLY.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    var t = new Date(s).getTime();
    return isNaN(t) ? null : t;
  }

  /* ---- Day arithmetic ---------------------------------------------------- */

  function startOfDay(v) {
    var t = parseTime(v);
    if (t === null) return null;
    var d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function addDays(v, n) {
    var t = parseTime(v);
    if (t === null) return null;
    /* Adding 86400000ms is wrong across a DST boundary: the US spring-forward
       day is 23 hours long, so a week view built on fixed millisecond steps
       silently skips or repeats a day twice a year. Going through the date
       parts keeps every step a real calendar day. */
    var d = new Date(t);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  function sameDay(a, b) {
    var da = startOfDay(a), db = startOfDay(b);
    return da !== null && da === db;
  }

  /* ---- Display ----------------------------------------------------------- */

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* "2 PM" and "2:30 PM". The SharePoint board got here by string-replacing
     ':00 ' out of toLocaleTimeString, which breaks on any locale that formats
     differently. Building it directly is shorter and cannot surprise us. */
  function fmtClock(v) {
    var t = parseTime(v);
    if (t === null) return '';
    var d = new Date(t);
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return m === 0 ? (h12 + ' ' + ampm) : (h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm);
  }

  function fmtRange(start, end) {
    return fmtClock(start) + ' to ' + fmtClock(end);
  }

  function fmtDayLong(v) {
    var t = parseTime(v);
    if (t === null) return '';
    var d = new Date(t);
    return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  function fmtDayShort(v) {
    var t = parseTime(v);
    if (t === null) return '';
    var d = new Date(t);
    return DAYS[d.getDay()].slice(0, 3) + ' ' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  function fmtDate(v) {
    var t = parseTime(v);
    if (t === null) return '';
    var d = new Date(t);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function fmtMins(mins) {
    if (mins == null || isNaN(mins) || mins < 0) return '';
    var h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
  }

  /* Spoken-aloud duration, for the chips people actually tap. "1 hr 30 min",
     not "1h 30m" and not "90 min" - the person choosing a length thinks in
     hours once they pass one, and the chip is the widest text in the row. */
  function fmtDur(mins) {
    var n = Math.round(Number(mins));
    if (!isFinite(n) || n <= 0) return '';
    var h = Math.floor(n / 60), m = n % 60;
    if (h === 0) return m + ' min';
    if (m === 0) return h + ' hr';
    return h + ' hr ' + m;
  }

  /* ---- <input type="datetime-local"> ------------------------------------- */
  /*
   * The control speaks "YYYY-MM-DDTHH:MM" in LOCAL time, with no zone suffix.
   * toISOString() would hand back UTC and shift every value by the offset, so
   * it is built from the local parts instead.
   */
  function toInputValue(v) {
    var t = parseTime(v);
    if (t === null) return '';
    var d = new Date(t);
    return fmtDate(t) + 'T' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  /* ---- The 15-minute grid ------------------------------------------------ */
  /*
   * Everything the booking form offers is snapped to CONFIG.SLOT_MINS. These
   * two are the only places that knowledge lives, so widening the grain to 30
   * is one constant and not a hunt through three views.
   *
   * Built from date PARTS, like addDays, rather than by millisecond
   * arithmetic. Rounding across a DST boundary with modulo on epoch ms lands
   * an hour off, which shows up twice a year as a form that opens offering a
   * start time in the past.
   */
  function slotMs() {
    var m = DFW.CONFIG && DFW.CONFIG.SLOT_MINS;
    return (isFinite(m) && m > 0 ? m : 15) * 60000;
  }

  function floorToSlot(v) {
    var t = parseTime(v == null ? Date.now() : v);
    if (t === null) return null;
    var step = slotMs() / 60000;
    var d = new Date(t);
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(d.getMinutes() / step) * step);
    return d.getTime();
  }

  /* Round UP to the next slot, so a form opened at 8:07 offers 8:15 and never
     a start time that has already gone by. Exactly on a slot boundary it moves
     on to the next one: offering "right now" as a start reads as available and
     is already stale by the time anyone taps it. */
  function nextSlot(v) {
    var t = parseTime(v == null ? Date.now() : v);
    if (t === null) return null;
    /* floorToSlot never returns a time after t, so the next slot is always one
       step on - including when t sits exactly on a boundary, which is the case
       that has to move forward rather than return t itself. */
    return floorToSlot(t) + slotMs();
  }

  /* Kept under its old name because selftest.html and any bookmarked console
     snippet still call it. SLOT_MINS is 15, so the two agree today; if the
     grain is ever widened this one keeps meaning quarter hours. */
  function nextQuarterHour(v) {
    var t = parseTime(v == null ? Date.now() : v);
    if (t === null) return null;
    var d = new Date(t);
    d.setSeconds(0, 0);
    var m = d.getMinutes();
    var add = (15 - (m % 15)) % 15;
    if (add === 0) add = 15;
    d.setMinutes(m + add);
    return d.getTime();
  }

  /* Same local clock time, n weeks on. Goes through setDate for the same
     reason addDays does: a fixed 7 * 86400000 crosses a DST boundary wrong,
     so a 7 AM weekly meeting quietly becomes a 6 AM one in November. */
  function addWeeks(v, n) {
    return addDays(v, n * 7);
  }

  DFW.util = {
    id: id,
    has: has,
    parseTime: parseTime,
    startOfDay: startOfDay,
    addDays: addDays,
    addWeeks: addWeeks,
    sameDay: sameDay,
    fmtClock: fmtClock,
    fmtRange: fmtRange,
    fmtDayLong: fmtDayLong,
    fmtDayShort: fmtDayShort,
    fmtDate: fmtDate,
    fmtMins: fmtMins,
    fmtDur: fmtDur,
    toInputValue: toInputValue,
    floorToSlot: floorToSlot,
    nextSlot: nextSlot,
    nextQuarterHour: nextQuarterHour,
    DAYS: DAYS,
    MONTHS: MONTHS
  };

})();
