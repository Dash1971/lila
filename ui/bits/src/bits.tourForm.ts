import flatpickr from 'flatpickr';

import { use24h } from 'lib/i18n';

site.load.then(() => {
  const $variant = $('#form3-variant');
  const showPosition = () =>
    $('.form3 .position').toggleClass('none', !['1', 'standard'].includes($variant.val() as string));

  $variant.on('change', showPosition);
  showPosition();

  $('[data-maia-arena-settings]').each(function () {
    const $settings = $(this);
    const $bots = $settings.find('input[type="checkbox"]');
    const updateBots = () => {
      const enabled = $bots.prop('checked');
      $settings.find('.maia-arena-fields, .maia-arena-enabled').toggleClass('none', !enabled);
      $settings.find('.maia-arena-human-only').toggleClass('none', enabled);
      // Retain values when toggling, but omit hidden bot-only settings for human-only events.
      $settings.find('.maia-arena-fields input').prop('required', enabled).prop('disabled', !enabled);
    };
    $bots.on('change', updateBots);
    updateBots();
  });

  $('.flatpickr').each(function (this: HTMLInputElement) {
    flatpickr(this, {
      minDate: 'today',
      maxDate: new Date(Date.now() + 1000 * 3600 * 24 * 31 * 6),
      dateFormat: 'Z',
      altInput: true,
      altFormat: 'Y-m-d h:i K',
      monthSelectorType: 'static',
      disableMobile: true,
      time_24hr: use24h(),
    });
  });
});
