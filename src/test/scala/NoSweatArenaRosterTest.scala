package lila.app

class NoSweatArenaRosterTest extends munit.FunSuite:
  test("select ten distinct saved ratings in the requested band, centered within the configured band"):
    val candidates = (1100 to 1800 by 25).map(r => UserId(s"bot$r") -> r).toList
    val selected = NoSweatArenaRoster.select(candidates)
    assertEquals(selected.size, 10)
    assertEquals(selected.distinct.size, 10)
    assertEquals(selected.head, UserId("bot1550"))
    val ratings = candidates.toMap
    assert(selected.forall(id => ratings(id) >= 1400 && ratings(id) <= 1700))
  test("shortages do not create bots or expand the band"):
    val candidates = List(UserId("low") -> 1199, UserId("ok") -> 1500, UserId("high") -> 1701)
    assertEquals(NoSweatArenaRoster.select(candidates), List(UserId("ok")))

  test("custom narrow bands, roster size and human-only events never leak extra bots"):
    val candidates = (1000 to 2000 by 10).map(r => UserId(s"bot$r") -> r).toList
    val selected = NoSweatArenaRoster.select(candidates, 1500, 1550, 4)
    assertEquals(selected.size, 4)
    assertEquals(selected.distinct.size, 4)
    val ratings = candidates.toMap
    assert(selected.forall(id => ratings(id) >= 1500 && ratings(id) <= 1550))
    assertEquals(NoSweatArenaRoster.select(candidates, 1500, 1550, 0), Nil)
    assertEquals(NoSweatArenaRoster.select(candidates, 1501, 1509, 4), Nil)
