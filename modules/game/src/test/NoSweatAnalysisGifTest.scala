package lila.game

import chess.Color
import chess.format.pgn.PgnStr
import chess.variant.FromPosition

import lila.tree.ParseImport

class NoSweatAnalysisGifTest extends munit.FunSuite:
  private def parse(pgn: String) = NoSweatAnalysisGif.parse(PgnStr(pgn))

  test("exports the entire legal mainline through native pure import"):
    val game = parse("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *").toOption.get
    assertEquals(game.sloppy.sans.map(_.value).toList, List("e4", "e5", "Nf3", "Nc6", "Bb5", "a6"))
    assertEquals(game.initialFen, None)

  test("rejects malformed PGN and illegal moves instead of exporting a legal prefix"):
    for pgn <- List("this is not PGN", "*", "1. e5 *", "1. e4 e5 2. Bh6 *") do assert(parse(pgn).isLeft, pgn)

  test("enforces the decoded PGN length without truncating"):
    val legal = "1. e4 *"
    assert(parse(legal.padTo(5000, ' ')).isRight)
    assert(parse(legal.padTo(5001, ' ')).isLeft)
    assert(parse("").isLeft)
    assert(parse(" \n\t ").isLeft)

  test("accepts 600 legal plies and rejects a 601st ply instead of silently cutting it"):
    val cycle = "Nf3 Nf6 Ng1 Ng8 "
    val mainline = cycle * 150
    val accepted = parse(mainline + "*").toOption.get
    assertEquals(accepted.sloppy.sans.size, 600)
    assert(parse(mainline + "Nf3 *").isLeft)

  test("rejects unsupported and unrecognized declared variants"):
    for variant <- List("Atomic", "Crazyhouse", "Chess960", "Antichess", "unsupported") do
      assert(
        parse(s"""[Variant "$variant"]

1. e4 *""").isLeft,
        variant
      )

  private val blackFen = "4k3/8/8/8/8/8/8/4K2R b - - 0 20"
  private def fromBlack(variantTag: String = "") = s"""$variantTag[SetUp "1"]
[FEN "$blackFen"]

20... Kd7 21. Rh7+ *"""

  test("rejects a declared Chess960 middle-game FEN regardless of native variant resolution"):
    val pgn = fromBlack("[Variant \"Chess960\"]\n")
    val native = ParseImport.full(PgnStr(pgn)).toOption.get
    assert(native.parsed.tags.variant.contains(chess.variant.Chess960))
    assert(parse(pgn).isLeft)

  test("preserves a legal nonzero Black-to-move FEN with or without From Position tag"):
    for tag <- List("", s"[Variant \"${FromPosition.name}\"]\n") do
      val game = parse(fromBlack(tag)).toOption.get
      assertEquals(game.initialFen.map(_.value), Some(blackFen))
      assertEquals(game.sloppy.startedAtPly.value, 39)
      assertEquals(game.sloppy.sans.map(_.value).toList, List("Kd7", "Rh7+"))
      assertEquals(game.sloppy.turnColor, Color.Black)
