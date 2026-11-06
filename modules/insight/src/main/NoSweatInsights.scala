package lila.insight

import play.api.libs.json.*

import lila.core.i18n.{ I18nKey, Translate }

/** The focused site exposes native game/result analytics, without requiring engine analysis. */
object NoSweatInsights:
  val metrics = Set("result", "ratingDiff", "opponentRating")
  val dimensions = Set("date", "variant", "color", "openingFamily", "openingVariation", "result")
  val filterDimensions = dimensions - "date" + "period"
  val speeds = Set("ultraBullet", "bullet", "blitz", "rapid", "classical", "correspondence")

  def accepts(q: JsonQuestion): Boolean =
    metrics(q.metric) && dimensions(q.dimension) && q.filters.keySet.subsetOf(filterDimensions) &&
      q.filters.get("variant").forall(_.forall(speeds))

  def text(key: String)(using Translate): String = I18nKey(s"muteInsight$key").txt()

  private val names = Map(
    "Game result" -> "Result",
    "Rating gain" -> "RatingGain",
    "Opponent rating" -> "OpponentRating",
    "Date" -> "Date",
    "Variant" -> "TimeControl",
    "Color" -> "Color",
    "Opening Family" -> "OpeningFamily",
    "Opening family" -> "OpeningFamily",
    "Opening" -> "Opening",
    "Opening Variation" -> "Opening",
    "Opening variation" -> "Opening",
    "Victory" -> "Victory",
    "Draw" -> "Draw",
    "Defeat" -> "Defeat",
    "White" -> "White",
    "Black" -> "Black",
    "white" -> "White",
    "black" -> "Black",
    "Number of games" -> "NumberGames"
  )
  def label(value: String)(using Translate): String = names.get(value).fold(value)(text)

  def ui(raw: JsObject)(using Translate): JsObject =
    def categories(field: String, allowed: Set[String]): JsArray =
      val items = (raw \ field)
        .as[JsArray]
        .value
        .toList
        .flatMap(c => (c \ "items").as[List[JsObject]])
        .filter(i => allowed((i \ "key").as[String]))
        .map: item =>
          val key = (item \ "key").as[String]
          val descriptionKey = key match
            case "variant" => "TimeControl"
            case "openingFamily" => "OpeningFamily"
            case "openingVariation" => "Opening"
            case "opponentRating" => "OpponentRating"
            case "ratingDiff" => "RatingGain"
            case "period" | "date" => "Date"
            case "color" => "Color"
            case _ => "Result"
          val translated = item ++ Json.obj(
            "name" -> label((item \ "name").as[String]),
            "description" -> text(s"${descriptionKey}Help")
          )
          (item \ "values")
            .asOpt[List[JsObject]]
            .fold(translated): values =>
              translated ++ Json.obj(
                "values" -> values
                  .filter(v => key != "variant" || speeds((v \ "key").as[String]))
                  .map: v =>
                    val name = if key == "period" then
                      if (v \ "key").as[String] == "1" then text("LastDay")
                      else I18nKey("muteInsightLastDays").txt((v \ "key").as[String])
                    else label((v \ "name").as[String])
                    v ++ Json.obj("name" -> name)
              )
      Json.arr(Json.obj("name" -> text("Games"), "items" -> items))
    Json.obj(
      "dimensionCategs" -> categories("dimensionCategs", dimensions + "period"),
      "metricCategs" -> categories("metricCategs", metrics),
      "focused" -> true
    )

  val clientKeys = List(
    "Title",
    "Short",
    "Presets",
    "Filters",
    "Clear",
    "Definitions",
    "By",
    "Unavailable",
    "NoData",
    "Invalid",
    "SampleGames",
    "NewGames",
    "Update",
    "SharedNobody",
    "SharedFriends",
    "SharedEverybody",
    "BasicNotice",
    "SelectAll",
    "AllSelected",
    "CountSelected",
    "NoMatches",
    "OpeningPreset",
    "ColorPreset",
    "RatingPreset",
    "Victory",
    "Draw",
    "Defeat"
  )
  def clientText(using Translate): JsObject =
    JsObject(clientKeys.map(k => k -> JsString(text(k))))

  def chart(value: InsightChart)(using Translate): InsightChart = value.copy(
    xAxis = value.xAxis.copy(
      name = label(value.xAxis.name),
      categories = value.xAxis.categories.map:
        case JsString(s) => JsString(label(s))
        case v => v
    ),
    valueYaxis = value.valueYaxis.copy(name = label(value.valueYaxis.name)),
    sizeYaxis = value.sizeYaxis.copy(name = label(value.sizeYaxis.name)),
    series = value.series.map(s => s.copy(name = label(s.name))),
    sizeSerie = value.sizeSerie.copy(name = label(value.sizeSerie.name))
  )
