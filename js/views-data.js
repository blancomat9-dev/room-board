/* MB015 - Conference Room Board : DATA
 *
 * The honest stopgap. Until there is a shared backend, this is the only way a
 * schedule moves from one device to another, and having it here in the open
 * makes the limitation visible instead of letting people discover it by
 * finding an empty board on a second phone.
 */
window.DFW = window.DFW || {};
DFW.views = DFW.views || {};

(function () {

  var ui = DFW.ui, el = ui.el;

  DFW.views.data = function (mount, rows, ctx) {

    mount.appendChild(el('div', { class: 'viewhead' }, [
      el('div', { class: 'eyebrow' }, [el('span', { class: 'tag', text: DFW.CONFIG.ROOM_NAME })]),
      el('h1', { text: 'Data' })
    ]));

    /* IMPORT AND RESET ARE HIDDEN ON A SHARED BOARD (2026-07-31, README step 4).
     *
     * Both replace the whole schedule. On one phone that is a personal choice
     * about sample data. Against Supabase it would wipe every crew's bookings
     * at once, from a page reachable by anyone who scanned the door.
     *
     * store-supabase.js already REFUSES both, so nothing destructive can get
     * through either way. They are hidden as well because a button that exists
     * and always errors is worse than no button - it reads as a thing that is
     * broken rather than a thing that is deliberately not offered.
     *
     * Export stays in both modes. It is a read, and it is the only way to get a
     * copy of the schedule out. */
    var shared = !!DFW.SHARED;

    mount.appendChild(ui.note(
      shared
        ? 'This board is shared. Every device that opens this page reads and writes the ' +
          'same schedule, so anything changed here changes it for everyone. Importing and ' +
          'resetting are not offered for that reason.'
        : 'This board is stored in THIS browser on THIS device only. Nothing syncs. Another ' +
          'phone scanning the same code sees its own separate schedule, starting from sample ' +
          'data. That is a prototype limitation, not a setting - it needs a shared backend to fix.',
      'warn'));

    var out = el('textarea', {
      class: 'jsonbox', rows: '12', spellcheck: 'false',
      'aria-label': 'Booking data as JSON'
    });

    var tools = [
      el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Copy as JSON',
        onclick: function () {
          ctx.store.exportJSON().then(function (text) {
            out.value = text;
            out.focus();
            out.select();
            DFW.toast(shared
              ? 'Exported. This is a copy - editing it changes nothing.'
              : 'Exported. Copy it and paste it on the other device.');
          }).catch(function (e) { DFW.toast(e.message); });
        }
      })
    ];

    if (!shared) {
      tools.push(el('button', {
        class: 'btn', type: 'button', text: 'Load pasted JSON',
        onclick: function () {
          ctx.store.importJSON(out.value).then(function () {
            DFW.toast('Loaded.');
            location.hash = '#/';
          }).catch(function (e) { DFW.toast(e.message); });
        }
      }));
    }

    mount.appendChild(ui.panel(
      shared ? 'Bookings on this board' : 'Bookings on this device',
      rows.length + ' rows',
      [el('div', { class: 'toolbar' }, tools)]));

    mount.appendChild(ui.panel(null, null, [out]));

    if (!shared) {
      mount.appendChild(ui.panel('Start over', null, [
        ui.note('Replaces everything on this device with the sample bookings. There is no undo.', null),
        el('div', { class: 'toolbar' }, [
          el('button', {
            class: 'btn btn-danger', type: 'button', text: 'Reset to sample data',
            onclick: function () {
              /* A confirm() is a blocking dialog and this app avoids them
                 elsewhere, but destroying a schedule with one tap on a phone in a
                 pocket is worse. */
              if (!window.confirm('Replace all bookings on this device with sample data?')) return;
              ctx.store.resetToSeed().then(function () {
                DFW.toast('Reset to sample data.');
                location.hash = '#/';
              });
            }
          })
        ])
      ]));
    }
  };

})();
