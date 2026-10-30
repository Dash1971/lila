package lila.app

final case class NoSweatStudyPlan(key: String, stages: List[(Int, Int)], workers: Int):
  def maximumConcurrency = stages.last._2
  def capacity(completed: Int): Int =
    require(completed >= 0)
    stages.takeWhile(_._1 <= completed).last._2

object NoSweatStudyPlan:
  private val plans = List(
    NoSweatStudyPlan("pilot-10-v1", List(0 -> 1, 5 -> 2, 10 -> 5, 20 -> 10), 1),
    NoSweatStudyPlan("ramp-22-v1", List(0 -> 10, 10 -> 15, 25 -> 20, 40 -> 22), 2)
  )
  def find(key: String): Option[NoSweatStudyPlan] = plans.find(_.key == key)
