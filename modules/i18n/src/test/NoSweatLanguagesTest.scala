package lila.i18n

import play.api.i18n.Lang

class NoSweatLanguagesTest extends munit.FunSuite:
  test("picker contains exactly the ten supported choices, without duplicate locales"):
    assertEquals(NoSweatLanguages.choices.map(_._1).toSet, NoSweatLanguages.codes)
    assertEquals(NoSweatLanguages.choices.size, 10)

  test("regional variants resolve to the supported language and unknown languages do not leak in"):
    for (input, output) <- List(
        "en-US" -> "en-GB",
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
