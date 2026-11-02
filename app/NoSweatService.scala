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

final case class NoSweatError(status: Int, reason: String, code: Option[String] = None)
    extends RuntimeException(reason)

/** Identity and bot admission adapters. Round state remains authoritative in Lila. */
final class NoSweatService(env: Env, ws: StandaloneWSClient)(using ec: Executor):
  private given Scheduler = env.system.scheduler
  val enabled = env.config.getOptional[Boolean]("nosweat.enabled").getOrElse(false)
  private lazy val adapterUrl = env.config.get[String]("nosweat.adapterUrl")
  private lazy val token = env.config.get[String]("nosweat.adapterToken")
  private val records = env.mongo.mainDb(CollName("nosweat_game"))
  private val lastPoll = AtomicLong(System.currentTimeMillis())
  private val adapterInstance = AtomicReference("")
  private val connectedBots = new java.util.concurrent.ConcurrentHashMap[GameId, Set[Color]]()
  private val activityEnabled = env.config.getOptional[Boolean]("nosweat.activity.enabled").getOrElse(false)
  require(
    !activityEnabled || !env.config.getOptional[Boolean]("nosweat.study.enabled").getOrElse(false),
    "Automatic public play and bounded studies cannot run together"
  )
  val normalCapacity = if activityEnabled then lila.bot.PublicBotActivity.capacity else 2
  private val activityState = env.mongo.mainDb(CollName("nosweat_activity"))
  private val nextActivityAdmission = AtomicLong(0)
  private def automatic(doc: Bdoc): Boolean = doc.getAsOpt[Boolean]("automatic").contains(true)
  private def occupied(doc: Bdoc): Set[UserId] =
    if automatic(doc) then List("white", "black").flatMap(doc.getAsOpt[UserId]).toSet
    else doc.getAsOpt[UserId]("bot").toSet
  private def disconnectBot(id: GameId): Unit =
    Option(connectedBots.remove(id)).foreach: colors =>
      colors.foreach: color =>
        lila.common.Bus.pub(lila.core.round.Tell(id, lila.core.round.RoundBus.BotConnected(color, false)))
  private[app] val queue = scalalib.actor.AsyncActorSequencer(
    maxSize = Max(32),
    timeout = 20.seconds,
    "noSweatAdmission",
    lila.mon.asyncActorMonitor.full
  )
  lazy val roster: List[JsObject] = NoSweatBotCatalog.validate(
    Json
      .parse(
        Files.readString(env.getFile.exec("public/nosweat-roster.json").toPath)
      )
      .as[List[JsObject]]
  )
  private lazy val botAliases =
    val path = env.getFile.exec("public/nosweat-bot-aliases.json").toPath
    val values = if Files.exists(path) then Json.parse(Files.readString(path)).as[Map[String, String]]
    else Map.empty[String, String]
    NoSweatBotCatalog.aliases(values, roster)
  private def botId(bot: JsObject): UserId = UserId((bot \ "username").as[String].toLowerCase)
  private lazy val botsById = roster.map(bot => botId(bot) -> bot).toMap
  private lazy val botIds = botsById.keySet
  private lazy val botPool = botIds.toVector
  private val ratingCatalog = new lila.bot.PoolCatalog
  private val poolKeys = List(
    PerfKey.ultraBullet,
    PerfKey.bullet,
    PerfKey.blitz,
    PerfKey.rapid,
    PerfKey.classical,
    PerfKey.correspondence
  )

  def botPolicy(id: UserId): Option[JsObject] =
    Option
      .when(enabled)(botsById.get(id))
      .flatten
      .filter(bot => (bot \ "personality").asOpt[JsObject].isDefined)

  private def reloadBotRatings(): Funit =
    env.user.perfsRepo
      .idsMap(botIds.toList, _.pri)
      .map: perfs =>
        requireThat(perfs.size == botIds.size, 503, "Bot rating data is unavailable")
        ratingCatalog.replace(perfs.map: (id, ps) =>
          id -> poolKeys.map(key => key -> ps(key).intRating.value).toMap)

  private def refreshBotRating(id: UserId): Funit =
    env.user.perfsRepo
      .perfsOf(id)
      .map: ps =>
        ratingCatalog.update(id, poolKeys.map(key => key -> ps(key).intRating.value).toMap)

  private def poolOpponent(key: PerfKey, rating: Int, busy: Set[UserId]): Fu[lila.core.user.WithPerf] =
    def pick(excluded: Set[UserId], retries: Int): Fu[lila.core.user.WithPerf] =
      val eligible = ratingCatalog.within(key, rating, excluded)
      if eligible.isEmpty || retries == 0 then
        fufail(
          NoSweatError(503, "No opponent within 200 rating points is available. Please try again shortly.")
        )
      else
        val id = eligible(scalalib.SecureRandom.nextInt(eligible.size))
        env.user.api
          .byIdWithPerf(id, key)
          .flatMap:
            case Some(opponent)
                if opponent.user.isBot && opponent.user.enabled.yes && math.abs(
                  opponent.perf.intRating.value - rating
                ) <= 200 =>
              fuccess(opponent)
            case Some(opponent) if opponent.user.isBot && opponent.user.enabled.yes =>
              refreshBotRating(id).flatMap(_ => pick(excluded + id, retries - 1))
            case _ =>
              ratingCatalog.update(id, Map.empty)
              pick(excluded + id, retries - 1)
    pick(busy, 4)
  private def requireThat(ok: Boolean, status: Int, message: String): Unit =
    if !ok then throw NoSweatError(status, message)

  def internalAuthorized(header: Option[String]): Boolean = enabled && header.exists: value =>
    java.security.MessageDigest.isEqual(
      value.getBytes(java.nio.charset.StandardCharsets.UTF_8),
      s"Bearer $token".getBytes(java.nio.charset.StandardCharsets.UTF_8)
    )

  def adapter(
      path: String,
      body: JsValue,
      timeout: scala.concurrent.duration.FiniteDuration = 5.seconds
  ): Fu[JsValue] =
    ws.url(s"$adapterUrl$path")
      .withHttpHeaders("Authorization" -> s"Bearer $token", "Content-Type" -> "application/json")
      .withRequestTimeout(timeout)
      .post(Json.stringify(body))
      .map: response =>
        val result = Json.parse(response.body)
        if response.status != 200 then
          throw NoSweatError(
            response.status,
            (result \ "error").asOpt[String].getOrElse("Adapter unavailable")
          )
        result

  private val donations = env.mongo.mainDb(CollName("nosweat_donation"))

  def nostrPublicKey(user: UserModel): Fu[Option[String]] =
    env.user.repo.withColl(_.byId[Bdoc](user.id)).map(_.flatMap(_.getAsOpt[String]("nostr")))

  def patronPending(user: UserModel): Fu[JsValue] =
    donations
      .find(bdoc("userId" -> user.id, "paid" -> false, "expiresAt" -> bdoc("$gt" -> nowInstant)))
      .sort(sort.desc("createdAt"))
      .cursor[Bdoc]()
      .list(5)
      .map: docs =>
        Json.toJson(docs.flatMap(_.getAsOpt[String]("invoice")))

  def patronInvoice(user: UserModel, data: JsValue): Fu[JsValue] =
    for
      pubkey <- nostrPublicKey(user)
      _ = requireThat(
        pubkey.contains((data \ "request" \ "pubkey").as[String]),
        403,
        "Sign with this account’s Nostr key"
      )
      now = System.currentTimeMillis()
      _ <- identityUpdate(
        bdoc(
          "_id" -> user.id,
          "$or" -> List(
            bdoc("nosweatInvoiceWindow" -> bdoc("$lt" -> (now - 60000))),
            bdoc("nosweatInvoiceWindow" -> bdoc("$exists" -> false))
          )
        ),
        bdoc("$set" -> bdoc("nosweatInvoiceWindow" -> now, "nosweatInvoiceAttempts" -> 0))
      )
      allowed <- identityUpdate(
        bdoc("_id" -> user.id, "nosweatInvoiceAttempts" -> bdoc("$lt" -> 5)),
        bdoc("$inc" -> bdoc("nosweatInvoiceAttempts" -> 1))
      )
      _ = requireThat(allowed, 429, "Please wait a minute before creating another invoice")
      result <- adapter("/patron/invoice", data, 20.seconds)
      _ = requireThat(pubkey.contains((result \ "donor").as[String]), 403, "Wrong payment sender")
      createdAt = java.time.Instant.ofEpochSecond((result \ "createdAt").as[Long])
      _ <- donations.insert.one(
        bdoc(
          "_id" -> (result \ "paymentHash").as[String],
          "userId" -> user.id,
          "invoice" -> (result \ "invoice").as[String],
          "donor" -> (result \ "donor").as[String],
          "requestId" -> (result \ "requestId").as[String],
          "createdAt" -> createdAt,
          "expiresAt" -> createdAt.plusSeconds((result \ "expiresIn").as[Long]),
          "paid" -> false
        )
      )
    yield result

  def patronReceipt(user: UserModel, data: JsValue): Fu[JsValue] =
    for
      checked <- adapter("/patron/receipt", data)
      pubkey <- nostrPublicKey(user)
      _ = requireThat(
        pubkey.contains((checked \ "donor").as[String]),
        403,
        "This donation belongs to another account"
      )
      payment = (checked \ "paymentHash").as[String]
      recorded <- donations.byId[Bdoc](payment)
      doc = recorded.getOrElse(
        throw NoSweatError(
          400,
          "No matching donation invoice. Create an invoice on this page for patron wings."
        )
      )
      _ = requireThat(
        doc.getAsOpt[UserId]("userId").contains(user.id) &&
          doc.getAsOpt[String]("invoice").contains((checked \ "invoice").as[String]) &&
          doc.getAsOpt[String]("requestId").contains((checked \ "requestId").as[String]),
        400,
        "Receipt does not match this donation"
      )
      until = java.time.Instant.ofEpochSecond((checked \ "paidAt").as[Long]).plusSeconds(30L * 86400)
      _ <- env.plan.api.grantNoSweatZap(user, until)
      _ <- donations.update.one(
        bid(payment),
        set("paid" -> true, "receiptId" -> (checked \ "receiptId").as[String], "patronUntil" -> until)
      )
    yield Json.obj("confirmed" -> true, "until" -> until.toString)

  private def provisionBot(bot: JsObject): Funit =
    val name = UserName((bot \ "username").as[String])
    for
      existing <- env.user.repo.byId(name.id)
      loaded <- existing.fold(env.user.repo.createNoSweatBot(name, NoSweatBotCatalog.initialIdentity(bot)))(
        u => fuccess(u.some)
      )
      user = loaded.getOrElse(throw NoSweatError(503, "Could not provision bot"))
      doc <- env.user.repo.withColl(_.byId[Bdoc](name.id))
      _ = requireThat(
        user.isBot && doc.exists(_.getAsOpt[Boolean]("noSweatBot").contains(true)),
        503,
        "A roster name is occupied by an account outside the club roster"
      )
      _ = requireThat(
        NoSweatBotCatalog
          .reusable(bot, existing.isDefined, doc.flatMap(_.getAsOpt[String]("noSweatCatalogIdentity"))),
        503,
        "A catalog identity is occupied by an account from another initialization"
      )
      _ <-
        if doc.exists(_.getAsOpt[String]("noSweatSeedVersion").isDefined) then funit
        else
          List(PerfKey.blitz, PerfKey.rapid)
            .foldLeft(funit): (prev, key) =>
              prev.flatMap: _ =>
                env.user.perfsRepo.setPerf(user.id, key, NoSweatBotCatalog.seededPerf(bot, key))
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
                env.user.perfsRepo.setPerf(user.id, key, NoSweatBotCatalog.seededPerf(bot, key))
            .flatMap(_ =>
              env.user.repo.withColl(
                _.update.one(bid(name.id), set("noSweatPoolSeedVersion" -> "pool-priors-v1")).void
              )
            )
      _ <- NoSweatBotCatalog
        .publicName(bot, botAliases)
        .fold(funit): alias =>
          if NoSweatBotCatalog.aliasEligible(user.profile.flatMap(_.displayName), name.value, alias) then
            env.user.repo.withColl:
              _.update
                .one(
                  bid(name.id) ++ bdoc("noSweatBot" -> true) ++ or(
                    bdoc(s"${UserFields.profile}.displayName".exists(false)),
                    bdoc(s"${UserFields.profile}.displayName" -> name.value),
                    bdoc(s"${UserFields.profile}.displayName" -> alias)
                  ),
                  set(s"${UserFields.profile}.displayName" -> alias)
                )
                .void
          else funit
    yield env.user.lightUserApi.invalidate(user.id)

  private def initialize(): Funit =
    val _ = botAliases
    roster
      .grouped(16)
      .foldLeft(funit)((previous, batch) => previous.flatMap(_ => batch.toList.traverse(provisionBot).void))
      .flatMap(_ => reloadBotRatings())
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
    lila.common.Bus.sub[lila.core.game.FinishGame]: finish =>
      disconnectBot(finish.game.id)
      finish.game.userIds
        .filter(botIds)
        .foreach: id =>
          queue(ready.flatMap(_ => refreshBotRating(id))).failed.foreach: error =>
            lila.log("nosweat").error("Could not refresh bot rating catalog", error)

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
      if token.isEmpty then
        fufail(NoSweatError(401, "Enter your authenticator or recovery code", Some("two_factor_required")))
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

  def currentGames: Fu[List[GameModel]] = current().map(_.map(_._2).take(15))

  private[app] def current(): Fu[List[(Bdoc, GameModel)]] =
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
                  disconnectBot(doc.getAsOpt[GameId]("_id").get)
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
      studyBusy <- env.noSweatStudy.busy
      capacity <- env.noSweatStudy.capacity
      existing = games.find: (doc, _) =>
        user.fold(doc.getAsOpt[String]("guest").contains(guestHash))(u =>
          doc.getAsOpt[UserId]("human").contains(u.id)
        )
      result <- existing match
        case Some((doc, game)) =>
          fuccess(playerLink(game, Color.fromWhite(doc.getAsOpt[String]("humanColor").contains("white"))))
        case None =>
          requireThat(
            games.size + studyBusy._1 < capacity,
            503,
            "The playing pool is full. Please try again shortly."
          )
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
          val busy = games.flatMap(g => occupied(g._1)).toSet ++ studyBusy._2
          for
            _ <- env.game.noSweatAdmission.check
            human <- user.traverse(u => env.user.api.byIdWithPerf(u.id, perfKey)).map(_.flatten)
            rating = human.fold(1500)(_.perf.intRating.value)
            opponent <- poolOpponent(perfKey, rating, busy)
            bot = botsById(opponent.user.id)
            slug = (bot \ "id").as[String]
            frozen <- adapter(
              "/freeze",
              Json.obj("bot" -> slug) ++ human.fold(Json.obj())(_ => Json.obj("opponentRating" -> rating))
            )
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

  private def activityPaused: Fu[Boolean] =
    env.game.noSweatAdmission.paused

  def activityStatus: Fu[JsObject] =
    for
      _ <- ready
      paused <- activityPaused
      games <- current()
      nativeActive <- env.game.gameRepo.count(q =>
        q.notFinished ++ bdoc(lila.game.Game.BSONFields.source -> bdoc("$ne" -> Source.Import.id))
      )
      poolPending <- records.countSel(bdoc("state" -> bdoc("$in" -> List("reserved", "active"))))
      studyPending <- env.mongo
        .mainDb(CollName("nosweat_study_game"))
        .countSel(bdoc("state" -> bdoc("$in" -> List("reserved", "active"))))
    yield Json.obj(
      "enabled" -> activityEnabled,
      "scope" -> "all-games",
      "paused" -> paused,
      "active" -> games.count(g => automatic(g._1)),
      "target" -> lila.bot.PublicBotActivity.target,
      "totalActive" -> nativeActive,
      "poolPending" -> poolPending,
      "studyPending" -> studyPending,
      "capacity" -> normalCapacity,
      "drained" -> (nativeActive == 0 && poolPending == 0 && studyPending == 0),
      "draining" -> (paused && (nativeActive > 0 || poolPending > 0 || studyPending > 0))
    )

  // Close every native start, sharing its insertion barrier. Existing native
  // clocks, moves and results continue normally, including while draining.
  def pauseActivity(paused: Boolean): Fu[JsObject] = queue:
    env.game.noSweatAdmission
      .pause(paused)
      .flatMap(_ => activityStatus)

  private def replenishActivity(): Funit =
    val now = System.currentTimeMillis()
    if !activityEnabled || now < nextActivityAdmission.get() then funit
    else
      nextActivityAdmission.set(now + 1000)
      queue:
        for
          paused <- activityPaused
          games <- current()
          _ <-
            if !lila.bot.PublicBotActivity.canAdmit(paused, games.count(g => automatic(g._1)), games.size)
            then funit
            else
              val busy = games.flatMap(g => occupied(g._1)).toSet
              val available = botPool.filterNot(busy)
              if available.size < 2 then funit
              else
                for
                  control <- activityState.byId[Bdoc]("public")
                  admitted = control.flatMap(_.getAsOpt[Long]("admitted")).getOrElse(0L)
                  key = lila.bot.PublicBotActivity.speed(admitted)
                  first = available(scalalib.SecureRandom.nextInt(available.size))
                  whiteOpt <- env.user.api.byIdWithPerf(first, key)
                  _ <- whiteOpt match
                    case Some(white) if white.user.isBot && white.user.enabled.yes =>
                      poolOpponent(key, white.perf.intRating.value, busy + first).flatMap: black =>
                        createAutomatic(white, black, key, admitted)
                    case _ =>
                      ratingCatalog.update(first, Map.empty)
                      funit
                yield ()
        yield ()
          // Admission scarcity or a failed policy freeze must not interrupt move
          // polling for games already in progress. The next normal poll may retry.
      .recover:
        case _: NoSweatError => ()

  private def createAutomatic(
      white: lila.core.user.WithPerf,
      black: lila.core.user.WithPerf,
      key: PerfKey,
      admitted: Long
  ): Funit =
    val blitz = key == PerfKey.blitz
    val clock = Clock.Config(
      Clock.LimitSeconds(if blitz then 300 else 600),
      Clock.IncrementSeconds(if blitz then 3 else 5)
    )
    for
      frozen <- adapter(
        "/freeze-automatic",
        Json.obj(
          "white" -> (botsById(white.user.id) \ "id").as[String],
          "black" -> (botsById(black.user.id) \ "id").as[String]
        )
      )
      _ =
        for (color, bot) <- List("white" -> white, "black" -> black) do
          val policy = frozen \ color
          requireThat(
            (policy \ "version").asOpt[String].contains("public-bot-human-timing-v1") &&
              (policy \ "addedHumanWait").asOpt[Boolean].contains(true) &&
              (policy \ "rated").asOpt[Boolean].contains(true) &&
              (policy \ "production" \ "bot")
                .asOpt[String]
                .contains((botsById(bot.user.id) \ "id").as[String]),
            503,
            "Automatic game policy unavailable"
          )
      id <- env.game.idGenerator.game
      game = lila.core.game
        .newGame(
          chess =
            chess.Game(position = chess.variant.Standard.initialPosition, clock = Some(clock.toClock.start)),
          players = ByColor(c => lila.game.Player.make(c, Some(if c == Color.white then white else black))),
          rated = Rated(true),
          source = Source.Pool,
          pgnImport = None,
          daysPerTurn = None,
          rules = Set(GameRule.noRematch, GameRule.noGiveTime, GameRule.noClaimWin)
        )
        .withId(id)
        .start
      _ <- records.insert.one(
        bdoc(
          "_id" -> id,
          "automatic" -> true,
          "white" -> white.user.id,
          "black" -> black.user.id,
          "state" -> "reserved",
          "rated" -> true,
          "snapshot" -> Json.stringify(frozen),
          "createdAt" -> nowInstant,
          "control" -> clock.show
        )
      )
      _ <- (for
        _ <- env.game.gameRepo.insertDenormalized(game)
        _ <- env.round.onStart.exec(id)
        _ <- records.update.one(bid(id), set("state" -> "active"))
        _ <- activityState.update.one(bid("public"), set("admitted" -> (admitted + 1)), upsert = true)
      yield ()).recoverWith:
        case error => failGame(id, "automatic_admission_failure").flatMap(_ => fufail(error))
    yield ()

  def games(instance: Option[String]): Fu[JsValue] =
    val pollingInstance = instance.filter(_.matches("[0-9a-f-]{36}"))
    val restarted = pollingInstance
      .exists: next =>
        lastPoll.set(System.currentTimeMillis())
        val previous = adapterInstance.getAndSet(next)
        previous.nonEmpty && previous != next
    val recover = if !restarted then funit
    else
      ready
        .flatMap(_ => current())
        .flatMap: games =>
          games.foldLeft(funit)((prev, entry) =>
            prev.flatMap(_ => failGame(entry._2.id, "maia_adapter_restart"))
          )
    ready
      .map(_ => pollingInstance.foreach(_ => env.bot.onlineApiUsers.setManagedOnline(botIds)))
      .flatMap(_ => recover)
      .flatMap(_ => replenishActivity())
      .flatMap(_ => current())
      .flatMap: games =>
        games
          .traverse: (doc, game) =>
            env.bot.jsonView
              .gameState(WithInitialFen(game, None))
              .map: state =>
                val isAutomatic = automatic(doc)
                val bot = if isAutomatic then game.player.userId.get else doc.getAsOpt[UserId]("bot").get
                val colors = if isAutomatic then Color.all.toSet else Set(game.player(bot).get.color)
                if Option(connectedBots.putIfAbsent(game.id, colors)).isEmpty then
                  colors.foreach: color =>
                    lila.common.Bus.pub(
                      lila.core.round.Tell(game.id, lila.core.round.RoundBus.BotConnected(color, true))
                    )
                val snapshot = Json.parse(doc.getAsOpt[String]("snapshot").get)
                val policy = if isAutomatic then (snapshot \ game.turnColor.name).as[JsObject] else snapshot
                Json.obj(
                  "id" -> game.id.value,
                  "ply" -> game.ply.value,
                  "botToMove" -> (isAutomatic || game.player.userId.contains(bot)),
                  "automatic" -> isAutomatic,
                  "botColor" -> game.player(bot).get.color.name,
                  "policy" -> policy,
                  "clock" -> game.clock.map(c =>
                    Json.obj(
                      "initial" -> c.config.limitSeconds.value,
                      "increment" -> c.config.incrementSeconds.value
                    )
                  ),
                  "state" -> state
                )
          .map(Json.toJson(_))

  def move(id: GameId, ply: Int, uci: String, timing: JsObject): Funit =
    for
      record <- records.byId[Bdoc](id)
      doc = record.getOrElse(throw NoSweatError(404, "No club game"))
      game <- env.round.proxyRepo.game(id)
      botId =
        if automatic(doc) then
          game.flatMap(_.player.userId).getOrElse(throw NoSweatError(404, "No automatic bot seat"))
        else doc.getAsOpt[UserId]("bot").get
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
                disconnectBot(id)
                records.update.one(bid(id), set("state" -> "finished")).void
              case _ =>
                disconnectBot(id)
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
