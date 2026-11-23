package views

import lila.core.i18n.I18nKey

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
      h2(I18nKey.unchecked("muteBotSettings").txt()),
      table(
        tbody(
          tr(th("Model"), td("Maia3 79M")),
          (bot \ "rating_assignment")
            .asOpt[JsObject]
            .map: _ =>
              tr(th("Rating basis"), td("Research-seeded")),
          tr(
            th("Maia rating input"),
            td((bot \ "conditioning_self").as[Int].toString)
          ),
          tr(th("Opponent rating input"), td("Your rating for this time control (600–2600)")),
          tr(th("Temperature"), td((bot \ "temperature_after_opening").as[Double].toString)),
          tr(th("Top-p"), td((bot \ "top_p_after_opening").as[Double].toString)),
          tr(
            th(I18nKey.unchecked("muteMoveHistory").txt()),
            td(if history then I18nKey.unchecked("muteOn").txt() else I18nKey.unchecked("muteOff").txt())
          ),
          tr(
            th(I18nKey.unchecked("muteHumanTiming").txt()),
            td(if timing then I18nKey.unchecked("muteOn").txt() else I18nKey.unchecked("muteOff").txt())
          ),
          tr(
            th(I18nKey.unchecked("muteTimingStyle").txt()),
            td(style + (if timing then "" else " (inactive)"))
          ),
          (opening > 0).option(tr(th("Opening"), td(s"Full sampling for the first $opening moves")))
        )
      ),
      p(
        "Bot settings stay fixed. The opponent input uses your rating at game start; anonymous play matches the bot's Maia input. Conditioning is a model input, not a measured playing rating."
      ),
      a(href := "https://github.com/Dash1971/mute-chess/blob/main/docs/bot-population.md")(
        "Policy and rating methodology"
      )
    )
