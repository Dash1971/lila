package lila.app

/** Fixed event roster selected by earned native rating, never model input. */
private[app] object NoSweatArenaRoster:
  def select(
      candidates: List[(UserId, Int)],
      minRating: Int = 1400,
      maxRating: Int = 1700,
      count: Int = 10
  ): List[UserId] =
    if count <= 0 then Nil
    else
      val center = (minRating + maxRating) / 2
      val targets = center :: (1 until count).toList.map: index =>
        val offset = ((index + 1) / 2) * (maxRating - minRating) / count
        center + (if index % 2 == 1 then -offset else offset)
      targets.foldLeft(List.empty[UserId]): (selected, rating) =>
        candidates
          .filter((id, r) => !selected.contains(id) && r >= minRating && r <= maxRating)
          .sortBy((id, r) => (math.abs(r - rating), id.value))
          .headOption
          .fold(selected)(entry => selected :+ entry._1)
