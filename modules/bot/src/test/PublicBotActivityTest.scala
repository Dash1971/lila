package lila.bot

import lila.core.perf.PerfKey

class PublicBotActivityTest extends munit.FunSuite:
  test("ordinary Maia games share twenty slots"):
    assertEquals(PublicBotActivity.capacity, 20)
  test("background games top up to five total games, including every human game"):
    for human <- 0 to 20; automatic <- 0 to 5 do
      val total = human + automatic
      assertEquals(PublicBotActivity.canAdmit(false, automatic, total), total < 5)
  test("human arrivals let background games drain, and quiet periods replenish them"):
    assert(!PublicBotActivity.canAdmit(false, 5, 8))
    assert(!PublicBotActivity.canAdmit(false, 2, 5))
    assert(PublicBotActivity.canAdmit(false, 1, 4))
    assert(PublicBotActivity.canAdmit(false, 0, 3))
    assert(!PublicBotActivity.canAdmit(false, 0, 5))
  test("manual pause prevents replenishment at every occupancy without touching existing games"):
    for automatic <- 0 to 5; total <- automatic to 25 do
      assert(!PublicBotActivity.canAdmit(true, automatic, total))
    assert(PublicBotActivity.canAdmit(false, 0, 0))
  test("successful admissions alternate native Blitz and Rapid independent of completion order"):
    assertEquals(
      (0L until 6L).map(PublicBotActivity.speed).toList,
      List(PerfKey.blitz, PerfKey.rapid, PerfKey.blitz, PerfKey.rapid, PerfKey.blitz, PerfKey.rapid)
    )
