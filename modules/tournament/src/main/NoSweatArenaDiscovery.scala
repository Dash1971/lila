package lila.tournament

import play.api.Configuration
import play.api.i18n.Lang
import play.api.libs.json.*
import scalalib.paginator.Paginator

import lila.common.Json.given
import lila.common.config.given
import lila.core.tournament.Status
import lila.db.dsl.{ *, given }
import lila.tournament.BSONHandlers.given

/** Native discovery surfaces, restricted to the configured Mute hosts and public standard Arenas. */
final class NoSweatArenaDiscovery(
    appConfig: Configuration,
    repo: TournamentRepo,
    apiJsonView: ApiJsonView
)(using Executor, lila.core.i18n.Translator):
  val enabled = appConfig.getOptional[Boolean]("nosweat.enabled").getOrElse(false)
  private val hosts = appConfig.getOptional[List[String]]("nosweat.arena.hosts").getOrElse(Nil).map(UserId(_))
  private val publicEvents = NoSweatArenaDiscovery.publicEvents(hosts)

  private def select(status: Status) = publicEvents ++ bdoc("status" -> status.id)
  private def list(query: Bdoc, ascending: Boolean = true, limit: Int = Int.MaxValue): Fu[List[Tournament]] =
    repo.coll
      .find(query)
      .sort(bdoc("startsAt" -> (if ascending then 1 else -1)))
      .cursor[Tournament]()
      .list(limit)

  def visible: Fu[VisibleTournaments] = for
    created <- list(select(Status.created) ++ bdoc("startsAt".lt(nowInstant.plusHours(6))))
    started <- list(select(Status.started))
    finished <- list(select(Status.finished), ascending = false, limit = 20)
  yield VisibleTournaments(created, started, finished)

  def history(page: Int): Fu[Paginator[Tournament]] =
    Paginator(
      adapter = new lila.db.paginator.Adapter[Tournament](
        collection = repo.coll,
        selector = select(Status.finished),
        projection = none,
        sort = sort.desc("startsAt")
      ),
      currentPage = page,
      maxPerPage = MaxPerPage(20)
    )

  def calendarJson(using Lang): Fu[JsObject] =
    val from = nowInstant.minusDays(1)
    list(publicEvents ++ bdoc("startsAt".gte(from).lt(from.plusYears(1)))).map: events =>
      if events.nonEmpty then apiJsonView.calendar(events)
      else
        Json.obj(
          "since" -> from.withTimeAtStartOfDay,
          "to" -> from.plusDays(7).withTimeAtStartOfDay,
          "tournaments" -> Json.arr()
        )

  def homepage: Fu[List[Tournament]] =
    list(publicEvents ++ bdoc("status".in(List(Status.created.id, Status.started.id))))
      .map(_.filter(NoSweatArenaDiscovery.spotlight(_, nowInstant)).take(1))

object NoSweatArenaDiscovery:
  private[tournament] def publicEvents(hosts: List[UserId]): Bdoc =
    bdoc(
      "createdBy".in(hosts),
      "password".exists(false),
      "variant".exists(false),
      "fen".exists(false),
      "teamBattle".exists(false)
    )

  private[tournament] def spotlight(tour: Tournament, now: Instant): Boolean =
    !tour.isPrivate && tour.variant.standard && tour.position.isEmpty && !tour.isTeamBattle &&
      (tour.isStarted && tour.isStillWorthEntering || tour.isCreated && tour.startsAt.isBefore(
        now.plusHours(crud.CrudForm.maxHomepageHours)
      ))
