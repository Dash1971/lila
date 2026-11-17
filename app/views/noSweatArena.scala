package views

import play.api.libs.json.JsObject
import lila.app.UiEnv.{ *, given }
import lila.core.i18n.I18nKey

def noSweatArenaControls(t: lila.tournament.Tournament, status: JsObject)(using Context): Frag =
  div(cls := "nosweat-arena-controls")(
    if (status \ "prepared").asOpt[Boolean].contains(true) then
      p(
        I18nKey(if (status \ "ready").asOpt[Boolean].contains(true) then "muteArenaReady"
        else "muteArenaDraining").apply(),
        (!(status \ "ready").asOpt[Boolean].contains(true)).option(
          a(href := routes.Tournament.show(t.id))(I18nKey("muteArenaRefresh")())
        )
      )
    else
      t.isCreated.option(
        postForm(action := routes.Tournament.prepare(t.id))(
          submitButton(cls := "button")(I18nKey(if t.conditions.allowsBots then "muteArenaPrepare"
          else "muteArenaPrepareHuman").apply())
        )
      )
  )
