package lila.i18n

import play.api.i18n.Lang
import lila.core.i18n.{ I18nKey, Translate }

class NoSweatArenaLocaleTest extends munit.FunSuite:
  test("all Arena help, host feedback and form errors render in ten native languages"):
    Registry.syncLoadLanguages()
    val keys = List(
      "Prepare",
      "Ready",
      "Draining",
      "Refresh",
      "Unavailable",
      "Help",
      "Settings",
      "PrepareHuman",
      "BotsHelp",
      "HumanOnly",
      "RatingRange",
      "Minimum",
      "Maximum",
      "RatingHelp",
      "Target",
      "TargetHelp",
      "RangeInvalid",
      "Locked",
      "BotNoticeTitle",
      "BotNoticeIntro",
      "BotNoticeFill"
    ).map("muteArena" + _) ++ List(
      "muteMinimumClock",
      "arena:allowBotAccounts",
      "arena:history",
      "arena:arenaTournaments",
      "tournaments",
      "finished",
      "tournamentCalendar",
      "tournamentFAQ",
      "createANewTournament",
      "eventInProgress"
    )
    for code <- NoSweatLanguages.codes.toList.sorted do
      val lang = Lang.get(code).get
      given Translate = Translator.to(lang)
      val catalog = Registry.getAll(lang).get
      for key <- keys do
        if code == "en-US" then
          assert(Registry.translation(lang, I18nKey.unchecked(key)).nonEmpty, s"$code/$key")
        else assert(catalog.containsKey(key), s"$code/$key")
        val rendered = (key match
          case "muteArenaHelp" => I18nKey.unchecked(key)(1400, 1700, 10)
          case "muteArenaBotNoticeIntro" => I18nKey.unchecked(key)(1200, 1700, 10)
          case "muteArenaBotNoticeFill" => I18nKey.unchecked(key)(10)
          case _ => I18nKey.unchecked(key)()
        ).render
        assert(rendered.nonEmpty && !rendered.contains(key), s"$code/$key")
        if code != "en-US" then
          assert(!rendered.startsWith("Arena bots are ready"), code)
          if key == "arena:allowBotAccounts" then assert(rendered != "Allow bot accounts", code)
