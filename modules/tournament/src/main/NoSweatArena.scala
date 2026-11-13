package lila.tournament

import play.api.Configuration
import lila.common.config.given
import lila.core.config.CollName
import lila.db.dsl.{ *, given }
import lila.tournament.BSONHandlers.given

/** Managed seats around native Arena pairing, never a second tournament scorer. */
final class NoSweatArena(
    appConfig: Configuration,
    db: lila.db.Db,
    userApi: lila.core.user.UserApi,
    playerRepo: PlayerRepo,
    pairingRepo: PairingRepo,
    tournamentRepo: TournamentRepo,
    cached: TournamentCache,
    socket: TournamentSocket
)(using Executor):
  import NoSweatArena.*
  val focused = appConfig.getOptional[Boolean]("nosweat.enabled").getOrElse(false)
  private val hosts =
    appConfig.getOptional[List[String]]("nosweat.arena.hosts").getOrElse(Nil).map(UserId(_)).toSet
  val state = db(CollName("nosweat_arena"))
  def hostAllowed(id: UserId): Boolean = focused && hosts(id)
  def ownerEvent(t: Tournament): Boolean =
    hostAllowed(t.createdBy) && t.variant.standard && t.position.isEmpty && !t.isTeamBattle

  // Installed by the existing managed adapter. Fail closed until it is ready.
  @volatile var admit: (Tournament, List[Seats], List[GameId] => Funit) => Funit =
    (_, _, _) => fufail(new IllegalStateException("Arena adapter is not ready"))

  def events: Fu[List[Tournament]] =
    tournamentRepo.coll
      .find(bdoc("createdBy" -> bdoc("$in" -> hosts.toList)))
      .sort(sort.desc("startsAt"))
      .cursor[Tournament]()
      .list(50)
      .map(_.filter(ownerEvent))

  def current: Fu[Option[Bdoc]] = state.byId[Bdoc]("current")
  def reservedBots: Fu[Set[UserId]] =
    current.map(_.filterNot(_.getAsOpt[String]("state").contains("idle")).toSet.flatMap(rosterOf))
  def suppressed: Fu[Boolean] = current.map(_.exists(d => !d.getAsOpt[String]("state").contains("idle")))
  def scope(t: Tournament): Fu[Option[Bdoc]] =
    if !ownerEvent(t) then fuccess(None)
    else
      current.map(
        _.filter(d =>
          d.getAsOpt[TourId]("tour").contains(t.id) && !d.getAsOpt[String]("state").contains("idle")
        )
      )

  def register(t: Tournament, bots: List[lila.core.user.WithPerf]): Funit =
    require(ownerEvent(t) && t.isCreated && bots.size == 10 && bots.map(_.id).distinct.size == 10)
    require(
      bots.forall(b =>
        b.user.isBot && b.user.enabled.yes && b.perf.intRating.value >= 1200 && b.perf.intRating.value <= 1700
      )
    )
    for
      _ <- state.update.one(
        bdoc("_id" -> "current", "$or" -> List(bdoc("state" -> "idle"), bdoc("tour" -> t.id))),
        set(
          "tour" -> t.id,
          "host" -> t.createdBy,
          "roster" -> bots.map(_.id),
          "state" -> "prepared",
          "lastSeen" -> bdoc()
        ),
        upsert = true
      )
      _ <- bots.sequentiallyVoid(b =>
        playerRepo.find(t.id, b.id).flatMap(p => playerRepo.join(t.id, b, None, p)).void
      )
      count <- playerRepo.count(t.id)
      _ <- tournamentRepo.setNbPlayers(t.id, count)
    yield
      cached.tourCache.clear(t.id)
      socket.reload(t.id)

  // Called inside TournamentApi's native per-tournament sequencer.
  private[tournament] def waiting(t: Tournament, users: WaitingUsers): Fu[WaitingUsers] =
    if !focused then fuccess(users)
    else
      scope(t).flatMap:
        case None => fuccess(users.copy(hash = Map.empty))
        case Some(doc) =>
          for
            players <- playerRepo.coll.find(playerRepo.selectTour(t.id)).cursor[Player]().listAll()
            playing <- pairingRepo.playingUserIds(t.id)
            roster = rosterOf(doc)
            activeHumans = players.filter(p => p.active && !p.bot).map(_.userId).toSet
            observed = users.all.intersect(activeHumans) ++ playing.diff(roster.toSet)
            now = nowInstant.toEpochMilli
            previous = doc
              .getAsOpt[Map[String, Long]]("lastSeen")
              .getOrElse(Map.empty)
              .map((id, at) => UserId(id) -> at)
            seen = recentHumans(activeHumans, observed, previous, now)
            humans = seen.keySet ++ playing.diff(roster.toSet)
            enabledBots <- userApi.byIds(roster)
            availableBots = enabledBots.filter(u => u.isBot && u.enabled.yes).map(_.id).toSet
            ranking <- cached.ranking(t)
            ordered = roster
              .filter(availableBots)
              .sortBy(id => (ranking.ranking.get(id).fold(Int.MaxValue)(_.value), roster.indexOf(id)))
            selected = selectBots(ordered, humans.size, playing.intersect(roster.toSet))
            _ <- players
              .filter(p => p.bot && p.active && !selected(p.userId))
              .sequentiallyVoid(p => playerRepo.withdraw(t.id, p.userId))
            _ <- selected.toList.sequentiallyVoid: id =>
              userApi
                .byIdWithPerf(id, t.perfType.key)
                .flatMap:
                  case Some(bot) if bot.user.isBot && bot.user.enabled.yes =>
                    playerRepo.join(t.id, bot, None, players.find(_.userId == id)).void
                  case _ => funit
            _ <- state.update.one(
              bdoc("_id" -> "current", "tour" -> t.id),
              set("lastSeen" -> seen.map((id, at) => id.value -> at))
            )
          yield
            val eligible = users.all.intersect(activeHumans) ++ selected.diff(playing)
            users.copy(hash = eligible.map(id => id -> users.hash.getOrElse(id, nowInstant)).toMap)

  private[tournament] def commit(t: Tournament, pairs: List[Pairing.WithPlayers])(
      run: List[Pairing.WithPlayers] => Funit
  ): Funit =
    if !focused then run(pairs)
    else
      admit(
        t,
        pairs.map(p => Seats(p.pairing.gameId, p.pairing.user1, p.pairing.user2)),
        ids => run(pairs.filter(p => ids.contains(p.pairing.gameId)))
      )

  /** Release only event-owned suppression, and only after all its native games finish. */
  def reconcileLifecycle(hasLiveGames: TourId => Fu[Boolean]): Funit = current.flatMap:
    case Some(doc) if !doc.getAsOpt[String]("state").contains("idle") =>
      doc
        .getAsOpt[TourId]("tour")
        .fold(funit): id =>
          tournamentRepo
            .byId(id)
            .flatMap:
              case Some(t) if t.isCreated || t.isStarted => funit
              case _ =>
                hasLiveGames(id).flatMap:
                  case true =>
                    state.update.one(bdoc("_id" -> "current", "tour" -> id), set("state" -> "draining")).void
                  case false =>
                    state.update.one(bdoc("_id" -> "current", "tour" -> id), set("state" -> "idle")).void
    case _ => funit

object NoSweatArena:
  case class Seats(id: GameId, white: UserId, black: UserId):
    def users = List(white, black)
  val reconnectMillis = 60000L
  def rosterOf(d: Bdoc): List[UserId] = d.getAsOpt[List[UserId]]("roster").getOrElse(Nil)
  def recentHumans(
      active: Set[UserId],
      observed: Set[UserId],
      previous: Map[UserId, Long],
      now: Long
  ): Map[UserId, Long] =
    (previous ++ observed.map(_ -> now)).filter((id, at) => active(id) && now - at <= reconnectMillis)
  def selectBots(ranked: List[UserId], humans: Int, playing: Set[UserId]): Set[UserId] =
    val target = (10 - humans).max(0)
    val desired = ranked.take(target)
    desired.filter(playing).toSet ++ desired.filterNot(playing).take((target - playing.size).max(0))
