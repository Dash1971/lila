package controllers

import play.api.libs.json.*
import play.api.mvc.*
import scala.util.control.NonFatal
import lila.app.{ *, given }
import lila.security.IsPwned

final class NoSweat(env: Env) extends LilaController(env):
  private val club = env.noSweat
  private def handle(f: => Fu[Result]): Fu[Result] =
    def error(e: Throwable): Result = e match
      case NoSweatError(status, reason) =>
        Status(status)(Json.obj("error" -> reason)).withHeaders("Cache-Control" -> "no-store")
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

  def home = Open:
    fuccess(Redirect("/"))

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
      club.adapter("/challenge", Json.parse(context.body.body)).map(Ok(_))

  def login = OpenBodyOf(parse.tolerantText(16384)): context ?=>
    handle:
      sameOrigin
      val raw = context.body.body
      for
        verified <- club.adapter(
          "/verify",
          Json.obj("authorization" -> context.req.headers.get("Authorization"), "rawBody" -> raw)
        )
        user <- club.nostrUser((verified \ "pubkey").as[String], (Json.parse(raw) \ "username").asOpt[String])
        session <- env.security.api.saveAuthentication(user.id, None, IsPwned(false))
      yield Ok(Json.obj("username" -> user.username.value, "url" -> "/"))
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
