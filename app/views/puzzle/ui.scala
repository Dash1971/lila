package views.puzzle
import lila.app.UiEnv.{ *, given }
import lila.puzzle.DailyPuzzle

lazy val bits = lila.puzzle.ui.PuzzleBits(helpers)
lazy val ui =
  lila.puzzle.ui
    .PuzzleUi(helpers, bits)(
      views.analyse.ui.bits.cspExternalEngine,
      analyseEndpoints.externalEngine,
      focused = env.noSweat.enabled
    )

def embed(daily: DailyPuzzle.WithHtml)(using config: EmbedContext) =
  views.base.embed.minimal(
    title = if env.noSweat.enabled then
      s"mutechess.org • ${trans.puzzle.puzzleOfTheDay.txt()(using config.translate)}"
    else "lichess.org chess puzzle",
    cssKeys = List("bits.tv.embed"),
    modules = Esm("site.puzzleEmbed")
  )(
    bits.dailyLink(daily)(using config.translate)(
      targetBlank,
      id := "daily-puzzle",
      cls := "embedded"
    ),
    chessgroundTag
  )
