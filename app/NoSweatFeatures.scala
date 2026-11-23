package lila.app

import java.util.regex.Pattern
import play.api.libs.json.{ JsObject, Json }

/** Reviewed routes only: an upstream action is hidden until explicitly admitted. */
private[app] object NoSweatFeatures:
  private val source = Option(getClass.getResourceAsStream("/noSweatFeatures.json"))
    .getOrElse(throw IllegalStateException("Missing Mute feature allowlist"))
  private val policy = try Json.parse(source)
  finally source.close()
  require((policy \ "schema").as[Int] == 1, "Invalid Mute feature allowlist")
  private val routes = (policy \ "routes")
    .as[List[JsObject]]
    .map: row =>
      (
        (row \ "method").as[String],
        (row \ "action").as[String],
        Pattern.compile((row \ "pattern").as[String])
      )
  require(routes.nonEmpty, "Empty Mute feature allowlist")

  def allows(method: String, path: String, action: String): Boolean =
    val verb = if method == "HEAD" then "GET" else method
    routes.exists: (allowedMethod, allowedAction, pattern) =>
      verb == allowedMethod && action == allowedAction && pattern.matcher(path).matches()

  // These are owned by HttpRequestHandler itself, before generated routing.
  def poolOnlyPost(method: String, path: String): Boolean =
    method == "POST" && (
      path == "/login" || path.startsWith("/signup") ||
        (path.startsWith("/setup/") && path != "/setup/friend") ||
        path.startsWith("/api/challenge") || path == "/api/bot/account/upgrade"
    )

  def allowsTagged(method: String, path: String, action: Option[String]): Boolean =
    action.fold(
      method == "OPTIONS" || ((method == "GET" || method == "HEAD") && path == "/signup") ||
        poolOnlyPost(method, path)
    )(allows(method, path, _))
