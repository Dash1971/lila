package lila.i18n

import play.api.i18n.Lang
import play.api.libs.json.*

import lila.core.i18n.{ I18nKey, Translate }
import lila.insight.NoSweatInsights

class NoSweatInsightsLocaleTest extends munit.FunSuite:
  test("focused Insights and the unsupported notice render through all ten native catalogs"):
    Registry.syncLoadLanguages()
    for code <- List("en-GB", "de-DE", "es-ES", "fr-FR", "hi-IN", "ja-JP", "ko-KR", "pt-BR", "ru-RU", "zh-CN")
    do
      val lang = Lang.get(code).get
      given Translate = Translator.to(lang)
      val catalog = Registry.getAll(lang).get
      for key <- NoSweatInsights.clientKeys do assert(catalog.containsKey(s"muteInsight$key"), s"$code/$key")
      assert(catalog.containsKey("muteNotYetSupported"), code)
      val notice = I18nKey.unchecked("muteNotYetSupported")().render
      assert(notice.nonEmpty && !notice.contains("muteNotYetSupported"), code)
      if code != "en-GB" then assert(!notice.contains("This functionality"), code)
      val ui = NoSweatInsights.ui(new lila.insight.JsonView().ui(Nil, Nil, asMod = false))
      val metrics = (ui \ "metricCategs").as[List[JsObject]].flatMap(c => (c \ "items").as[List[JsObject]])
      assertEquals(metrics.map(m => (m \ "key").as[String]).toSet, NoSweatInsights.metrics)
      val result = metrics.find(m => (m \ "key").as[String] == "result").get
      assertEquals((result \ "name").as[String], NoSweatInsights.text("Result"))
      assert(!NoSweatInsights.clientText.toString.contains("muteInsight"), code)
      assert(I18nKey.unchecked("muteInsightSummary").txt("42").contains("42"), code)
