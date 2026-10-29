package lila.web
package ui

import scalalib.model.Days

import lila.ui.*
import lila.ui.ScalatagsTemplate.{ *, given }

final class TopNav(helpers: Helpers):
  import helpers.{ *, given }

  private def linkTitle(url: String, name: Frag)(using ctx: Context) =
    if ctx.blind then h3(name) else a(href := url)(name)

  def apply(@scala.annotation.unused seesClassMenu: Boolean, hasDgt: Boolean, compact: Boolean = false)(using
      ctx: Context
  ) =
    if compact then
      st.nav(id := "topnav", cls := "hover")(
        st.section(
          linkTitle(routes.Puzzle.home.url, trans.site.puzzles()),
          div(role := "group")(
            a(href := routes.Puzzle.home)(trans.site.puzzles()),
            a(href := routes.Puzzle.themes)(trans.puzzle.puzzleThemes()),
            a(href := routes.Puzzle.dashboard(Days(30), "home", none))(trans.puzzle.puzzleDashboard()),
            a(href := routes.Puzzle.streak)("Puzzle Streak"),
            a(href := routes.Storm.home)("Puzzle Storm")
          )
        ),
        st.section(
          linkTitle(routes.ForumCateg.index.url, trans.site.community()),
          div(role := "group")(a(href := routes.ForumCateg.index)(trans.site.forum()))
        ),
        toolsMenu
      )
    else
      st.nav(id := "topnav", cls := "hover")(
        st.section(
          linkTitle(
            "/",
            frag(
              span(cls := "play")(trans.site.play()),
              span(cls := "home")("lichess.org")
            )
          ),
          div(role := "group")(
            if ctx.noBot then a(href := s"${langHref("/")}?any#hook")(trans.site.createLobbyGame())
            else a(href := "/?any#friend")(trans.site.challengeAFriend()),
            Option.when(ctx.noBot):
              frag(
                hasDgt.option(a(href := routes.DgtCtrl.index)(trans.dgt.dgtBoard())),
                (ctx.kid.no && !ctx.me.exists(_.isPatron)).option:
                  a(cls := "community-patron mobile-only", href := routes.Plan.index())(trans.patron.donate())
              )
          )
        ),
        Option.when(ctx.noBot):
          val puzzleUrl = langHref(routes.Puzzle.home.url)
          st.section(
            linkTitle(puzzleUrl, trans.site.puzzles()),
            div(role := "group")(
              a(href := puzzleUrl)(trans.site.puzzles()),
              a(href := langHref(routes.Puzzle.themes))(trans.puzzle.puzzleThemes()),
              a(href := routes.Puzzle.dashboard(Days(30), "home", none))(trans.puzzle.puzzleDashboard()),
              a(href := langHref(routes.Puzzle.streak))("Puzzle Streak"),
              a(href := langHref(routes.Storm.home))("Puzzle Storm")
            )
          )
        ,
        st.section(
          linkTitle(routes.Learn.index.url, trans.site.learnMenu()),
          div(role := "group")(
            Option.when(ctx.noBot):
              frag(
                a(href := langHref(routes.Learn.index))(trans.site.chessBasics()),
                a(href := langHref(routes.Practice.index))(trans.site.practice()),
                a(href := langHref(routes.Coordinate.home))(trans.coordinates.coordinates())
              )
            ,
            a(href := langHref(routes.Study.allDefault()))(trans.site.studyMenu())
          )
        ),
        st.section(
          linkTitle(routes.Tv.games.url, trans.site.watch()),
          div(role := "group")(
            a(href := routes.Tv.games)(trans.site.currentGames())
          )
        ),
        st.section(
          linkTitle(routes.ForumCateg.index.url, trans.site.community()),
          div(role := "group")(
            ctx.kid.no.option(a(href := routes.ForumCateg.index)(trans.site.forum())),
            (ctx.kid.no && ctx.me.exists(_.isPatron))
              .option(a(cls := "community-patron", href := routes.Plan.index())(trans.patron.donate()))
          )
        ),
        toolsMenu
      )

  private def toolsMenu(using Context) =
    st.section(
      linkTitle(routes.UserAnalysis.index.url, trans.site.tools()),
      div(role := "group")(
        a(href := routes.UserAnalysis.index)(trans.site.analysis()),
        a(href := routes.Editor.index)(trans.site.boardEditor()),
        a(href := routes.Importer.importGame)(trans.site.importGame())
      )
    )
