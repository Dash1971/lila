package controllers

import chess.format.{ Fen, Uci }
import chess.format.pgn.PgnStr
import chess.variant.Variant
import org.apache.pekko.stream.scaladsl.*
import org.apache.pekko.util.ByteString
import play.api.mvc.Result

import lila.app.{ *, given }
import lila.core.id.PuzzleId
import lila.pref.{ PieceSet, Theme }

final class Export(env: Env) extends LilaController(env):

  private def exportImageOf[A](fetch: Fu[Option[A]])(convert: A => Fu[Result])(using Context) =
    Found(fetch): res =>
      limit.exportImage(((), req.ipAddress), rateLimited)(convert(res))

  def gif(
      id: GameId,
      color: Color,
      theme: Option[String],
      piece: Option[String]
  ) = Anon:
    exportImageOf(env.game.gameRepo.gameWithInitialFen(id)): g =>
      val options = lila.game.GifExport.Options.fromReq
      val filename = s"lichess-game-${g.game.id}-${color.name}.gif"
      stream(filename, cache = if g.game.finishedOrAborted then 10.days else 10.seconds):
        for
          analysis <- options.glyphs.so(env.analyse.repo.byGame(g.game))
          source <- env.game.gifExport.fromPov(
            Pov(g.game, color),
            g.fen,
            Theme(theme).name,
            PieceSet.get(piece).name,
            analysis,
            options
          )
        yield source

  private val noSweatImagePreviewCrawler = "BingPreview|Discordbot|WhatsApp".r

  def analysisGif(pgn: String, color: Color, theme: Option[String], piece: Option[String]) = Anon:
    if req.client.isCrawler && noSweatImagePreviewCrawler
        .findFirstIn(lila.common.HTTPRequest.userAgent(req).value)
        .isEmpty
    then notFound
    else
      lila.game.NoSweatAnalysisGif
        .parse(PgnStr(pgn))
        .fold(
          _ => fuccess(BadRequest("Invalid PGN")),
          game =>
            exportImageOf(fuccess(game.some)): g =>
              val requested = lila.game.GifExport.Options.fromReq
              // Local PGN glyphs are not persisted server analysis and cannot use its glyph map.
              val options =
                lila.game.GifExport.Options(requested.players, requested.ratings, requested.clocks, false)
              env.game.gifExport
                .fromPov(
                  Pov(g.withId(lila.game.Game.syntheticId), color),
                  g.initialFen,
                  Theme(theme).name,
                  PieceSet.get(piece).name,
                  none,
                  options
                )
                .pipe(stream("mutechess-analysis.gif", cache = 0.seconds))
        )

  def legacyGameThumbnail(id: GameId, theme: Option[String], piece: Option[String]) = Anon:
    MovedPermanently(routes.Export.gameThumbnail(id, theme, piece).url).publicCache(1.day)

  def gameThumbnail(id: GameId, theme: Option[String], piece: Option[String]) = Anon:
    exportImageOf(env.game.gameRepo.game(id)) { game =>
      val filename = s"lichess-game-${game.id}-thumbnail.gif"
      env.game.gifExport
        .gameThumbnail(game, Theme(theme).name, PieceSet.get(piece).name)
        .pipe(stream(filename, cache = if game.finishedOrAborted then 10.days else 10.seconds))
    }

  def puzzleThumbnail(id: PuzzleId) = Anon: ctx ?=>
    exportImageOf(env.puzzle.api.puzzle.find(id)): puzzle =>
      env.game.gifExport
        .thumbnail(
          position = puzzle.boardAfterInitialMove.err(s"invalid puzzle ${puzzle.id}"),
          lastMove = puzzle.line.head.some,
          orientation = puzzle.color,
          theme = ctx.pref.theme,
          piece = ctx.pref.pieceSet,
          description = s"puzzleThumbnail ${puzzle.id}"
        )
        .pipe(stream(s"lichess-puzzle-${puzzle.id}.gif"))

  def fenThumbnail(
      fen: String,
      color: Option[Color],
      lastMove: Option[Uci],
      variant: Option[Variant.LilaKey],
      theme: Option[String],
      piece: Option[String]
  ) = Anon:
    exportImageOf(fuccess(Fen.read(Variant.orDefault(variant), Fen.Full.clean(fen)))): position =>
      env.game.gifExport
        .thumbnail(
          position = position,
          lastMove = lastMove,
          orientation = color | Color.white,
          theme = Theme(theme).name,
          piece = PieceSet.get(piece).name,
          description = s"fenThumbnail $fen"
        )
        .pipe(stream("lichess-fen.gif"))

  private def stream(filename: String, cache: FiniteDuration = 10.days)(
      upstream: Fu[Source[ByteString, ?]]
  ): Fu[Result] = upstream
    .map: stream =>
      Ok.chunked(stream)
        .publicCache(cache)
        .as("image/gif")
        .asAttachmentStream(filename)
    .recover:
      case lila.game.GifExport.UpstreamStatus(code) => Status(code)
