package lila.i18n

import play.api.i18n.Lang
import play.api.mvc.RequestHeader
import scalalib.model.LangTag

/** Mobile Maia's ten supported languages, with native preference/session storage. */
object NoSweatLanguages:
  val codes = Set("en-US", "de-DE", "fr-FR", "ru-RU", "pt-BR", "hi-IN", "ja-JP", "zh-CN", "ko-KR", "es-ES")
  private val byLanguage = codes.toList.flatMap(Lang.get).map(l => l.language -> l).toMap
  val choices = LangList.allChoices.filter((code, _) => codes(code))

  def normalize(lang: Lang): Option[Lang] =
    val traditional = lang.language == "zh" &&
      (Set("TW", "HK", "MO")(lang.country) || lang.code.toLowerCase.contains("hant"))
    Option.unless(traditional)(byLanguage.get(lang.language)).flatten

  def pick(req: RequestHeader, user: Option[LangTag]): Lang =
    pick(LangTag.raw(user).orElse(req.session.get("lang")), lila.core.i18n.playAcceptLanguages(req))

  private[i18n] def pick(preferred: Option[String], accepted: => Seq[Lang]): Lang =
    preferred
      .flatMap(Lang.get)
      .flatMap(normalize)
      .orElse(accepted.collectFirstSome(normalize))
      .getOrElse(lila.core.i18n.enUsLang)
