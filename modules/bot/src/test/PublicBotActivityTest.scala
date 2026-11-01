package lila.bot

import lila.core.perf.PerfKey

class PublicBotActivityTest extends munit.FunSuite:
  test("five background games share ten total slots, preserving room for human admissions"):
    assert(PublicBotActivity.canAdmit(false, 4, 9))
    assert(!PublicBotActivity.canAdmit(false, 5, 5))
    assert(!PublicBotActivity.canAdmit(false, 4, 10))
    assert(!PublicBotActivity.canAdmit(false, 0, 10))
  test("manual pause prevents replenishment at every occupancy without touching existing games"):
    for automatic <- 0 to 5; total <- automatic to 10 do
      assert(!PublicBotActivity.canAdmit(true, automatic, total))
    assert(PublicBotActivity.canAdmit(false, 0, 0))
  test("successful admissions alternate native Blitz and Rapid independent of completion order"):
    assertEquals(
      (0L until 6L).map(PublicBotActivity.speed).toList,
      List(PerfKey.blitz, PerfKey.rapid, PerfKey.blitz, PerfKey.rapid, PerfKey.blitz, PerfKey.rapid)
    )
