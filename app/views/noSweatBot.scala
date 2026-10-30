package views

import play.api.libs.json.*
import lila.app.UiEnv.{ *, given }

object noSweatBot:
  def apply(bot: JsObject)(using Context): Frag =
    val personality = (bot \ "personality").as[JsObject]
    val opening = (bot \ "opening" \ "full_moves").asOpt[Int].getOrElse(0)
    val timing = (personality \ "humanTiming").as[Boolean]
    val history = (personality \ "history").as[Boolean]
    val style = (personality \ "timingStyle").as[String].replace('-', ' ')
    div(cls := "nosweat-bot-policy")(
      h2("Bot settings"),
      table(
        tbody(
          tr(th("Model"), td("Maia3 79M")),
          tr(
            th("Conditioning"),
            td(s"${(bot \ "conditioning_self").as[Int]} / ${(bot \ "conditioning_opponent").as[Int]}")
          ),
          tr(th("Temperature"), td((bot \ "temperature_after_opening").as[Double].toString)),
          tr(th("Top-p"), td((bot \ "top_p_after_opening").as[Double].toString)),
          tr(th("Move history"), td(if history then "On" else "Off")),
          tr(th("Human timing"), td(if timing then "On" else "Off")),
          tr(th("Timing style"), td(style + (if timing then "" else " (inactive)"))),
          (opening > 0).option(tr(th("Opening"), td(s"Full sampling for the first $opening moves")))
        )
      ),
      p(
        "These settings stay fixed across games. Conditioning is a model input, not a measured playing rating."
      ),
      a(href := "https://github.com/Dash1971/mute-chess/blob/main/docs/bot-population.md")(
        "Policy and rating methodology"
      )
    )
