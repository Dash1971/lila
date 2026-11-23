package controllers

import play.api.libs.json.*
import play.api.mvc.*
import scala.util.control.NonFatal
import lila.app.{ *, given }
import lila.security.IsPwned

final class NoSweat(env: Env) extends LilaController(env):
  private given lila.core.config.RateLimit = env.net.rateLimit
  private val challengeLimit = lila.memo.RateLimit[String](30, 1.minute, "mute.auth.challenge")
  private val loginLimit = lila.memo.RateLimit[String](30, 1.minute, "mute.auth.login")
  // Match the native signup policy for players sharing a school or mobile network.
  private val signupLimit = lila.memo.RateLimit.composite[String]("mute.auth.signup")(
    ("fast", 10, 10.minutes),
    ("slow", 150, 1.day)
  )

  private def authNetwork(using Context): String =
    val ip = ctx.ip.value
    if ip.contains(":") then
      scala.util
        .Try(io.mola.galimatias.IPv6Address.parseIPv6Address(ip).toInetAddress)
        .toOption
        .fold(ip)(addr => java.util.HexFormat.of().formatHex(addr.getAddress.take(8)))
    else ip

  private def checkAuthLimit(limiter: lila.memo.RateLimit.RateLimiter[String])(using Context): Unit =
    val network = authNetwork
    if !limiter.synchronized(limiter.hit(network)) then
      throw NoSweatError(429, lila.core.i18n.I18nKey.unchecked("muteAuthPleaseWait").txt())

  private val club = env.noSweat
  private def handle(f: => Fu[Result]): Fu[Result] =
    def error(e: Throwable): Result = e match
      case lila.game.NoSweatGameAdmission.Paused =>
        ServiceUnavailable(Json.obj("error" -> e.getMessage)).withHeaders("Cache-Control" -> "no-store")
      case NoSweatError(status, reason, code) =>
        Status(status)(Json.obj("error" -> reason) ++ code.fold(Json.obj())(c => Json.obj("code" -> c)))
          .withHeaders("Cache-Control" -> "no-store")
      case _: JsResultException => BadRequest(Json.obj("error" -> "Invalid request"))
      case _ =>
        lila.log("nosweat").error("Club adapter request failed", e)
        ServiceUnavailable(Json.obj("error" -> "The club is temporarily unavailable"))
    try
      if !club.enabled then fuccess(NotFound)
      else f.map(_.withHeaders("Cache-Control" -> "no-store")).recover { case NonFatal(e) => error(e) }
    catch case NonFatal(e) => fuccess(error(e))

  private def sameOrigin(using req: RequestHeader): Unit =
    if !req.headers.get("Origin").contains(env.net.baseUrl.value) then
      throw NoSweatError(403, "Origin mismatch")

  private def internal(using req: RequestHeader): Unit =
    if !club.internalAuthorized(req.headers.get("Authorization")) then
      throw NoSweatError(403, "Private adapter authentication required")

  def info(key: String) = Open:
    if club.enabled then Ok.page(views.noSweatInfo(key)) else fuccess(NotFound)

  def unsupported = Open:
    if club.enabled then NotImplemented.page(views.noSweatUnsupported()) else fuccess(NotFound)

  def home = Open:
    fuccess(Redirect("/"))

  def nostrProfile(npub: String) = Open:
    handle:
      lila.core.NostrName.pubkeyFromNpub(npub) match
        case None => fuccess(NotFound)
        case Some(key) =>
          env.user.repo
            .byNostr(key)
            .map:
              case Some(user) if user.enabled.yes => Redirect(routes.User.show(user.username))
              case _ => NotFound

  def loginPage = Open:
    handle(Ok.page(views.noSweatLogin()))

  def roster = Open:
    handle(club.ready.map(_ => Ok(Json.toJson(club.roster))))

  def me = Open:
    handle(
      fuccess(
        Ok(
          Json.obj(
            "user" -> ctx.me.map(u => Json.obj("id" -> u.userId.value, "username" -> u.username.value))
          )
        )
      )
    )

  def challenge = OpenBodyOf(parse.tolerantText(4096)): context ?=>
    handle:
      sameOrigin
      checkAuthLimit(challengeLimit)
      club.adapter("/challenge", Json.parse(context.body.body)).map(Ok(_))

  def login = OpenBodyOf(parse.tolerantText(16384)): context ?=>
    handle:
      sameOrigin
      checkAuthLimit(loginLimit)
      val raw = context.body.body
      if (Json.parse(raw) \ "action").asOpt[String].exists(_ != "login") then
        throw NoSweatError(401, "Login signature required")
      for
        verified <- club.adapter(
          "/verify",
          Json.obj("authorization" -> context.req.headers.get("Authorization"), "rawBody" -> raw)
        )
        user <- club.nostrUser(
          (verified \ "pubkey").as[String],
          (Json.parse(raw) \ "username").asOpt[String]
        )(checkAuthLimit(signupLimit))
        _ <- club.checkSecondFactor(user, (Json.parse(raw) \ "twoFactorToken").asOpt[String])
        session <- env.security.api.saveAuthentication(user.id, None, IsPwned(false))
      yield Ok(Json.obj("username" -> user.username.value, "url" -> "/"))
        .withCookies(env.security.lilaCookie.withSession(remember = true) { s =>
          s + (env.security.api.sessionIdKey -> session.value)
        })

  def patronPage = Open:
    handle:
      ctx.me
        .fold(fuccess(Option.empty[String]))(u => club.nostrPublicKey(u.value))
        .flatMap: pubkey =>
          Ok.page(views.noSweatPatron(pubkey))

  def patronPending = Auth: context ?=>
    me ?=>
      handle:
        for
          pending <- club.patronPending(me.value)
          paidAt <- club.patronLastPaidAt(me.value)
        yield
          val result = Ok(pending._1).withHeaders(
            "X-Mute-Patron-Dismissed" -> pending._2.mkString(","),
            "Cache-Control" -> "no-store"
          )
          paidAt.fold(result)(at => result.withHeaders("X-Mute-Patron-Paid-At" -> at.toString))

  def patronInvoice = AuthBody(parse.tolerantText(8192)): context ?=>
    me ?=>
      handle:
        sameOrigin
        club.patronInvoice(me.value, Json.parse(context.body.body)).map(Ok(_))

  def patronDismiss = AuthBody(parse.tolerantText(256)): context ?=>
    me ?=>
      handle:
        sameOrigin
        club.patronDismiss(me.value, Json.parse(context.body.body)).map(Ok(_))

  def patronReceipt = AuthBody(parse.tolerantText(16384)): context ?=>
    me ?=>
      handle:
        sameOrigin
        club.patronReceipt(me.value, Json.parse(context.body.body)).map(Ok(_))

  def securityPage = Auth: context ?=>
    me ?=> handle(Ok.page(views.noSweatSecurity(me.value)))

  def nostrKeys = Auth: context ?=>
    me ?=> handle(Ok.page(views.noSweatNostr(me.value)).map(_.withHeaders("Cache-Control" -> "no-store")))

  def securityApply = AuthBody(parse.tolerantText(4096)): context ?=>
    me ?=>
      handle:
        sameOrigin
        val raw = context.body.body
        val data = Json.parse(raw)
        val action = (data \ "action").as[String]
        if !Set("enable-two-factor", "disable-two-factor").contains(action) then
          throw NoSweatError(400, "Invalid security action")
        for
          verified <- club.adapter(
            "/verify",
            Json.obj(
              "authorization" -> context.req.headers.get("Authorization"),
              "rawBody" -> raw
            )
          )
          _ = if !(verified \ "action").asOpt[String].contains(action) then
            throw NoSweatError(401, "Security action signature required")
          identity <- env.user.repo.byNostr((verified \ "pubkey").as[String])
          user = identity
            .filter(_.id == me.userId)
            .getOrElse(throw NoSweatError(403, "Sign with this account’s Nostr key", Some("wrong_signer")))
          codes <-
            if action == "enable-two-factor" then
              club.enableSecondFactor(
                user,
                (data \ "secret").as[String],
                (data \ "twoFactorToken").as[String]
              )
            else
              club
                .disableSecondFactor(user, (data \ "twoFactorToken").asOpt[String])
                .inject(List.empty[String])
          _ <- env.security.store.closeAllSessionsOf(user.id)
          session <- env.security.api.saveAuthentication(user.id, None, IsPwned(false))
        yield Ok(Json.obj("enabled" -> (action == "enable-two-factor"), "recoveryCodes" -> codes))
          .withCookies(env.security.lilaCookie.withSession(remember = true) { s =>
            s + (env.security.api.sessionIdKey -> session.value)
          })

  def play = OpenBodyOf(parse.tolerantText(4096)): context ?=>
    handle:
      sameOrigin
      val submitted = Json.parse(context.body.body)
      val setup: Fu[JsValue] = (submitted \ "like")
        .asOpt[String]
        .fold(fuccess(submitted)): id =>
          if !id.matches("[A-Za-z0-9]{8}") then throw NoSweatError(400, "Invalid previous game")
          env.game.gameRepo
            .game(GameId(id))
            .map: previous =>
              val game = previous.getOrElse(throw NoSweatError(404, "Previous game not found"))
              game.clock.fold[JsValue](
                Json.obj(
                  "timeMode" -> (if game.daysPerTurn.isDefined then "correspondence" else "unlimited"),
                  "days" -> game.daysPerTurn.fold(2)(_.value),
                  "rated" -> game.rated.yes
                )
              )(clock =>
                Json.obj(
                  "minutes" -> (clock.config.limitSeconds.value / 60d),
                  "increment" -> clock.config.incrementSeconds.value,
                  "rated" -> game.rated.yes
                )
              )
      setup.flatMap: data =>
        if (data \ "timeMode").asOpt[String].exists(_ != "realTime") then
          fuccess(BadRequest(Json.obj("error" -> lila.core.i18n.I18nKey.unchecked("muteRealTimeOnly").txt())))
        else if (data \ "minutes").asOpt[Double].exists(_ < 1d) then
          fuccess(BadRequest(Json.obj("error" -> lila.core.i18n.I18nKey.unchecked("muteMinimumClock").txt())))
        else
          env.security.lilaCookie.ensureAndGet: sid =>
            club
              .play(context.user, sid.value, data)
              .map: game =>
                val result = Ok(game)
                if (game \ "anonymous").as[Boolean] then
                  result.withCookies(
                    env.security.lilaCookie.cookie(
                      lila.game.AnonCookie.name,
                      (game \ "url").as[String].takeRight(4),
                      maxAge = lila.game.AnonCookie.maxAge.some,
                      httpOnly = false.some
                    )
                  )
                else result

  def experimentStatus = Anon:
    handle:
      internal
      env.noSweatStudy.status(false).map(Ok(_))

  def experimentRatings = Anon:
    handle:
      internal
      env.noSweatStudy.status(true).map(Ok(_))

  def experimentCreate = AnonBodyOf(parse.tolerantText(16384)): body =>
    handle:
      internal
      env.noSweatStudy.create(Json.parse(body)).map(Ok(_))

  def experimentStop = AnonBodyOf(parse.tolerantText(4096)): body =>
    handle:
      internal
      env.noSweatStudy.stop((Json.parse(body) \ "runId").as[String]).map(_ => Ok(Json.obj("ok" -> true)))

  def experimentMove(id: GameId) = AnonBodyOf(parse.tolerantText(4096)): body =>
    handle:
      internal
      val json = Json.parse(body)
      env.noSweatStudy
        .move(id, (json \ "ply").as[Int], (json \ "move").as[String])
        .map(_ => Ok(Json.obj("ok" -> true)))

  def activityStatus = Anon:
    handle:
      internal
      club.activityStatus.map(Ok(_))

  def activityPause = AnonBodyOf(parse.tolerantText(4096)): body =>
    handle:
      internal
      club.pauseActivity((Json.parse(body) \ "paused").as[Boolean]).map(Ok(_))

  def games = Anon:
    handle:
      internal
      club.games(req.headers.get("X-NoSweat-Instance")).map(Ok(_))

  def move(id: GameId) = AnonBodyOf(parse.tolerantText(4096)): body =>
    handle:
      internal
      val json = Json.parse(body)
      club
        .move(
          id,
          (json \ "ply").as[Int],
          (json \ "move").as[String],
          (json \ "timing").asOpt[JsObject].getOrElse(Json.obj())
        )
        .map(_ => Ok(Json.obj("ok" -> true)))

  def failure(id: GameId) = AnonBodyOf(parse.tolerantText(4096)): body =>
    handle:
      internal
      club.failGame(id, "maia_service_failure").map(_ => Ok(Json.obj("ok" -> true)))

  def game(id: GameId) = Auth: context ?=>
    user ?=> handle(club.details(id, user.value).map(_.fold(NotFound)(Ok(_))))
