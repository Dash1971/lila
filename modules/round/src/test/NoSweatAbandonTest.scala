package lila.round

import chess.{ ByColor, Centis, Clock, Color, Rated, Status }
import chess.format.pgn.PgnStr
import scala.concurrent.{ Future, Promise }

import lila.core.game.{ Game, GameRule, Player, Pov, Source }
import lila.core.socket.SocketVersion
import lila.tree.ParseImport

class NoSweatAbandonTest extends munit.FunSuite:
  private given Executor = scala.concurrent.ExecutionContext.global
  private val bot = UserId("managed-maia")
  private val human = UserId("human")

  private def game(
      anonymous: Boolean = true,
      moves: String = "1. e4 e5 *",
      botColor: Color = Color.Black
  ): Game =
    val chessGame = ParseImport
      .full(PgnStr(moves))
      .toOption
      .get
      .game
      .copy(clock = Some(Clock.Config(Clock.LimitSeconds(300), Clock.IncrementSeconds(3)).toClock.start))
    lila.core.game
      .newGame(
        chess = chessGame,
        players = ByColor(color =>
          Player(
            id = GamePlayerId(if color.white then "aaaa" else "bbbb"),
            color = color,
            aiLevel = None,
            userId = if color == botColor then Some(bot) else Option.unless(anonymous)(human)
          )
        ),
        rated = Rated(!anonymous),
        source = Source.Pool,
        pgnImport = None
      )
      .withId(GameId("abcdefgh"))
      .start

  private def status(
      humanGone: Boolean,
      botOnline: Boolean = true,
      botColor: Color = Color.Black
  ): SocketStatus =
    val online = ByColor(color => color == botColor && botOnline)
    val gone = ByColor(color => color != botColor && humanGone)
    SocketStatus(SocketVersion(0), online.white, gone.white, online.black, gone.black)

  private def run(g: Game, socket: SocketStatus, managed: Option[UserId] = Some(bot)) =
    var claims = List.empty[Pov]
    var reads = 0
    NoSweatAbandon(
      g,
      managed,
      true,
      _ =>
        reads += 1; Future.successful(socket)
      ,
      pov => claims = pov :: claims,
      _ => fail("unexpected clock flag")
    ).map(_ => (claims, reads))

  test("anonymous and registered humans are claimed only after native long-gone eligibility"):
    Future.traverse(List(true, false)): anonymous =>
      run(game(anonymous), status(true)).map: (claims, reads) =>
        assertEquals(claims.map(_.color), List(Color.Black))
        assertEquals(claims.flatMap(_.player.userId), List(bot))
        assertEquals(reads, 1)

  test("Black human abandonment is claimed by the White Maia seat"):
    val g = game(moves = "1. e4 e5 2. Nf3 *", botColor = Color.White)
    run(g, status(true, botColor = Color.White)).map: (claims, _) =>
      assertEquals(claims.map(_.color), List(Color.White))

  test("a connected or briefly disconnected human is never claimed"):
    run(game(), status(false)).map(result => assertEquals(result._1, Nil))

  test("an offline Maia cannot claim a disconnected human"):
    run(game(), status(true, botOnline = false)).map(result => assertEquals(result._1, Nil))

  test("background, friend and unhealthy-adapter polls provide no managed claimant"):
    run(game(), status(true), None).map: (claims, reads) =>
      assertEquals(claims, Nil)
      assertEquals(reads, 0)

  test("the claimed bot must actually own the opponent seat"):
    run(game(), status(true), Some(UserId("other-bot"))).map: (claims, reads) =>
      assertEquals(claims, Nil)
      assertEquals(reads, 0)

  test("first-move games, finished games, no-clock games and no-claim rules are ineligible"):
    val g = game()
    val noClaim = g.copy(metadata = g.metadata.copy(rules = Set(GameRule.noClaimWin)))
    val noClock = g.copy(chess = g.chess.copy(clock = None))
    Future.traverse(List(game(moves = "*"), g.copy(status = Status.Resign), noClock, noClaim)): candidate =>
      run(candidate, status(true)).map: (claims, reads) =>
        assertEquals(claims, Nil)
        assertEquals(reads, 0)

  test("no claim is sent on Maia's turn even if the human has disconnected"):
    run(game(moves = "1. e4 e5 2. Nf3 *"), status(true)).map: (claims, reads) =>
      assertEquals(claims, Nil)
      assertEquals(reads, 0)

  test("a reconnect observed while reading native status prevents the claim"):
    val snapshot = Promise[SocketStatus]()
    var claims = 0
    val pending =
      NoSweatAbandon(game(), Some(bot), true, _ => snapshot.future, _ => claims += 1, _ => fail("flag"))
    snapshot.success(status(false))
    pending.map(_ => assertEquals(claims, 0))

  test("status lookup errors do not fabricate a result"):
    var claims = 0
    val pending = NoSweatAbandon(
      game(),
      Some(bot),
      true,
      _ => Future.failed(new RuntimeException("socket unavailable")),
      _ => claims += 1,
      _ => fail("flag")
    )
    pending.failed.map: error =>
      assertEquals(error.getMessage, "socket unavailable")
      assertEquals(claims, 0)

  test("expired human and background games request native flag checks without a disconnect claim"):
    val g = game()
    val expired = g.copy(chess = g.chess.copy(clock = g.clock.map(_.giveTime(Color.White, Centis(-360000)))))
    assert(expired.outoftime(withGrace = true))
    Future.traverse(List(Some(bot), None)): claimant =>
      var flags = List.empty[GameId]
      NoSweatAbandon(
        expired,
        claimant,
        true,
        _ => fail("expired clocks do not need socket status"),
        _ => fail("native flag takes precedence over disconnect claims"),
        game => flags = game.id :: flags
      ).map(_ => assertEquals(flags, List(expired.id)))

  test("an unhealthy poll neither flags expired clocks nor claims disconnected humans"):
    val g = game()
    val expired = g.copy(chess = g.chess.copy(clock = g.clock.map(_.giveTime(Color.White, Centis(-360000)))))
    Future.traverse(List(g, expired)): candidate =>
      NoSweatAbandon(
        candidate,
        Some(bot),
        false,
        _ => fail("unhealthy poll must not read status"),
        _ => fail("unhealthy poll must not claim"),
        _ => fail("unhealthy poll must not flag")
      )
