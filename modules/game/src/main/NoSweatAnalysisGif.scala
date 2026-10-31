package lila.game

import chess.ErrorStr
import chess.format.pgn.PgnStr
import chess.variant.{ FromPosition, Standard }

import lila.game.importer.ImportedGame
import lila.tree.{ Analysis, ParseImport }

/** Parse an ephemeral export without inserting an imported game. */
object NoSweatAnalysisGif:
  def parse(pgn: PgnStr): Either[ErrorStr, ImportedGame] =
    if pgn.value.trim.isEmpty || pgn.value.length > 5000 then
      Left(ErrorStr("PGN must contain 1 to 5000 characters"))
    else
      ParseImport
        .full(pgn)
        .filterOrElse(
          parsed =>
            parsed.replayError.isEmpty && parsed.parsed.mainline.nonEmpty &&
              parsed.parsed.mainline.size <= Analysis.MAX_PLIES &&
              (parsed.parsed.tags(_.Variant).isEmpty || parsed.parsed.tags.variant
                .exists(v => v == Standard || v == FromPosition)) &&
              (parsed.game.variant == Standard || parsed.game.variant == FromPosition),
          ErrorStr("PGN must contain a legal standard chess mainline of 1 to 600 plies")
        )
        .flatMap(_ => importer.parseImport(pgn, none))
