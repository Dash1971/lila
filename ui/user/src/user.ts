import { myUserId } from 'lib';
import { licon } from 'lib/licon';
import { muteText } from 'lib/nosweat/i18n';
import { pubsub } from 'lib/pubsub';
import { alert, domDialog, makeLinkPopups } from 'lib/view';
import * as xhr from 'lib/xhr';

const gamesAngle = document.querySelector<HTMLElement>('.games');
if (gamesAngle) gamesAngle.style.visibility = 'hidden'; // FOUC

export async function initModule(): Promise<void> {
  makeLinkPopups($('.social_links'));
  makeLinkPopups($('.user-infos .bio'));

  document.querySelectorAll<HTMLButtonElement>('[data-nostr-help]').forEach(button => {
    button.addEventListener('click', () => {
      const content = document.getElementById(button.dataset.nostrHelp!);
      if (!content) return;
      void domDialog({
        closeButton: true,
        htmlText: content.innerHTML,
        class: 'nostr-identity-help',
        attrs: { dialog: { 'aria-label': button.getAttribute('aria-label')! } },
        modal: true,
        show: true,
        onClose: () => button.focus(),
      });
    });
  });

  const npubLink = document.querySelector<HTMLAnchorElement>('.user-show__nostr-link');
  const npubFeedback = document.querySelector<HTMLElement>('.user-show__nostr-feedback');
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  if (npubLink)
    npubLink.addEventListener('click', e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigator.clipboard.writeText(npubLink.innerText.trim()).then(
        () => {
          npubLink.title = muteText('CopiedNpub', 'Copied npub');
          if (npubFeedback) npubFeedback.textContent = muteText('Copied', 'Copied');
          clearTimeout(copiedTimer);
          copiedTimer = setTimeout(() => {
            npubLink.title = muteText('CopyNpub', 'Copy public npub');
            if (npubFeedback) npubFeedback.textContent = '';
          }, 900);
        },
        () =>
          alert(
            muteText('CopyNpubFailed', 'Could not copy the npub. You can select and copy the text instead.'),
          ),
      );
    });

  const profileLink = document.querySelector<HTMLAnchorElement>('.user-show__profile-link');
  const profileFeedback = document.querySelector<HTMLElement>('.user-show__profile-feedback');
  let profileCopiedTimer: ReturnType<typeof setTimeout> | undefined;
  if (profileLink)
    profileLink.addEventListener('click', e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigator.clipboard.writeText(profileLink.href).then(
        () => {
          profileLink.title = muteText('CopiedProfileLink', 'Profile link copied');
          if (profileFeedback) profileFeedback.textContent = muteText('Copied', 'Copied');
          clearTimeout(profileCopiedTimer);
          profileCopiedTimer = setTimeout(() => {
            profileLink.title = muteText('CopyProfileLink', 'Copy permanent profile link');
            if (profileFeedback) profileFeedback.textContent = '';
          }, 900);
        },
        () =>
          alert(
            muteText(
              'CopyProfileLinkFailed',
              'Could not copy the link. Use your browser’s Copy link action.',
            ),
          ),
      );
    });

  tmpRandomTutorLink();
  updatePackedTrophies();
  window.addEventListener('resize', updatePackedTrophies);

  const loadNoteZone = () => {
    const $zone = $('.user-show .note-zone');
    $zone.find('textarea')[0]?.focus();
    if ($zone.hasClass('loaded')) return;
    $zone.addClass('loaded');
    $noteToggle.find('strong').text(String($zone.find('.note').length));
    $zone.find('.note-form button[type=submit]').on('click', function (this: HTMLButtonElement) {
      $(this)
        .parents('form')
        .each((_, form: HTMLFormElement) =>
          xhr
            .formToXhr(form, this)
            .then(html => $zone.replaceWith(html))
            .then(() => loadNoteZone())
            .catch(() => alert('Invalid note, is it too short or too long?')),
        );
      return false;
    });
  };

  const $noteToggle = $('.user-show .note-zone-toggle').on('click', () => {
    $('.user-show .note-zone').toggle();
    loadNoteZone();
  });
  if (location.search.includes('note')) $noteToggle.trigger('click');

  $('.user-show .claim_title_zone').each(function (this: HTMLElement) {
    const $zone = $(this);
    $zone.find('.actions a').on('click', function (this: HTMLAnchorElement) {
      xhr.text(this.href, { method: 'post' });
      $zone.remove();
      return false;
    });
  });

  $('.user-show .angles').each(function (this: HTMLElement) {
    const $angles = $(this);
    const $content = $('.angle-content');
    const browseTo = (path: string) =>
      xhr.text(path).then(html => {
        $content.html(html);
        pubsub.emit('content-loaded', $content[0]);
        history.replaceState({}, '', path);
        site.asset.loadEsm('bits.infiniteScroll');
      });
    $angles.on('click', 'a', function (this: HTMLAnchorElement) {
      if ($('#games .to-search').hasClass('active')) return true;
      $angles.find('.active').removeClass('active');
      $(this).addClass('active');
      browseTo(this.href);
      return false;
    });
    $('.user-show').on('click', '#games a', function (this: HTMLAnchorElement) {
      if ($('#games .to-search').hasClass('active') || $(this).hasClass('to-search')) return true;
      $(this).addClass('active');
      browseTo(this.href);
      return false;
    });
  });
  setTimeout(() => {
    if (gamesAngle) gamesAngle.style.visibility = 'visible'; // FOUC
  });
}

function tmpRandomTutorLink() {
  const me = myUserId();
  const userId = $('main.page-menu').data('username').toLowerCase();
  if (!me || !userId || me !== userId) return;
  const getNbGames = (icon: string) => {
    const text = $(`.sub-ratings a[data-icon=${icon}] rating span:last-child`).text();
    return Number.parseInt(text.replaceAll(/\D/g, ''));
  };
  const enoughGames = [licon.Bullet, licon.FlameBlitz, licon.Rabbit, licon.Turtle].some(
    icon => getNbGames(icon) > 100,
  );
  if (!enoughGames) return;
  const buttonHtml = `
  <a href="/tutor" class="tutor-link">
    <img src="${site.asset.flairSrc('nature.octopus-howard')}" />
    <span><strong>Try out Tutor</strong><em>Compare to your peers!</em></span>
  </a>`;
  $(buttonHtml).insertBefore('.profile-side .insight');
}

function updatePackedTrophies() {
  const header = document.querySelector<HTMLElement>('.user-show__header');
  const trophies = header?.querySelector<HTMLElement>('.trophies');
  const title = header?.querySelector<HTMLElement>('h1');
  if (!trophies || !title) return;
  trophies.classList.remove('packed');
  // see if there's an overflow (or close to one) without 'packed':
  if (trophies.getBoundingClientRect().left < title.getBoundingClientRect().right + 8)
    trophies.classList.add('packed');
}
