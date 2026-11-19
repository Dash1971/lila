package lila.game

/** Serialize maintenance changes with native insertion, never with moves or finishing games. */
final class NoSweatGameAdmission(readPaused: () => Fu[Boolean], writePaused: Boolean => Funit)(using
    Executor
):
  private var tail: Funit = funit

  // Keep the slot until the actual database write settles, even if a caller times out.
  private def serial[A](operation: => Fu[A]): Fu[A] = synchronized:
    val result = tail.transformWith(_ => operation)
    tail = result.transform(_ => scala.util.Success(()))
    result

  def paused: Fu[Boolean] = readPaused()

  def check: Funit = paused.flatMap:
    case true => fufail(NoSweatGameAdmission.Paused)
    case false => funit

  def insert[A](operation: => Fu[A]): Fu[A] = serial(check.flatMap(_ => operation))

  def pause(value: Boolean): Funit = serial(writePaused(value))

object NoSweatGameAdmission:
  def hasMinimumClock(clock: Option[chess.Clock.Config]): Boolean =
    clock.exists(_.limitSeconds.value >= 60)

  case object MinimumClockRequired extends RuntimeException
  case object RealTimeRequired extends RuntimeException
  case object Paused extends RuntimeException("Server maintenance: new games are temporarily paused")
