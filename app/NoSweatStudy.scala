package lila.app

import play.api.libs.json.*
import java.util.concurrent.atomic.{ AtomicBoolean, AtomicLong }
import chess.{ ByColor, Clock, Color, Rated }
import lila.core.config.CollName
import lila.core.game.{ GameRule, Source, WithInitialFen }
import lila.core.perf.PerfKey
import lila.db.dsl.{ *, given }

/** Private, bounded experiment admission only. Native rounds and ratings remain authoritative. */
final class NoSweatStudy(env: Env)(using ec: Executor):
  private val config = env.config
  private val requested = config.getOptional[Boolean]("nosweat.study.enabled").getOrElse(false)
  private val run = config.getOptional[String]("nosweat.study.runId").getOrElse("")
  private val publicRatings = config.getOptional[Boolean]("nosweat.study.publicRatings").getOrElse(false)
  private val enabled = requested && env.noSweat.enabled && lila.game.NoSweatStudyScope.valid(
    run,
    config.get[String]("mongodb.uri"),
    config.get[String]("mongodb.yolo.uri"),
    config.get[String]("net.domain"),
    publicRatings
  )
  require(!requested || enabled, "Study configuration does not match its explicit deployment scope")
  private val plan = NoSweatStudyPlan
    .find(
      config.getOptional[String]("nosweat.study.profile").getOrElse("pilot-10-v1")
    )
    .getOrElse(throw IllegalArgumentException("Unknown study profile"))
  private val continuation = plan.key == "strength-validation-continuation-v1"
  private val continuationAdmitted =
    config.getOptional[Int]("nosweat.study.continuationAdmitted").getOrElse(0)
  require(
    !continuation ||
      (continuationAdmitted >= 2000 && continuationAdmitted < 3000 &&
        (!publicRatings || run == "r20261031p137")),
    "Invalid dated validation continuation scope"
  )
  private lazy val started = config.get[Long]("nosweat.study.startedEpochMillis")
  require(
    !requested || !plan.ratingEstablishment || plan.establishmentScope(run, publicRatings, started),
    "Invalid dated rating establishment scope"
  )
  private lazy val admissionEnd =
    if plan.ratingEstablishment then NoSweatStudyPlan.establishmentAdmissionEnd
    else if continuation then java.time.Instant.parse("2026-10-31T12:30:00Z").toEpochMilli
    else if plan.key == "strength-predictor-v1" then
      java.time.Instant.parse("2026-10-31T10:04:39Z").toEpochMilli
    else started + 75L * 60000
  private lazy val deadline =
    if plan.ratingEstablishment then NoSweatStudyPlan.establishmentDeadline
    else if continuation then java.time.Instant.parse("2026-10-31T13:00:00Z").toEpochMilli
    else if plan.key == "strength-predictor-v1" then
      java.time.Instant.parse("2026-10-31T10:34:39Z").toEpochMilli
    else started + 90L * 60000
  private val closed = AtomicBoolean(false)
  private val polled = AtomicBoolean(false)
  private val lastPoll = AtomicLong(System.currentTimeMillis())
  private val records = env.mongo.mainDb(CollName("nosweat_study_game"))
  private lazy val bots = env.noSweat.roster.map(b => (b \ "id").as[String] -> b).toMap
  private def botId(bot: JsObject) = UserId((bot \ "username").as[String].toLowerCase)
  private def check(ok: Boolean, status: Int, reason: String): Unit =
    if !ok then throw NoSweatError(status, reason)
  private def guard(): Unit = check(enabled, 404, "Study is disabled")
  private def documents = records.find(bdoc("runId" -> run)).cursor[Bdoc]().list(plan.maximumAdmitted + 1)
  private def active(doc: Bdoc) = doc.getAsOpt[String]("state").exists(Set("reserved", "active").contains)
  private def id(doc: Bdoc) = doc.getAsOpt[GameId]("_id").get
  private def presence(gameId: GameId, online: Boolean): Unit =
    Color.all.foreach: color =>
      lila.common.Bus.pub(lila.core.round.Tell(gameId, lila.core.round.RoundBus.BotConnected(color, online)))

  private def ratings: Fu[JsValue] =
    env.user.perfsRepo
      .idsMap(bots.values.map(botId).toList, _.pri)
      .map: perfs =>
        JsObject(bots.toSeq.map: (slug, bot) =>
          val ps = perfs(botId(bot))
          slug -> JsObject(List(PerfKey.blitz, PerfKey.rapid).map: key =>
            val p = ps(key)
            key.value -> Json.obj(
              "rating" -> p.glicko.rating,
              "rd" -> p.glicko.deviation,
              "volatility" -> p.glicko.volatility,
              "games" -> p.nb,
              "provisional" -> p.provisional.yes
            )))

  if enabled then
    lila.common.Bus.sub[lila.core.game.FinishGame]: finish =>
      records
        .byId[Bdoc](finish.game.id)
        .foreach: found =>
          found
            .filter(active)
            .foreach: _ =>
              val game = finish.game
              presence(game.id, false)
              val result = Json.obj(
                "status" -> game.status.name,
                "winner" -> game.winnerColor.map(_.name),
                "plies" -> game.ply.value,
                "whiteDiff" -> game.whitePlayer.ratingDiff.map(_.value),
                "blackDiff" -> game.blackPlayer.ratingDiff.map(_.value),
                "ratedUpdate" -> (game.whitePlayer.ratingDiff.isDefined && game.blackPlayer.ratingDiff.isDefined)
              )
              records.update
                .one(
                  bid(game.id),
                  set(
                    "state" -> (if game.aborted then "aborted" else "finished"),
                    "result" -> Json.stringify(result),
                    "finishedAt" -> nowInstant
                  )
                )
                .failed
                .foreach: error =>
                  lila.log("nosweat").error("Study completion checkpoint failed", error)
    env.system.scheduler.scheduleWithFixedDelay(5.seconds, 5.seconds): () =>
      if System.currentTimeMillis() >= deadline ||
        (polled.get() && System.currentTimeMillis() - lastPoll.get() > 15000)
      then
        stop(run).failed.foreach: error =>
          lila.log("nosweat").error("Study deadline stop failed", error)

  private def stage(docs: List[Bdoc]): Int =
    plan.capacity(docs.count(_.getAsOpt[String]("state").contains("finished")))

  def capacity: Fu[Int] =
    if !enabled || closed.get() || System.currentTimeMillis() >= deadline then
      fuccess(env.noSweat.normalCapacity)
    else documents.map(docs => stage(docs).max(2))

  def busy: Fu[(Int, Set[UserId])] =
    if !enabled then fuccess(0 -> Set.empty[UserId])
    else
      documents.map: docs =>
        val playing = docs.filter(active)
        playing.size -> playing
          .flatMap(d => List(d.getAsOpt[UserId]("white"), d.getAsOpt[UserId]("black")).flatten)
          .toSet

  def status(withRatings: Boolean): Fu[JsObject] =
    guard()
    polled.set(true)
    lastPoll.set(System.currentTimeMillis())
    for
      _ <- env.noSweat.ready
      docs <- documents
      publicGames <- env.noSweat.current()
      games <- docs
        .filter(active)
        .traverse: doc =>
          env.round.proxyRepo
            .game(id(doc))
            .flatMap:
              case Some(game) =>
                env.bot.jsonView
                  .gameState(WithInitialFen(game, None))
                  .map: state =>
                    Json.obj(
                      "id" -> game.id.value,
                      "ply" -> game.ply.value,
                      "playable" -> game.playable,
                      "turn" -> game.turnColor.name,
                      "lastMoveAt" -> game.movedAt.toEpochMilli,
                      "state" -> state,
                      "policies" -> Json.parse(doc.getAsOpt[String]("policies").get)
                    )
              case None => fufail(NoSweatError(503, "Study game missing from native repository"))
      ps <- if withRatings then ratings else fuccess(JsNull)
    yield Json.obj(
      "runId" -> run,
      "profile" -> plan.key,
      "workers" -> plan.workers,
      "maximumConcurrency" -> plan.maximumConcurrency,
      "maximumAdmitted" -> plan.maximumAdmitted,
      "stages" -> plan.stages.map((completed, concurrency) =>
        Json.obj("completed" -> completed, "concurrency" -> concurrency)
      ),
      "publicRatings" -> publicRatings,
      "deadline" -> deadline,
      "admissionEnd" -> admissionEnd,
      "closed" -> closed.get(),
      "publicGames" -> publicGames.size,
      "capacity" -> stage(docs),
      "admitted" -> docs.size,
      "games" -> games,
      "ratings" -> ps,
      "records" -> docs.map: doc =>
        Json.obj(
          "id" -> id(doc).value,
          "white" -> doc.getAsOpt[String]("whiteSlug"),
          "black" -> doc.getAsOpt[String]("blackSlug"),
          "speed" -> doc.getAsOpt[String]("speed"),
          "state" -> doc.getAsOpt[String]("state"),
          "result" -> doc.getAsOpt[String]("result").map(Json.parse)
        )
    )

  def create(data: JsValue): Fu[JsObject] = env.noSweat.queue:
    guard()
    val now = System.currentTimeMillis()
    check(!closed.get() && now >= started && now < admissionEnd, 409, "Study admissions closed")
    val speed = (data \ "speed").as[String]
    check(Set("blitz", "rapid").contains(speed), 400, "Unsupported study speed")
    val key = if speed == "blitz" then PerfKey.blitz else PerfKey.rapid
    val whiteSlug = (data \ "white").as[String]
    val blackSlug = (data \ "black").as[String]
    check(
      whiteSlug != blackSlug && bots.contains(whiteSlug) && bots.contains(blackSlug),
      400,
      "Invalid seats"
    )
    val whiteId = botId(bots(whiteSlug))
    val blackId = botId(bots(blackSlug))
    val policies = (data \ "policies").as[JsObject]
    for (color, slug) <- List("white" -> whiteSlug, "black" -> blackSlug) do
      val p = policies \ color
      check(
        (p \ "version").asOpt[String].contains("native-no-wait-study-v1") &&
          (p \ "runId").asOpt[String].contains(run) && (p \ "addedHumanWait")
            .asOpt[Boolean]
            .contains(false) &&
          (p \ "production" \ "bot").asOpt[String].contains(slug),
        400,
        "Invalid frozen study policy"
      )
    for
      _ <- env.noSweat.ready
      _ <- env.game.noSweatAdmission.check
      docs <- documents
      _ = check(!continuation || docs.size >= continuationAdmitted, 409, "Continuation predecessor missing")
      _ = check(
        !plan.ratingEstablishment || plan.establishmentAdmission(now, started, docs.size),
        409,
        "Rating establishment admissions closed"
      )
      publicGames <- env.noSweat.current()
      busy = docs
        .filter(active)
        .flatMap(d => List(d.getAsOpt[UserId]("white"), d.getAsOpt[UserId]("black")).flatten)
        .toSet ++ publicGames.flatMap(_._1.getAsOpt[UserId]("bot"))
      _ = check(
        docs.size < plan.maximumAdmitted && docs.count(active) + publicGames.size < stage(docs),
        409,
        "Study limit reached"
      )
      _ = check(!busy(whiteId) && !busy(blackId), 409, "Bot already playing")
      white <- env.user.api.byIdWithPerf(whiteId, key)
      black <- env.user.api.byIdWithPerf(blackId, key)
      w = white.getOrElse(throw NoSweatError(404, "Missing white bot"))
      b = black.getOrElse(throw NoSweatError(404, "Missing black bot"))
      _ = check(
        List(w, b).forall(u => u.user.isBot && u.user.enabled.yes) &&
          math.abs(w.perf.intRating.value - b.perf.intRating.value) <= 200,
        409,
        "No eligible native rating match"
      )
      gameId <- env.game.idGenerator.game
      clock = Clock.Config(
        Clock.LimitSeconds(if speed == "blitz" then 300 else 600),
        Clock.IncrementSeconds(if speed == "blitz" then 3 else 5)
      )
      game = lila.core.game
        .newGame(
          chess =
            chess.Game(position = chess.variant.Standard.initialPosition, clock = Some(clock.toClock.start)),
          players = ByColor(c => lila.game.Player.make(c, Some(if c == Color.white then w else b))),
          rated = Rated(true),
          source = Source.Pool,
          pgnImport = None,
          daysPerTurn = None,
          rules = Set(GameRule.noRematch, GameRule.noGiveTime, GameRule.noClaimWin)
        )
        .withId(gameId)
        .start
      _ <- records.insert.one(
        bdoc(
          "_id" -> gameId,
          "runId" -> run,
          "white" -> whiteId,
          "black" -> blackId,
          "whiteSlug" -> whiteSlug,
          "blackSlug" -> blackSlug,
          "speed" -> speed,
          "state" -> "reserved",
          "policies" -> Json.stringify(policies),
          "createdAt" -> nowInstant
        )
      )
      _ <- env.game.gameRepo.insertDenormalized(game)
      _ <- env.round.onStart.exec(gameId)
      _ <- records.update.one(bid(gameId), set("state" -> "active"))
      _ = presence(gameId, true)
    yield Json.obj("id" -> gameId.value)

  def move(gameId: GameId, ply: Int, uci: String): Funit =
    guard()
    check(System.currentTimeMillis() < deadline, 409, "Study deadline reached")
    for
      doc <- records.byId[Bdoc](gameId)
      _ = check(
        doc.exists(d => active(d) && d.getAsOpt[String]("runId").contains(run)),
        404,
        "Unknown study game"
      )
      game <- env.round.proxyRepo.game(gameId)
      g = game.getOrElse(throw NoSweatError(404, "Native game missing"))
      userId = g.player.userId.get
      bot <- env.user.repo.byId(userId)
      pov <- env.round.proxyRepo.pov(gameId, userId)
      _ = check(
        g.playable && g.ply.value == ply && bot.exists(u => u.isBot && u.enabled.yes),
        409,
        "Position changed"
      )
      _ <- env.bot.player.apply(pov.get, uci, Some(false))(using Me(bot.get))
    yield ()

  def stop(expectedRun: String): Funit =
    guard()
    check(expectedRun == run, 409, "Study run mismatch")
    closed.set(true)
    documents.flatMap: docs =>
      docs
        .filter(active)
        .traverse: doc =>
          presence(id(doc), false)
          env.round.roundApi.tell(id(doc), lila.core.round.RoundBus.AbortForce)
          records.update.one(bid(id(doc)), set("state" -> "aborted", "failure" -> "bounded_study_stop")).void
        .void
