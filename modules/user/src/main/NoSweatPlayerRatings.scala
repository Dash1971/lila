package lila.user

object NoSweatPlayerRatings:
  def distribution(ratings: List[Int]): List[Int] =
    val counts = ratings.groupMapReduce(r => r.max(400).min(4000) / 25 * 25)(_ => 1)(_ + _)
    (400 to 4000 by 25).map(r => counts.getOrElse(r, 0)).toList
