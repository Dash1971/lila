package lila.app
package http

import play.api.http.{ DefaultHttpRequestHandler, HttpConfiguration, HttpErrorHandler }
import play.api.mvc.{ ControllerComponents, EssentialFilter, Handler, Results }
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

  override def routeRequest(request: Req): Option[Handler] =
    if noSweatEnabled && request.method == "GET" && request.path == "/signup" then
      Some(controllerComponents.actionBuilder(_ => Results.Redirect("/login")))
    else if noSweatEnabled && (request.path == "/swag" || request.path == "/variant" || request.path
        .startsWith("/variant/"))
    then Some(controllerComponents.actionBuilder(_ => Results.NotFound))
    else if noSweatEnabled && request.method == "POST" &&
      (request.path == "/login" || request.path.startsWith("/signup") ||
        (request.path.startsWith("/setup/") && request.path != "/setup/friend") || request.path.startsWith(
          "/api/challenge"
        ) ||
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

  override protected def filterHandler(request: Req, handler: Handler): Handler =
    // Generated Liplay routes supply ActionName before filtering. Preserve native
    // untagged fallback/error/OPTIONS handlers, including their status semantics.
    val blocked = noSweatEnabled && request.attrs
      .get(Router.Attrs.ActionName)
      .exists: action =>
        !NoSweatFeatures.allows(request.method, request.path, action)
    super.filterHandler(
      request,
      if blocked then controllerComponents.actionBuilder(_ => Results.NotFound) else handler
    )

  // should be handled by nginx in production
  private val optionsHandler =
    controllerComponents.actionBuilder: (req: Req) =>
      if lila.common.HTTPRequest.isApiOrApp(req)
      then Results.NoContent.withHeaders(optionsHeaders*)
      else Results.NotFound
