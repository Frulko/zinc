'use strict';
const invitation = /^#([a-z0-9][a-z0-9-]{0,62})\/([A-Za-z0-9_-]+)$/.exec(location.hash);
if (invitation) {
    document.getElementById('room').textContent = 'Room ' + invitation[1];
    const browser = document.getElementById('browser');
    browser.href = '/group/' + invitation[1] + '/?token=' + encodeURIComponent(invitation[2]);
    browser.hidden = false;
} else {
    document.getElementById('room').textContent = 'This invitation is incomplete. Ask the host for a new link.';
}
