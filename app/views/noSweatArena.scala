package views

import play.api.libs.json.JsObject
import lila.app.UiEnv.{ *, given }
import lila.core.i18n.I18nKey

def noSweatArenaHome(events: List[lila.tournament.Tournament], host: Boolean)(using Context) =
  Page(trans.arena.arenaTournaments.txt()).css("tournament.home", "bits.page"):
    main(cls := "box box-pad")(
      h1(trans.arena.arenaTournaments()),
      host.option(a(cls := "button", href := routes.Tournament.form)(trans.site.createANewTournament())),
      a(cls := "button button-empty", href := routes.Tournament.help)(trans.site.tournamentFAQ()),
      tournament.ui.enterable(events.filterNot(_.isFinished)),
      table(cls := "slist")(tournament.ui.finishedList(events.filter(_.isFinished)))
    )

def noSweatArenaControls(t: lila.tournament.Tournament, status: JsObject)(using Context): Frag =
  frag(
    p(I18nKey("muteArenaHelp").apply()),
    if (status \ "prepared").asOpt[Boolean].contains(true) then
      p(I18nKey(if (status \ "ready").asOpt[Boolean].contains(true) then "muteArenaReady"
      else "muteArenaDraining").apply())
    else
      t.isCreated.option(
        postForm(action := routes.Tournament.prepare(t.id))(
          submitButton(cls := "button")(I18nKey("muteArenaPrepare").apply())
        )
      )
  )
