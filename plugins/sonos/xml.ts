// Just enough XML for UPnP answers: the text of a named element, an attribute of a tag, and escaping. Sonos answers are flat and known,
// so a search by name is enough (docs/reports/sonos-upnp-api.md).

/** The text inside the first <name ...>...</name> after `from`, unescaped once; '' when absent. */
export function tag(xml: string, name: string, from: i32 = 0): string {
  let i = xml.indexOf('<' + name, from);
  while (i >= 0) {
    const c = xml.charAt(i + name.length + 1);
    if (c === '>' || c === ' ' || c === '/') break;   // not a longer name that starts the same
    i = xml.indexOf('<' + name, i + 1);
  }
  if (i < 0) return '';
  const open = xml.indexOf('>', i);
  if (open < 0 || xml.charAt(open - 1) === '/') return '';
  const close = xml.indexOf('</' + name + '>', open);
  return close < 0 ? '' : unescape(xml.slice(open + 1, close));
}

/** The value of attribute `name` in the tag text `t` ('<ZoneGroupMember UUID="..." ...'), unescaped; '' when absent. */
export function attr(t: string, name: string): string {
  const s = ' ' + t;   // the first attribute may have no space before it
  const i = s.indexOf(' ' + name + '="');
  if (i < 0) return '';
  const a = i + name.length + 3;
  return unescape(s.slice(a, s.indexOf('"', a)));
}

export function unescape(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.split('&lt;').join('<').split('&gt;').join('>').split('&quot;').join('"').split('&apos;').join("'").split('&amp;').join('&');
}

export function escape(s: string): string {
  return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}
