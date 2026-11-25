package lila.i18n

import play.api.i18n.Lang

import scala.jdk.CollectionConverters.*

import lila.core.i18n.{ I18nKey, defaultLang, enUsLang }

class NoSweatLanguagesTest extends munit.FunSuite:
  test("picker contains exactly the ten supported choices, without duplicate locales"):
    assertEquals(NoSweatLanguages.choices.map(_._1).toSet, NoSweatLanguages.codes)
    assertEquals(NoSweatLanguages.choices.size, 10)

  test("regional variants resolve to the supported language and unknown languages do not leak in"):
    for (input, output) <- List(
        "en" -> "en-US",
        "en-GB" -> "en-US",
        "en-US" -> "en-US",
        "en-AU" -> "en-US",
        "pt-PT" -> "pt-BR",
        "de-AT" -> "de-DE",
        "zh-SG" -> "zh-CN"
      )
    do assertEquals(NoSweatLanguages.normalize(Lang.get(input).get).map(_.code), Some(output))
    assertEquals(NoSweatLanguages.normalize(Lang("ar")), None)

  test("traditional Chinese preferences are not silently substituted with Simplified Chinese"):
    for code <- List("zh-TW", "zh-HK", "zh-MO") do
      assertEquals(NoSweatLanguages.normalize(Lang.get(code).get), None)
    assertEquals(NoSweatLanguages.normalize(Lang.get("zh-CN").get).map(_.code), Some("zh-CN"))

  test("English is US English for saved preferences, browser preferences and the final fallback"):
    assertEquals(NoSweatLanguages.pick(Some("en-GB"), Seq(Lang("de", "DE"))), enUsLang)
    assertEquals(NoSweatLanguages.pick(None, Seq(Lang("en", "GB"))), enUsLang)
    assertEquals(NoSweatLanguages.pick(None, Seq.empty), enUsLang)
    assertEquals(NoSweatLanguages.pick(None, Seq(Lang("ar"))), enUsLang)
    assertEquals(NoSweatLanguages.pick(Some("unknown"), Seq(Lang("de", "DE"))), Lang("de", "DE"))
    assertEquals(NoSweatLanguages.choices.find(_._1 == "en-US").map(_._2), Some("English (US)"))

  test("effective US English catalogs catch common British spellings, including source fallback"):
    Registry.syncLoadLanguages()
    val english = Registry.getAll(defaultLang).get.asScala.toMap ++ Registry.getAll(enUsLang).get.asScala
    val british = (
      "(?i)\\b(colours?|coloured|colouring|colourful|analys(e|ed|es|ing|er|able)|" +
        "favour(s|ed|ing|able|ably|ite|ites)?|behaviours?|centres?|centred|centring|defences?|offences?|" +
        "practis(e|es|ed|ing)|cancell(ed|ing)|labell(ed|ing)|" +
        "organis(e|es|ed|ing|ation|ations|er|ers)|customis(e|ed|ing)|" +
        "optimis(e|ed|ing|ation)|recognis(e|es|ed|ing)|authoris(e|ed|ation)|unauthorised|" +
        "normalis(e|ed|ation)|initialis(e|ed|ation)|synchronis(e|ed|ation)|licences?|" +
        "honour(s|ed|ing)?|neighbours?|modell(ed|ing)|grey|chequered|enrol|enrolment|" +
        "programmes?|catalogue|whilst|amongst|learnt|spelt|travell(ed|ing|er|ers)|" +
        "apologis(e|es|ed|ing))\\b"
    ).r
    val failures = english.toList.flatMap: (key, value) =>
      val messages = value match
        case literal: Simple => List(literal.message)
        case literal: Escaped => List(literal.message)
        case plurals: Plurals => plurals.messages.values.toList
      messages.flatMap(british.findAllIn).map(word => s"$key: $word")
    assertEquals(failures.sorted, Nil)

    val expected = Map(
      "muteInsightColor" -> "Color",
      "muteInsightColorPreset" -> "Results by color",
      "localAnalysis:analyse" -> "Analyze",
      "puzzle:puzzleDashboardDescription" -> "Train, analyze, improve",
      "mutePromotionCanceled" -> "Promotion canceled"
    )
    given lila.core.i18n.Translate = Translator.to(enUsLang)
    for (key, text) <- expected do assertEquals(I18nKey.unchecked(key).txt(), text)
