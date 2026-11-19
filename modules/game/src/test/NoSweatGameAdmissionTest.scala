package lila.game

import java.util.concurrent.atomic.AtomicBoolean
import scala.concurrent.{ Future, Promise }

class NoSweatGameAdmissionTest extends munit.FunSuite:
  private given Executor = scala.concurrent.ExecutionContext.global

  private def gate(state: AtomicBoolean) = new NoSweatGameAdmission(
    () => Future.successful(state.get()),
    paused => Future.successful(state.set(paused))
  )

  test("the minimum is initial time, not estimated duration with increment"):
    def clock(seconds: Int, increment: Int) = Some(
      chess.Clock.Config(chess.Clock.LimitSeconds(seconds), chess.Clock.IncrementSeconds(increment))
    )
    assert(!NoSweatGameAdmission.hasMinimumClock(None))
    for seconds <- List(0, 15, 30, 45, 59); increment <- List(0, 1, 5, 180) do
      assert(!NoSweatGameAdmission.hasMinimumClock(clock(seconds, increment)))
    for seconds <- List(60, 90, 300); increment <- List(0, 1, 5, 180) do
      assert(NoSweatGameAdmission.hasMinimumClock(clock(seconds, increment)))

  test("Arena berserk retains the original supported clock and Bullet rating category"):
    import lila.game.GameExt.*
    val arena = lila.core.game
      .newGame(
        chess = chess
          .Game(chess.variant.Standard)
          .copy(clock =
            Some(
              chess.Clock.Config(chess.Clock.LimitSeconds(60), chess.Clock.IncrementSeconds(0)).toClock
            )
          ),
        players = chess.ByColor(color => lila.game.Player.makeAnon(color)),
        rated = chess.Rated.No,
        source = lila.core.game.Source.Arena,
        pgnImport = None
      )
      .withId(GameId("arenamin"))
      .start
    val game = arena.copy(metadata = arena.metadata.copy(tournamentId = Some(TourId("arenamin"))))
    val berserked = game.goBerserk(chess.Color.White).get.game
    assert(berserked.whitePlayer.berserk)
    assert(
      berserked.clock.get.remainingTime(chess.Color.White) < game.clock.get.remainingTime(chess.Color.White)
    )
    assertEquals(berserked.clockConfig, game.clockConfig)
    assert(NoSweatGameAdmission.hasMinimumClock(berserked.clockConfig))
    assertEquals(berserked.speed, chess.Speed.Bullet)
    assertEquals(berserked.perfKey, lila.core.perf.PerfKey.bullet)

  test("pausing rejects insertion without running its side effects, and reopening restores it"):
    val state = new AtomicBoolean(false)
    val admission = gate(state)
    var inserts = 0
    def insert = admission.insert:
      inserts += 1
      Future.successful(inserts)
    for
      first <- insert
      _ <- admission.pause(true)
      rejected <- insert.failed
      _ = assertEquals(rejected, NoSweatGameAdmission.Paused)
      _ = assertEquals(inserts, 1)
      _ <- admission.pause(false)
      next <- insert
    yield assertEquals((first, next), (1, 2))

  test("pause waits for an actual in-flight insertion, then rejects a racing new start"):
    val admission = gate(new AtomicBoolean(false))
    val started = Promise[Unit]()
    val finish = Promise[Unit]()
    val first = admission.insert:
      started.success(())
      finish.future
    for
      _ <- started.future
      paused = admission.pause(true)
      next = admission.insert(Future.successful("must not start"))
      _ = assert(!paused.isCompleted)
      _ = finish.success(())
      _ <- first
      _ <- paused
      rejected <- next.failed
    yield assertEquals(rejected, NoSweatGameAdmission.Paused)

  test("a saved pause applies to a newly constructed gate after restart"):
    val state = new AtomicBoolean(false)
    for
      _ <- gate(state).pause(true)
      restarted = gate(state)
      paused <- restarted.paused
      rejected <- restarted.insert(Future.successful(())).failed
    yield
      assert(paused)
      assertEquals(rejected, NoSweatGameAdmission.Paused)

  test("a failed insertion does not prevent the following pause or reopening"):
    val admission = gate(new AtomicBoolean(false))
    for
      _ <- admission.insert(Future.failed(new RuntimeException("database write failed"))).failed
      _ <- admission.pause(true)
      rejected <- admission.insert(Future.successful(())).failed
      _ = assertEquals(rejected, NoSweatGameAdmission.Paused)
      _ <- admission.pause(false)
      result <- admission.insert(Future.successful("ok"))
    yield assertEquals(result, "ok")

  test("unavailable persisted state refuses new games rather than silently opening admission"):
    val unavailable = new AtomicBoolean(true)
    val admission = new NoSweatGameAdmission(
      () =>
        if unavailable.get() then Future.failed(new RuntimeException("pause state unavailable"))
        else Future.successful(false),
      _ => Future.successful(())
    )
    var inserted = false
    for
      error <- admission.insert { inserted = true; Future.successful(()) }.failed
      _ = assertEquals(error.getMessage, "pause state unavailable")
      _ = assert(!inserted)
      _ = unavailable.set(false)
      _ <- admission.insert { inserted = true; Future.successful(()) }
    yield assert(inserted)
