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
    for code <- List("en-GB", "de-DE", "es-ES", "fr-FR", "hi-IN", "ja-JP", "ko-KR", "pt-BR", "ru-RU", "zh-CN")
    do
      val lang = Lang.get(code).get
      given Translate = Translator.to(lang)
      val catalog = Registry.getAll(lang).get
      for key <- keys do
        assert(catalog.containsKey(key), s"$code/$key")
        val rendered = (key match
          case "muteArenaHelp" => I18nKey(key)(1400, 1700, 10)
          case "muteArenaBotNoticeFill" => I18nKey(key)(10, 10)
          case _ => I18nKey(key)()
        ).render
        assert(rendered.nonEmpty && !rendered.contains(key), s"$code/$key")
        if code != "en-GB" then
          assert(!rendered.startsWith("Arena bots are ready"), code)
          if key == "arena:allowBotAccounts" then assert(rendered != "Allow bot accounts", code)
