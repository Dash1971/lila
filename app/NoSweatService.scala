package lila.app

import java.nio.file.Files
import java.util.concurrent.atomic.{ AtomicLong, AtomicReference }
import play.api.libs.json.*
import play.api.libs.ws.StandaloneWSClient
import play.api.libs.ws.DefaultBodyWritables.writeableOf_String
import chess.{ ByColor, Clock, Color, Rated }
import lila.core.config.CollName
import lila.core.game.{ GameRule, Source, WithInitialFen }
import lila.core.perf.PerfKey
import lila.db.dsl.{ *, given }
import lila.user.BSONFields as UserFields

final case class NoSweatError(status: Int, reason: String) extends RuntimeException(reason)

/** Identity and bot admission adapters. Round state remains authoritative in Lila. */
final class NoSweatService(env: Env, ws: StandaloneWSClient)(using ec: Executor):
  private given Scheduler = env.system.scheduler
  val enabled = env.config.getOptional[Boolean]("nosweat.enabled").getOrElse(false)
  private lazy val adapterUrl = env.config.get[String]("nosweat.adapterUrl")
  private lazy val token = env.config.get[String]("nosweat.adapterToken")
  private val records = env.mongo.mainDb(CollName("nosweat_game"))
  private val lastPoll = AtomicLong(System.currentTimeMillis())
  private val lastOnline = AtomicLong(0L)
  private val adapterInstance = AtomicReference("")
  private val connectedBots = java.util.concurrent.ConcurrentHashMap.newKeySet[GameId]()
  private val queue = scalalib.actor.AsyncActorSequencer(
    maxSize = Max(32),
    timeout = 20.seconds,
    "noSweatAdmission",
    lila.mon.asyncActorMonitor.full
  )
  lazy val roster: List[JsObject] = Json
    .parse(
      Files.readString(env.getFile.exec("public/nosweat-roster.json").toPath)
    )
    .as[List[JsObject]]
  private def botId(bot: JsObject): UserId = UserId((bot \ "username").as[String].toLowerCase)
  private def requireThat(ok: Boolean, status: Int, message: String): Unit =
    if !ok then throw NoSweatError(status, message)

  def internalAuthorized(header: Option[String]): Boolean = enabled && header.exists: value =>
    java.security.MessageDigest.isEqual(
      value.getBytes(java.nio.charset.StandardCharsets.UTF_8),
      s"Bearer $token".getBytes(java.nio.charset.StandardCharsets.UTF_8)
    )

  def adapter(path: String, body: JsValue): Fu[JsValue] =
    ws.url(s"$adapterUrl$path")
      .withHttpHeaders("Authorization" -> s"Bearer $token", "Content-Type" -> "application/json")
      .withRequestTimeout(5.seconds)
      .post(Json.stringify(body))
      .map: response =>
        val result = Json.parse(response.body)
        if response.status != 200 then
          throw NoSweatError(
            response.status,
            (result \ "error").asOpt[String].getOrElse("Adapter unavailable")
          )
        result

  private def initialize(): Funit =
    roster
      .foldLeft(funit): (previous, bot) =>
        previous.flatMap: _ =>
          val name = UserName((bot \ "username").as[String])
          for
            existing <- env.user.repo.byId(name.id)
            loaded <- existing.fold(env.user.repo.createNoSweatBot(name))(u => fuccess(u.some))
            user = loaded.getOrElse(throw NoSweatError(503, "Could not provision bot"))
            doc <- env.user.repo.withColl(_.byId[Bdoc](name.id))
            _ = requireThat(
              user.isBot && doc.exists(_.getAsOpt[Boolean]("noSweatBot").contains(true)),
              503,
              "A roster name is occupied by an account outside the club roster"
            )
            _ <-
              if doc.exists(_.getAsOpt[String]("noSweatSeedVersion").isDefined) then funit
              else
                List(("blitz", PerfKey.blitz), ("rapid", PerfKey.rapid))
                  .foldLeft(funit): (prev, entry) =>
                    prev.flatMap: _ =>
                      val prior = (bot \ "ratings" \ entry._1)
                      val perf = lila.rating.Perf.default.copy(
                        glicko = new chess.rating.glicko.Glicko(
                          (prior \ "initial_rating").as[Double],
                          (prior \ "initial_rd").as[Double],
                          0.09
                        ),
                        latest = nowInstant.some
                      )
                      env.user.perfsRepo.setPerf(user.id, entry._2, perf)
                  .flatMap(_ =>
                    env.user.repo.withColl(
                      _.update.one(bid(name.id), set("noSweatSeedVersion" -> "roster-priors-v1")).void
                    )
                  )
            _ <-
              if doc.exists(_.getAsOpt[String]("noSweatPoolSeedVersion").isDefined) then funit
              else
                List(PerfKey.ultraBullet, PerfKey.bullet, PerfKey.classical, PerfKey.correspondence)
                  .foldLeft(funit): (prev, key) =>
                    prev.flatMap: _ =>
                      val prior =
                        (bot \ "ratings" \ (if key == PerfKey.classical || key == PerfKey.correspondence then
                                              "rapid"
                                            else "blitz"))
                      val perf = lila.rating.Perf.default.copy(
                        glicko = new chess.rating.glicko.Glicko(
                          (prior \ "initial_rating").as[Double],
                          (prior \ "initial_rd").as[Double],
                          0.09
                        ),
                        latest = nowInstant.some
                      )
                      env.user.perfsRepo.setPerf(user.id, key, perf)
                  .flatMap(_ =>
                    env.user.repo.withColl(
                      _.update.one(bid(name.id), set("noSweatPoolSeedVersion" -> "pool-priors-v1")).void
                    )
                  )
          yield env.user.lightUserApi.invalidate(user.id)
      .flatMap: _ =>
        // A process restart never guesses how much time unfinished games lost.
        records
          .find(bdoc("state" -> bdoc("$in" -> List("reserved", "active"))))
          .cursor[Bdoc]()
          .list(100)
          .flatMap: docs =>
            docs.foldLeft(funit)((prev, doc) =>
              prev.flatMap(_ => failGame(doc.getAsOpt[GameId]("_id").get, "application_restart"))
            )

  val ready: Funit = if enabled then initialize() else funit

  if enabled then
    env.system.scheduler.scheduleWithFixedDelay(5.seconds, 5.seconds): () =>
      if System.currentTimeMillis() - lastPoll.get() > 15000 then
        ready
          .flatMap(_ => current())
          .foreach: games =>
            games.foreach((doc, game) => failGame(game.id, "maia_adapter_unavailable"))

  def nostrUser(pubkey: String, requested: Option[String]): Fu[UserModel] = queue:
    ready.flatMap: _ =>
      requireThat(pubkey.matches("[0-9a-f]{64}"), 401, "Invalid verified identity")
      env.user.repo
        .byNostr(pubkey)
        .flatMap:
          case Some(user) =>
            requireThat(user.enabled.yes && !user.isBot, 403, "Account unavailable")
            fuccess(user)
          case None =>
            val name = requested.filter(_.nonEmpty).getOrElse("n" + pubkey.take(19))
            requireThat(name.matches("[A-Za-z][A-Za-z0-9_-]{2,19}"), 400, "Use a 3–20 character username")
            val reserved = Set(
              "lichess",
              "ghost",
              "openingexplorer",
              "broadcaster",
              "irwin",
              "kaladin",
              "ai",
              "lichess4545",
              "challengermode",
              "watcherbot",
              "taketaketakeapp",
              "undefined",
              "anonymous",
              "admin",
              "system",
              "nosweatchess",
              "mutechess"
            )
            requireThat(!reserved.contains(name.toLowerCase), 409, "That is a reserved system name")
            requireThat(
              !roster.exists(botId(_).value == name.toLowerCase),
              409,
              "That name belongs to a Maia opponent"
            )
            env.user.repo
              .existsPri(UserName(name).id)
              .flatMap: occupied =>
                requireThat(!occupied, 409, "Username already taken")
                env.user.repo
                  .createNostr(UserName(name), pubkey)
                  .map:
                    _.getOrElse(throw NoSweatError(503, "Could not create identity"))

  def isNostr(user: UserModel): Fu[Boolean] =
    env.user.repo.withColl(_.exists(bdoc("_id" -> user.id, "nostr" -> bdoc("$exists" -> true))))

  // Native TOTP storage/algorithm; atomic consumption prevents concurrent code reuse.
  private def identityUpdate(selector: Bdoc, update: Bdoc): Fu[Boolean] =
    env.user.repo.withColl(_.update.one(selector, update).map(_.n == 1))

  private def factorRateLimit(user: UserModel): Funit =
    val now = System.currentTimeMillis()
    for
      _ <- identityUpdate(
        bdoc(
          "_id" -> user.id,
          "$or" -> List(
            bdoc("nosweatFactorWindow" -> bdoc("$lt" -> (now - 60000))),
            bdoc("nosweatFactorWindow" -> bdoc("$exists" -> false))
          )
        ),
        bdoc("$set" -> bdoc("nosweatFactorWindow" -> now, "nosweatFactorAttempts" -> 0))
      )
      allowed <- identityUpdate(
        bdoc("_id" -> user.id, "nosweatFactorAttempts" -> bdoc("$lt" -> 5)),
        bdoc("$inc" -> bdoc("nosweatFactorAttempts" -> 1))
      )
    yield requireThat(allowed, 429, "Too many authentication attempts. Try again in a minute.")

  private def recoveryHash(code: String): String =
    java.util.HexFormat
      .of()
      .formatHex(
        java.security.MessageDigest
          .getInstance("SHA-256")
          .digest(code.replace("-", "").toLowerCase.getBytes(java.nio.charset.StandardCharsets.UTF_8))
      )

  def checkSecondFactor(user: UserModel, submitted: Option[String]): Funit =
    import lila.user.TotpSecret.totp
    user.totpSecret.fold(funit): secret =>
      val token = submitted.getOrElse("").trim
      if token.isEmpty then fufail(NoSweatError(401, "Enter your authenticator or recovery code"))
      else
        factorRateLimit(user).flatMap: _ =>
          val period = System.currentTimeMillis() / 30000
          val counter = Option
            .when(token.matches("[0-9]{6}"))(
              List(0L, -1L, 1L).map(period + _).find(n => secret.totp(n).value == token)
            )
            .flatten
          val consumed = counter match
            case Some(step) =>
              identityUpdate(
                bdoc(
                  "_id" -> user.id,
                  UserFields.totpSecret -> secret.secret,
                  "$or" -> List(
                    bdoc("nosweatTotpStep" -> bdoc("$lt" -> step)),
                    bdoc("nosweatTotpStep" -> bdoc("$exists" -> false))
                  )
                ),
                bdoc("$set" -> bdoc("nosweatTotpStep" -> step))
              )
            case None if token.replace("-", "").matches("(?i)[0-9a-f]{32}") =>
              val hash = recoveryHash(token)
              identityUpdate(
                bdoc("_id" -> user.id, UserFields.totpSecret -> secret.secret, "nosweatRecovery" -> hash),
                bdoc("$pull" -> bdoc("nosweatRecovery" -> hash))
              )
            case _ => fuccess(false)
          consumed.map(ok => requireThat(ok, 401, "Invalid or already used authentication code"))

  def enableSecondFactor(user: UserModel, base32: String, token: String): Fu[List[String]] =
    import lila.user.TotpSecret.totp
    requireThat(user.totpSecret.isEmpty, 409, "Two-factor authentication is already enabled")
    requireThat(base32.matches("[A-Z2-7]{32}"), 400, "Invalid authenticator secret")
    val secret = lila.user.TotpSecret.decode(base32)
    factorRateLimit(user).flatMap: _ =>
      val period = System.currentTimeMillis() / 30000
      val step = List(0L, -1L, 1L).map(period + _).find(n => secret.totp(n).value == token)
      requireThat(step.isDefined && token.matches("[0-9]{6}"), 400, "Enter a valid authenticator code")
      val codes = List.fill(8)(
        java.util.HexFormat
          .of()
          .formatHex(scalalib.SecureRandom.nextBytes(16))
          .grouped(8)
          .mkString("-")
      )
      identityUpdate(
        bdoc("_id" -> user.id, UserFields.totpSecret -> bdoc("$exists" -> false)),
        bdoc(
          "$set" -> bdoc(
            UserFields.totpSecret -> secret.secret,
            "nosweatTotpStep" -> step.get,
            "nosweatRecovery" -> codes.map(recoveryHash)
          )
        )
      ).map: saved =>
        requireThat(saved, 409, "Two-factor authentication is already enabled")
        codes

  def disableSecondFactor(user: UserModel, token: Option[String]): Funit =
    requireThat(user.totpSecret.isDefined, 409, "Two-factor authentication is not enabled")
    checkSecondFactor(user, token).flatMap: _ =>
      identityUpdate(
        bdoc("_id" -> user.id, UserFields.totpSecret -> user.totpSecret.get.secret),
        bdoc(
          "$unset" -> bdoc(
            UserFields.totpSecret -> true,
            "nosweatTotpStep" -> true,
            "nosweatRecovery" -> true
          )
        )
      ).map(ok => requireThat(ok, 409, "Security settings changed. Reload this page."))

  private def current(): Fu[List[(Bdoc, GameModel)]] =
    records
      .find(bdoc("state" -> "active"))
      .cursor[Bdoc]()
      .list(100)
      .flatMap: docs =>
        docs
          .traverse: doc =>
            env.round.proxyRepo
              .game(doc.getAsOpt[GameId]("_id").get)
              .flatMap:
                case Some(game) if game.playable => fuccess((doc -> game).some)
                case _ =>
                  connectedBots.remove(doc.getAsOpt[GameId]("_id").get)
                  records.update
                    .one(bid(doc.getAsOpt[GameId]("_id").get), set("state" -> "finished"))
                    .map(_ => none)
          .map(_.flatten)

  def play(user: Option[UserModel], guest: String, data: JsValue): Fu[JsObject] = queue:
    val guestHash = java.security.MessageDigest
      .getInstance("SHA-256")
      .digest(guest.getBytes(java.nio.charset.StandardCharsets.UTF_8))
      .map(b => f"${b & 0xff}%02x")
      .mkString
    for
      _ <- ready
      identity <- user.fold(fuTrue)(isNostr)
      _ = requireThat(identity && !user.exists(_.isBot), 403, "Sign in with Nostr first")
      _ = requireThat((data \ "bot").toOption.isEmpty, 400, "Opponents are assigned by the pool")
      games <- current()
      existing = games.find: (doc, _) =>
        user.fold(doc.getAsOpt[String]("guest").contains(guestHash))(u =>
          doc.getAsOpt[UserId]("human").contains(u.id)
        )
      result <- existing match
        case Some((doc, game)) =>
          fuccess(playerLink(game, Color.fromWhite(doc.getAsOpt[String]("humanColor").contains("white"))))
        case None =>
          requireThat(games.size < 2, 503, "The playing pool is full. Please try again shortly.")
          val mode = (data \ "timeMode").asOpt[String].getOrElse("realTime")
          requireThat(
            Set("realTime", "correspondence", "unlimited").contains(mode),
            400,
            "Invalid time control"
          )
          val minutes = (data \ "minutes").asOpt[Double].getOrElse(5d)
          val increment = (data \ "increment").asOpt[Int].getOrElse(3)
          requireThat(
            lila.setup.HookConfig.validateTime(minutes) &&
              lila.setup.HookConfig.validateIncrement(Clock.IncrementSeconds(increment)) &&
              (mode != "realTime" || minutes * 60 + increment > 0),
            400,
            "Invalid clock"
          )
          val days = (data \ "days").asOpt[Int].getOrElse(2)
          requireThat(Set(1, 2, 3, 5, 7, 10, 14).contains(days), 400, "Invalid correspondence time")
          val clock = Option.when(mode == "realTime")(
            Clock.Config(Clock.LimitSeconds((minutes * 60).toInt), Clock.IncrementSeconds(increment))
          )
          val perfKey = lila.rating.PerfType(chess.variant.Standard, chess.Speed(clock)).key
          val rated = user.isDefined && mode != "unlimited" && (data \ "rated").asOpt[Boolean].getOrElse(true)
          val busy = games.flatMap(_._1.getAsOpt[UserId]("bot")).toSet
          for
            human <- user.traverse(u => env.user.api.byIdWithPerf(u.id, perfKey)).map(_.flatten)
            opponents <- roster.traverse(b => env.user.api.byIdWithPerf(botId(b), perfKey))
            rating = human.fold(1500)(_.perf.intRating.value)
            eligible = opponents.flatten.filter(o =>
              o.user.isBot && !busy(o.user.id) &&
                math.abs(o.perf.intRating.value - rating) <= 200
            )
            _ = requireThat(
              eligible.nonEmpty,
              503,
              "No opponent within 200 rating points is available. Please try again shortly."
            )
            opponent = eligible(scalalib.SecureRandom.nextInt(eligible.size))
            bot = roster.find(b => botId(b) == opponent.user.id).get
            slug = (bot \ "id").as[String]
            frozen <- adapter("/freeze", Json.obj("bot" -> slug))
            policy = frozen.as[JsObject] ++ Json.obj("rated" -> rated)
            requestedColor = (data \ "color").asOpt[String].getOrElse("random")
            _ = requireThat(Set("random", "white", "black").contains(requestedColor), 400, "Invalid color")
            humanColor = Color.fromWhite(
              if requestedColor == "random" then scalalib.SecureRandom.nextInt(2) == 0
              else requestedColor == "white"
            )
            id <- env.game.idGenerator.game
            game = lila.core.game
              .newGame(
                chess = chess.Game(
                  position = chess.variant.Standard.initialPosition,
                  clock = clock.map(_.toClock.start)
                ),
                players =
                  ByColor(c => lila.game.Player.make(c, if c == humanColor then human else opponent.some)),
                rated = Rated(rated),
                source = Source.Pool,
                pgnImport = None,
                daysPerTurn = Option.when(mode == "correspondence")(scalalib.model.Days(days)),
                rules = Set(GameRule.noRematch, GameRule.noGiveTime, GameRule.noClaimWin)
              )
              .withId(id)
              .start
            _ <- records.insert.one(
              bdoc(
                "_id" -> id,
                "human" -> user.map(_.id),
                "guest" -> Option.when(user.isEmpty)(guestHash),
                "humanColor" -> humanColor.name,
                "bot" -> botId(bot),
                "slug" -> slug,
                "state" -> "reserved",
                "rated" -> rated,
                "snapshot" -> Json.stringify(policy),
                "createdAt" -> nowInstant,
                "control" -> clock.fold(mode)(_.show),
                "matchedRating" -> rating,
                "opponentRating" -> opponent.perf.intRating.value
              )
            )
            _ <- env.game.gameRepo.insertDenormalized(game)
            _ <- env.round.onStart.exec(id)
            _ <- records.update.one(bid(id), set("state" -> "active"))
          yield playerLink(game, humanColor)
    yield result

  private def playerLink(game: GameModel, color: Color): JsObject =
    Json.obj(
      "id" -> game.id.value,
      "url" -> s"/${game.fullIdOf(color).value}",
      "rated" -> game.rated.yes,
      "anonymous" -> game.players(color).userId.isEmpty
    )

  def games(instance: Option[String]): Fu[JsValue] =
    val restarted = instance
      .filter(_.matches("[0-9a-f-]{36}"))
      .exists: next =>
        lastPoll.set(System.currentTimeMillis())
        val previous = adapterInstance.getAndSet(next)
        previous.nonEmpty && previous != next
    if System.currentTimeMillis() - lastOnline.get() > 5000 then
      lastOnline.set(System.currentTimeMillis())
      roster.foreach(bot => env.bot.onlineApiUsers.setOnline(botId(bot)))
    val recover = if !restarted then funit
    else
      ready
        .flatMap(_ => current())
        .flatMap: games =>
          games.foldLeft(funit)((prev, entry) =>
            prev.flatMap(_ => failGame(entry._2.id, "maia_adapter_restart"))
          )
    ready
      .flatMap(_ => recover)
      .flatMap(_ => current())
      .flatMap: games =>
        games
          .traverse: (doc, game) =>
            env.bot.jsonView
              .gameState(WithInitialFen(game, None))
              .map: state =>
                val bot = doc.getAsOpt[UserId]("bot").get
                if connectedBots.add(game.id) then
                  env.round.roundApi.tell(
                    game.id,
                    lila.core.round.RoundBus.BotConnected(game.player(bot).get.color, true)
                  )
                Json.obj(
                  "id" -> game.id.value,
                  "ply" -> game.ply.value,
                  "botToMove" -> game.player.userId.contains(bot),
                  "botColor" -> game.player(bot).get.color.name,
                  "policy" -> Json.parse(doc.getAsOpt[String]("snapshot").get),
                  "state" -> state
                )
          .map(Json.toJson(_))

  def move(id: GameId, ply: Int, uci: String, timing: JsObject): Funit =
    for
      record <- records.byId[Bdoc](id)
      doc = record.getOrElse(throw NoSweatError(404, "No club game"))
      botId = doc.getAsOpt[UserId]("bot").get
      bot <- env.user.repo.byId(botId)
      pov <- env.round.proxyRepo.pov(id, botId)
      p = pov.getOrElse(throw NoSweatError(404, "No bot seat"))
      _ = requireThat(
        doc.getAsOpt[String]("state").contains("active") && p.game.playable &&
          p.game.ply.value == ply && p.isMyTurn && bot.exists(_.isBot),
        409,
        "Game position changed"
      )
      _ <- env.bot.player.apply(p, uci, Some(false))(using Me(bot.get))
      _ <- records.update.one(
        bid(id),
        set(
          s"moves.$ply" -> Json.stringify(
            Json.obj("move" -> uci, "timing" -> timing, "at" -> nowInstant.toString)
          )
        )
      )
    yield ()

  def failGame(id: GameId, reason: String): Funit =
    records
      .byId[Bdoc](id)
      .flatMap:
        case None => funit
        case Some(doc) if !doc.getAsOpt[String]("state").exists(Set("active", "reserved").contains) => funit
        case Some(_) =>
          env.round.proxyRepo
            .game(id)
            .flatMap:
              case Some(game) if !game.playable =>
                connectedBots.remove(id)
                records.update.one(bid(id), set("state" -> "finished")).void
              case _ =>
                connectedBots.remove(id)
                env.round.roundApi.tell(id, lila.core.round.RoundBus.AbortForce)
                records.update
                  .one(bid(id), set("state" -> "service_failure", "failure" -> reason.take(80)))
                  .void

  def details(id: GameId, user: UserModel): Fu[Option[JsValue]] =
    records
      .one[Bdoc](bid(id) ++ bdoc("human" -> user.id))
      .map2: doc =>
        Json.obj(
          "id" -> id.value,
          "state" -> doc.getAsOpt[String]("state"),
          "failure" -> doc.getAsOpt[String]("failure"),
          "policy" -> (Json.parse(doc.getAsOpt[String]("snapshot").get).as[JsObject] - "samplingSeed")
        )
