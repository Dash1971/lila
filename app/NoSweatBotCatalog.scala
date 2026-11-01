package lila.app

import play.api.libs.json.*
import lila.core.perf.{ Perf, PerfKey }

/** Initialization of assigned bot priors; native Glicko and earned counts remain unchanged. */
private[app] object NoSweatBotCatalog:
  val speeds = List(
    PerfKey.ultraBullet,
    PerfKey.bullet,
    PerfKey.blitz,
    PerfKey.rapid,
    PerfKey.classical,
    PerfKey.correspondence
  )

  def assigned(bot: JsObject): Boolean = (bot \ "rating_assignment").asOpt[JsObject].isDefined

  def validate(roster: List[JsObject]): List[JsObject] =
    val ids = roster.map(bot => (bot \ "id").as[String])
    val names = roster.map(bot => (bot \ "username").as[String].toLowerCase)
    require(roster.nonEmpty && roster.size <= 10000, "Invalid managed bot population size")
    require(ids.forall(_.nonEmpty) && ids.distinct.size == roster.size, "Duplicate managed bot IDs")
    require(names.forall(_.nonEmpty) && names.distinct.size == roster.size, "Duplicate bot usernames")
    roster.foreach: bot =>
      if assigned(bot) then
        require(validDisplayName((bot \ "name").as[String]), "Invalid catalog public name")
        require((bot \ "rating_assignment" \ "schema").as[Int] == 1, "Unknown catalog assignment")
        require((bot \ "rating_assignment" \ "gameCount").as[Int] == 0, "Assigned games must remain zero")
      speeds.foreach: speed =>
        val config = prior(bot, speed)
        val rating = (config \ "initial_rating").as[Double]
        val rd = (config \ "initial_rd").as[Double]
        require(java.lang.Double.isFinite(rating) && rating >= 400 && rating < 4000, "Invalid bot rating")
        require(java.lang.Double.isFinite(rd) && rd > 0 && rd <= 500, "Invalid bot rating deviation")
        if assigned(bot) then
          require((bot \ "ratings" \ speed.value).asOpt[JsObject].isDefined, "Missing assigned speed")
          require(rd == 100, "Assigned catalog ratings require the reviewed initial RD")
    roster

  def prior(bot: JsObject, speed: PerfKey): JsValue =
    (bot \ "ratings" \ speed.value)
      .asOpt[JsObject]
      .getOrElse:
        (bot \ "ratings" \ (if speed == PerfKey.classical || speed == PerfKey.correspondence then "rapid"
                            else "blitz")).as[JsObject]

  def seededPerf(bot: JsObject, speed: PerfKey): Perf =
    val config = prior(bot, speed)
    lila.rating.Perf.default.copy(
      glicko = new chess.rating.glicko.Glicko(
        (config \ "initial_rating").as[Double],
        (config \ "initial_rd").as[Double],
        0.09
      ),
      latest = nowInstant.some
    )

  def initialIdentity(bot: JsObject): Option[String] =
    Option.when(assigned(bot))((bot \ "id").as[String])

  def reusable(bot: JsObject, existing: Boolean, registeredIdentity: Option[String]): Boolean =
    !assigned(bot) || !existing || registeredIdentity.contains((bot \ "id").as[String])

  def aliases(input: Map[String, String], roster: List[JsObject]): Map[String, String] =
    val names = roster.map(bot => (bot \ "username").as[String].toLowerCase).toSet
    val aliases = input.map((username, value) => username.toLowerCase -> value)
    require(aliases.size == input.size, "Duplicate case-insensitive bot aliases")
    require(aliases.values.map(_.toLowerCase).toSet.size == aliases.size, "Duplicate public bot aliases")
    aliases.foreach: (username, value) =>
      require(names(username) && username.matches("signal(train|test)[0-9]+"), "Unapproved bot alias target")
      require(validDisplayName(value), "Invalid public bot alias")
    aliases

  def validDisplayName(value: String): Boolean =
    value.length >= 3 && value.length <= 20 && value == value.trim &&
      value.forall(c => c.isLetterOrDigit || " ._-'".contains(c))

  def publicName(bot: JsObject, aliases: Map[String, String]): Option[String] =
    if assigned(bot) then (bot \ "name").asOpt[String]
    else aliases.get((bot \ "username").as[String].toLowerCase)

  def aliasEligible(current: Option[String], username: String, alias: String): Boolean =
    current.isEmpty || current.contains(username) || current.contains(alias)
