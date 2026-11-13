package lila.tournament

/** Per-event filler settings; human participation never has a cap. */
case class NoSweatArenaSettings(minRating: Int = 1400, maxRating: Int = 1700, target: Int = 10):
  def valid = minRating >= 400 && maxRating <= 3200 && minRating <= maxRating && target >= 1 && target <= 20
  def accepts(rating: Int) = rating >= minRating && rating <= maxRating

object NoSweatArenaSettings:
  val default = NoSweatArenaSettings()
  val formMapping =
    import play.api.data.Forms.*
    mapping(
      "minRating" -> number(min = 400, max = 3200),
      "maxRating" -> number(min = 400, max = 3200),
      "target" -> number(min = 1, max = 20)
    )(NoSweatArenaSettings.apply)(s => Some((s.minRating, s.maxRating, s.target)))
      .verifying("muteArenaRangeInvalid", s => s.minRating <= s.maxRating)
