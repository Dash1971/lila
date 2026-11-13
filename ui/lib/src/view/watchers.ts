import { get, set } from '@/data';
import { licon } from '@/licon';
import { pubsub } from '@/pubsub';
import { json, url } from '@/xhr';

import { profileUrl } from './userLink';

export interface Data {
  nb: number;
  users?: string[];
  watchers?: Data;
}

let watchersData: Data | undefined;

const name = (u: string) => (u.includes(' ') ? u.split(' ')[1] : u);

export function watcherLink(user: string, displayName?: string): HTMLAnchorElement {
  const canonical = name(user);
  const link = document.createElement('a');
  link.className = 'user-link ulpt';
  link.href = profileUrl(canonical);
  const title = user.includes(' ') ? user.slice(0, user.indexOf(' ') + 1) : '';
  link.textContent = title + (displayName || canonical);
  return link;
}

export function watchers(element: HTMLElement, withUserList = true): void {
  if (element.dataset.watched) return;
  element.dataset.watched = '1';
  const $innerElement = $('<div class="chat__members__inner">').appendTo(element);
  const $numberEl = $(
    `<div class="chat__members__number" data-icon="${licon.User}" title="Spectators"></div>`,
  ).appendTo($innerElement);
  const $listEl = $('<div>').appendTo($innerElement);
  const listEl = $listEl[0] as HTMLElement;

  pubsub.on('socket.in.crowd', data => setWatchers(data.watchers || data));

  const setWatchers = (data: Data): void => {
    watchersData = data;

    if (!data.nb && data.users) data.nb = data.users.length;

    if (!data.nb) {
      element.classList.add('none');
      return;
    }

    $numberEl.text(withUserList ? String(data.nb) : i18n.broadcast.nbViewers(data.nb));

    if (data.users && withUserList) {
      const currUsers = data.users.map(u => u || '').join(';');
      if (get(listEl, 'prevUsers') !== currUsers) {
        set(listEl, 'prevUsers', currUsers);
        const render = (displayNames: Map<string, string> = new Map()) => {
          // A lookup for an older crowd must not overwrite the current spectator list.
          if (get(listEl, 'prevUsers') !== currUsers) return;
          listEl.replaceChildren();
          data.users!.forEach((user, index) => {
            if (index) listEl.append(', ');
            if (!user) listEl.append(i18n.site.anonymous);
            else {
              listEl.append(watcherLink(user, displayNames.get(name(user).toLowerCase())));
            }
          });
        };
        render();
        if (document.documentElement.dataset.brand === 'mutechess') {
          const ids = [...new Set(data.users.filter(Boolean).map(user => name(user).toLowerCase()))].slice(
            0,
            100,
          );
          if (ids.length)
            json<LightUser[]>(url('/api/users/status', { ids: ids.join(',') }))
              .then(users => render(new Map(users.map(user => [user.id, user.displayName || user.name]))))
              .catch(() => {}); // Keep canonical labels when the optional name lookup is unavailable.
        }
      }
    } else $listEl.html('');

    element.classList.remove('none');
  };

  if (watchersData) setWatchers(watchersData);
}
