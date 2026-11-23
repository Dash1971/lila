package lila.app

import java.nio.file.{ Files, Path }
import play.api.libs.json.*
import lila.core.perf.{ Perf, PerfKey }

/** Initialization of assigned bot priors; native Glicko and earned counts remain unchanged. */
private[app] object NoSweatBotCatalog:
  def load(rosterPath: Path, aliasesPath: Path): (List[JsObject], Map[String, String]) =
    val roster = validate(Json.parse(Files.readString(rosterPath)).as[List[JsObject]])
    val names = aliases(Json.parse(Files.readString(aliasesPath)).as[Map[String, String]], roster)
    roster -> names

  val customFlairs = Vector(
    "symbols.mute-circuit-knight",
    "symbols.mute-synthetic-eye",
    "symbols.mute-neural-chip",
    "symbols.mute-neon-fox",
    "symbols.mute-origami-crane",
    "symbols.mute-ghost-terminal"
  )

  val flairs = customFlairs ++ Vector(
    "smileys.robot",
    "smileys.alien",
    "smileys.alien-monster",
    "objects.desktop-computer",
    "objects.computer-disk",
    "objects.floppy-disk",
    "objects.satellite-antenna",
    "objects.gear",
    "objects.shield",
    "activity.joystick",
    "objects.electric-plug",
    "objects.battery",
    "objects.key",
    "objects.locked",
    "symbols.antenna-bars",
    "symbols.infinity"
  )

  def featuredFlair(bot: JsObject, aliases: Map[String, String]): Boolean =
    val username = (bot \ "username").as[String].toLowerCase
    (bot \ "name_reference").asOpt[String].isDefined ||
    (bot \ "homage").asOpt[String].isDefined || aliases.contains(username) ||
    (!assigned(bot) && !username.matches("signal(train|test)[0-9]+"))

  def chooseFlair(bot: JsObject, aliases: Map[String, String]): String =
    if (bot \ "username").as[String].equalsIgnoreCase("Wintermute") then "symbols.mute-circuit-knight"
    else
      val choices = if featuredFlair(bot, aliases) then customFlairs else flairs
      choices(scala.util.Random.nextInt(choices.size))

  private val locations = Vector(
    "Night City",
    "Chiba City",
    "Neo-Tokyo",
    "The Sprawl",
    "Freeside Orbital",
    "Ceres Station",
    "Tycho Station",
    "The Belt",
    "Ghost Sector Seven",
    "Neon Bazaar",
    "Low Orbit",
    "Simstim Alley",
    "Relay Station Zero",
    "Black ICE Frontier",
    "Outer Rim",
    "Neon Rain District"
  )

  def chooseLocation(bot: JsObject, aliases: Map[String, String]): String =
    val username = (bot \ "username").as[String].toLowerCase
    val name = aliases
      .get(username)
      .orElse((bot \ "name").asOpt[String])
      .getOrElse(username)
      .toLowerCase
      .replaceAll("[^a-z0-9]", "")
    name match
      case "wintermute" => "Villa Straylight, Freeside"
      case "neuromancer" => "Freeside construct"
      case "hal9000" => "Discovery One, Jupiter transit"
      case "judgedredd" | "judgeanderson" | "walterwobot" => "Mega-City One"
      case "judgedeath" | "judgefear" | "judgefire" | "judgemortis" => "Deadworld"
      case "pris" | "roybatty" | "rachael" | "eldontyrell" | "leon" | "gaff" | "rickdeckard" =>
        "Los Angeles, 2019"
      case "officerk" => "Los Angeles, 2049"
      case "case" | "molly" => "Chiba City"
      case "armitage" | "johnashpool" | "mariefrancetessier" => "The Sprawl"
      case "johnnysilverhand" | "altcunningham" | "rogueamendiares" | "judyalvarez" | "gorotakemura" |
          "jackiewelles" | "viktorvektor" | "davidmartinez" | "lucy" | "hideo" =>
        "Night City"
      case "panampalmer" => "Badlands, outside Night City"
      case "songbird" | "solomonreed" => "Dogtown, Night City"
      case "durandal" => "UESC Marathon, Tau Ceti"
      case "shodan" => "Citadel Station"
      case "glados" => "Aperture Science"
      case "joshua" => "Cheyenne Mountain"
      case "mycroft" => "Luna City"
      case "deepthought" => "Magrathea"
      case "colossus" => "Colossus Control Complex"
      case "skynet" => "Cyberdyne Systems"
      case _ =>
        val themed =
          if List("ghost", "shade", "phantom", "null", "void").exists(name.contains) then
            Vector("Ghost Sector Seven", "Black ICE Frontier", "The Sprawl")
          else if List("signal", "relay", "orbit", "echo").exists(name.contains) then
            Vector("Relay Station Zero", "Freeside Orbital", "Low Orbit")
          else if List("neon", "chrome", "circuit", "byte", "kernel", "metro").exists(name.contains) then
            Vector("Night City", "Neo-Tokyo", "Neon Rain District", "Neon Bazaar")
          else locations
        themed(scala.util.Random.nextInt(themed.size))

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
    val names = roster
      .filter(bot =>
        assigned(bot) || (bot \ "username").as[String].toLowerCase.matches("signal(train|test)[0-9]+")
      )
      .map(bot => (bot \ "username").as[String].toLowerCase)
      .toSet
    val aliases = input.map((username, value) => username.toLowerCase -> value)
    require(aliases.size == input.size, "Duplicate case-insensitive bot aliases")
    require(aliases.values.map(_.toLowerCase).toSet.size == aliases.size, "Duplicate public bot aliases")
    aliases.foreach: (username, value) =>
      require(names(username), "Unapproved bot alias target")
      require(validDisplayName(value), "Invalid public bot alias")
    aliases

  def validDisplayName(value: String): Boolean =
    value.length >= 3 && value.length <= 20 && value == value.trim &&
      value.forall(c => c.isLetterOrDigit || " ._-'".contains(c))

  def publicName(bot: JsObject, aliases: Map[String, String]): Option[String] =
    aliases
      .get((bot \ "username").as[String].toLowerCase)
      .orElse(Option.when(assigned(bot))((bot \ "name").as[String]))

  def aliasEligible(
      current: Option[String],
      username: String,
      alias: String,
      originalDisplayName: Option[String] = None
  ): Boolean =
    current.isEmpty || current.contains(username) || current.contains(alias) || current.exists(
      originalDisplayName.contains
    )
