package lila.app
package http

import play.api.http.{ DefaultHttpRequestHandler, HttpConfiguration, HttpErrorHandler }
import play.api.mvc.{ ControllerComponents, EssentialFilter, Handler, RequestHeader, Results }
import play.api.routing.Router

final class HttpRequestHandler(
    router: Router,
    errorHandler: HttpErrorHandler,
    configuration: HttpConfiguration,
    filters: Seq[EssentialFilter],
    controllerComponents: ControllerComponents,
    noSweatEnabled: Boolean = false
) extends DefaultHttpRequestHandler(() => router, errorHandler, configuration, filters)
    with lila.web.ResponseHeaders:

  override def routeRequest(request: RequestHeader): Option[Handler] =
    if noSweatEnabled && request.method == "GET" && request.path == "/signup" then
      Some(controllerComponents.actionBuilder(_ => Results.Redirect("/login")))
    else if noSweatEnabled && request.method == "POST" &&
      (request.path == "/login" || request.path.startsWith("/signup") ||
        request.path.startsWith("/setup/") || request.path.startsWith("/api/challenge") ||
        request.path == "/api/bot/account/upgrade")
    then
      Some(
        controllerComponents.actionBuilder(_ =>
          Results.Forbidden("Use the playing pool; direct challenges are unavailable.")
        )
      )
    else if request.method == "OPTIONS"
    then optionsHandler.some
    else router.handlerFor(request)

  // should be handled by nginx in production
  private val optionsHandler =
    controllerComponents.actionBuilder: (req: RequestHeader) =>
      if lila.common.HTTPRequest.isApiOrApp(req)
      then Results.NoContent.withHeaders(optionsHeaders*)
      else Results.NotFound
