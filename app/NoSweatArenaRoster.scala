package lila.app

/** Fixed event roster selected by earned native rating, never model input. */
private[app] object NoSweatArenaRoster:
  def select(candidates: List[(UserId, Int)]): List[UserId] =
    val targets = List(1500, 1450, 1550, 1400, 1600, 1350, 1650, 1300, 1700, 1200)
    targets.foldLeft(List.empty[UserId]): (selected, rating) =>
      candidates
        .filter((id, r) => !selected.contains(id) && r >= 1200 && r <= 1700)
        .sortBy((id, r) => (math.abs(r - rating), id.value))
        .headOption
        .fold(selected)(entry => selected :+ entry._1)
