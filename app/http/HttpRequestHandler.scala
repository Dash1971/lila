package lila.app
package http

import play.api.http.{ DefaultHttpRequestHandler, HttpConfiguration, HttpErrorHandler }
import play.api.mvc.{ BodyParsers, ControllerComponents, EssentialFilter, Handler, Results }
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
    if noSweatEnabled && (request.method == "GET" || request.method == "HEAD") && request.path == "/signup"
    then Some(controllerComponents.actionBuilder(_ => Results.Redirect("/login")))
    else if noSweatEnabled && (request.path == "/swag" || request.path == "/variant" || request.path
        .startsWith("/variant/"))
    then Some(controllerComponents.actionBuilder(_ => Results.NotFound))
    else if noSweatEnabled && NoSweatFeatures.poolOnlyPost(request.method, request.path)
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
    val blocked = noSweatEnabled && !NoSweatFeatures.allowsTagged(
      request.method,
      request.path,
      request.attrs.get(Router.Attrs.ActionName)
    )
    val checked =
      if blocked then
        controllerComponents.actionBuilder.async(BodyParsers.utils.empty)(req =>
          errorHandler.onClientError(req, 404)
        )
      else handler
    super.filterHandler(request, checked)

  // should be handled by nginx in production
  private val optionsHandler =
    controllerComponents.actionBuilder: (req: Req) =>
      if lila.common.HTTPRequest.isApiOrApp(req)
      then Results.NoContent.withHeaders(optionsHeaders*)
      else Results.NotFound
