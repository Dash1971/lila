package controllers
import play.api.libs.json.{ JsValue, Json }
import play.api.mvc.*

import lila.app.{ *, given }
import lila.core.i18n.Translate
import lila.insight.{ InsightDimension, InsightMetric, NoSweatInsights }

final class Insight(env: Env) extends LilaController(env):

  def refresh(username: UserStr) = Open: ctx ?=>
    AccessibleApi(username): user =>
      val byMod = isGrantedOpt(_.MarkBooster) || isGrantedOpt(_.MarkEngine)
      if env.noSweat.enabled && (!ctx.is(user) || user.isBot) then fuccess(Forbidden)
      else env.insight.api.indexAll(user, force = byMod).inject(Ok)

  def index(username: UserStr) = Open: ctx ?=>
    Accessible(username): user =>
      val defaultMetric: InsightMetric =
        if env.noSweat.enabled then InsightMetric.Result
        else if isGrantedOpt(_.SeeInsight) then InsightMetric.MeanCpl
        else InsightMetric.MeanAccuracy
      negotiate(
        html = doPath(user, defaultMetric.key, InsightDimension.Perf.key, ""),
        json = env.insight.api.userStatus(user).map { status =>
          Ok(Json.obj("status" -> status.toString))
        }
      )

  def path(username: UserStr, metric: String, dimension: String, filters: String) = Open:
    Accessible(username): user =>
      val decoded = ~lila.common.String.decodeUriPath(filters)
      val question = env.insight.jsonView.question(metric, dimension, decoded).as[lila.insight.JsonQuestion]
      if env.noSweat.enabled && !NoSweatInsights.accepts(question) then
        NotImplemented.page(views.noSweatUnsupported())
      else doPath(user, metric, dimension, decoded)

  private def doPath(user: lila.user.User, metric: String, dimension: String, filters: String)(using
      Context
  ) =
    import lila.insight.InsightApi.UserStatus.*
    env.insight.api
      .userStatus(user)
      .flatMap:
        case NoGame => Ok.page(views.site.message.insightNoGames(user))
        case Empty => Ok.page(views.insight.empty(user))
        case s =>
          for
            insightUser <- env.insight.api.insightUser(user)
            prefId <- env.insight.share.getPrefId(user)
            page <- renderPage:
              views.insight.index(
                u = user,
                insightUser = insightUser,
                prefId = prefId,
                ui =
                  val raw = env.insight.jsonView
                    .ui(insightUser.families, insightUser.openings, asMod = isGrantedOpt(_.ViewBlurs))
                  if env.noSweat.enabled then NoSweatInsights.ui(raw) else raw
                ,
                question = env.insight.jsonView.question(metric, dimension, filters),
                stale = s == Stale
              )
          yield Ok(page)

  def json(username: UserStr) =
    OpenOrScopedBody(parse.json)(): ctx ?=>
      AccessibleApi(username) { processQuestion(_, ctx.body) }

  private def processQuestion(user: lila.user.User, body: Request[JsValue])(using Translate) =
    if !lila.insight.JsonQuestion.isValid(body.body)
    then BadRequest.toFuccess
    else
      body.body
        .validate[lila.insight.JsonQuestion]
        .fold(
          err => BadRequest(jsonError(err.toString)).toFuccess,
          raw =>
            if env.noSweat.enabled && !NoSweatInsights.accepts(raw) then
              fuccess(JsonBadRequest(lila.core.i18n.I18nKey("muteNotYetSupported").txt()))
            else
              raw.question.fold(BadRequest.toFuccess): q =>
                env.insight.api
                  .ask(q, user)
                  .flatMap(
                    lila.insight.InsightChart.fromAnswer(env.user.lightUser, focused = env.noSweat.enabled)
                  )
                  .map(chart => if env.noSweat.enabled then NoSweatInsights.chart(chart) else chart)
                  .map(env.insight.jsonView.chartWrites.writes)
                  .map { Ok(_) }
        )

  private def Accessible(username: UserStr)(f: lila.user.User => Fu[Result])(using Context) =
    isAccessible(username)(f, u => Forbidden.page(views.insight.forbidden(u)))

  private def AccessibleApi(username: UserStr)(f: lila.user.User => Fu[Result])(using Context) =
    isAccessible(username)(f, _ => Forbidden)

  private def isAccessible(
      username: UserStr
  )(f: lila.user.User => Fu[Result], fallback: lila.user.User => Fu[Result])(using Context): Fu[Result] =
    Found(meOrFetch(username)): u =>
      env.insight.share
        .grant(u)
        .flatMap:
          if _ then f(u)
          else fallback(u)
