package lila.app

final case class NoSweatStudyPlan(
    key: String,
    stages: List[(Int, Int)],
    workers: Int,
    maximumAdmitted: Int = 100
):
  def maximumConcurrency = stages.last._2
  def capacity(completed: Int): Int =
    require(completed >= 0)
    stages.takeWhile(_._1 <= completed).last._2
  def ratingEstablishment = key == "rating-establishment-v1"
  def establishmentScope(run: String, publicRatings: Boolean, started: Long): Boolean =
    ratingEstablishment &&
      run == (if publicRatings then "r20261031n163" else "q20261031n163") &&
      started >= NoSweatStudyPlan.establishmentStart &&
      started < NoSweatStudyPlan.establishmentAdmissionEnd
  def establishmentAdmission(now: Long, started: Long, admitted: Int): Boolean =
    ratingEstablishment && started >= NoSweatStudyPlan.establishmentStart &&
      now >= started && now < NoSweatStudyPlan.establishmentAdmissionEnd &&
      admitted >= 0 && admitted < maximumAdmitted

object NoSweatStudyPlan:
  val establishmentStart = java.time.Instant.parse("2026-10-31T13:30:00Z").toEpochMilli
  val establishmentAdmissionEnd = java.time.Instant.parse("2026-10-31T21:00:00Z").toEpochMilli
  val establishmentDeadline = java.time.Instant.parse("2026-10-31T21:30:00Z").toEpochMilli
  private val plans = List(
    NoSweatStudyPlan("pilot-10-v1", List(0 -> 1, 5 -> 2, 10 -> 5, 20 -> 10), 1),
    NoSweatStudyPlan("ramp-22-v1", List(0 -> 10, 10 -> 15, 25 -> 20, 40 -> 22), 2),
    NoSweatStudyPlan("calibration-200-v1", List(0 -> 22), 2, 200),
    NoSweatStudyPlan("strength-predictor-v1", List(0 -> 10, 10 -> 15, 25 -> 22), 2, 3000),
    NoSweatStudyPlan("strength-validation-continuation-v1", List(0 -> 22), 2, 3000),
    NoSweatStudyPlan("rating-establishment-v1", List(0 -> 22), 2, 3000)
  )
  def find(key: String): Option[NoSweatStudyPlan] = plans.find(_.key == key)
